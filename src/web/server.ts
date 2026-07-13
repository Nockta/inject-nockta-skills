import { createServer } from "node:http";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { WizardAnswers, WizardSchema } from "../wizard/core/types.js";
import { renderWizardPage } from "./page.js";
import { buildWebSchema } from "./build-web-schema.js";

/**
 * The local `--web` wizard HTTP server (decisions.md D30). Security, exactly as D30 mandates and
 * enforced here:
 *   - binds ONLY `127.0.0.1` (loopback — never reachable off-box);
 *   - listens on port `0` so the OS assigns a random free port (read back from `server.address()`);
 *   - carries a one-time cryptographically-random token in the URL — EVERY request (GET the page,
 *     POST the answers) must present the exact token or gets a 403, so no other local process that
 *     doesn't know the token can drive the endpoint.
 *
 * The flow is whole-form (NOT the step-by-step CLI Presenter/Controller): `GET /` serves the
 * self-contained page with the schema + token embedded; `POST /submit` validates the token, parses
 * the plain `WizardAnswers` body, validates it against the TTY wizard's cancel rules (zero repo
 * types / zero targets → 400), runs the caller's `onSubmit` (the REAL install) and responds with
 * its actual outcome — only a SUCCESSFUL submit resolves `waitForAnswers()`; a failed one leaves
 * the form retryable. One successful submit only — a later POST gets a 409.
 */
export interface WebWizardHandle {
  /** `http://127.0.0.1:<port>/?t=<token>` — hand this to the browser opener / print it. */
  url: string;
  port: number;
  token: string;
  /** Resolves with the submitted answers on the first valid POST; rejects if closed before then. */
  waitForAnswers(): Promise<WizardAnswers>;
  /** Stop listening. Rejects a still-pending `waitForAnswers()` (Ctrl-C / abort path). */
  close(): Promise<void>;
}

export interface StartServerOptions {
  schema: WizardSchema;
  /**
   * Derivation ctx the REACTIVE `GET /schema` endpoint re-invokes `buildWebSchema` with per request
   * (carried through from `run-web-install.ts`). `GET /` still serves the pre-built first-paint
   * `schema`; `/schema` recomputes the skills+razor offering for the checkbox state the page sends.
   * Absent (e.g. tests that only exercise `GET /`/`POST /submit`) → `/schema` derives from cwd.
   */
  targetDir?: string;
  packsRoot?: string;
  /** Test/override hook — defaults to `127.0.0.1`; never expose off-loopback. */
  host?: string;
  /** Test/override hook — defaults to the real page renderer. */
  renderPage?: (schema: WizardSchema, token: string) => string;
  /**
   * Runs the REAL install for a submitted answers object BEFORE the HTTP response is written, so
   * the browser learns the actual outcome (truthfulness fix — mirrors create's web server, which
   * runs its pipeline inside its submit handler and responds with the real result; inject used to
   * respond `{ok:true}` unconditionally and install after close, so a failed install still showed
   * the "Done" screen). `{ok:true}` → the page shows its done screen and `waitForAnswers()`
   * resolves; `{ok:false, error}` → the response carries the failure (the page shows it and
   * re-enables Confirm; the submit is NOT settled, so a corrected resubmit is allowed — the
   * install path is idempotent/overwrite-safe, same posture as repair/upgrade). Absent → the old
   * accept-and-resolve behavior (answers-transport-only callers, e.g. transport-focused tests).
   */
  onSubmit?: (answers: WizardAnswers) => Promise<SubmitOutcome> | SubmitOutcome;
}

/** The submit handler's verdict for one POSTed answers object — what the page renders from. */
export interface SubmitOutcome {
  ok: boolean;
  error?: string;
}

/** Hard cap on a POST body so a malformed/hostile client can't exhaust memory. */
const MAX_BODY_BYTES = 1_000_000;

/**
 * Mirror of the TTY wizard's cancel rules (`controller.ts`: zero repo types / zero targets →
 * cancel, never an install): a submitted answers object with nothing to install against is
 * rejected here with a clear reason — the CLI backend would only fail later with a flag-level
 * "missing required --type" after the page already claimed success. The page ALSO gates its
 * Confirm button on the same rule; this is the server-side belt to that client-side suspender.
 */
function validateAnswers(answers: WizardAnswers): string | null {
  if (answers.monorepo) {
    if (!answers.targets || answers.targets.length === 0) return "select at least one workspace package";
  } else {
    if (!answers.repoTypes || answers.repoTypes.length === 0) return "select at least one project type";
  }
  return null;
}

export function startWebWizardServer(opts: StartServerOptions): Promise<WebWizardHandle> {
  const host = opts.host ?? "127.0.0.1";
  const token = randomBytes(24).toString("hex");
  const render = opts.renderPage ?? renderWizardPage;
  const html = render(opts.schema, token);

  let resolveAnswers!: (a: WizardAnswers) => void;
  let rejectAnswers!: (e: Error) => void;
  const answersPromise = new Promise<WizardAnswers>((res, rej) => {
    resolveAnswers = res;
    rejectAnswers = rej;
  });
  // Keep the unconsumed rejection from crashing the process before the caller attaches `.catch`
  // via `waitForAnswers()`; the real handler is attached synchronously by the caller.
  answersPromise.catch(() => {});
  let settled = false;

  const server: Server = createServer((req, res) => {
    const parsedUrl = new URL(req.url ?? "/", `http://${host}`);
    const providedToken = parsedUrl.searchParams.get("t");

    if (req.method === "GET" && parsedUrl.pathname === "/") {
      if (providedToken !== token) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // REACTIVE re-derivation (the fix for "only Common" — Bug A). The page fetches this on every
    // repo-type/adapter toggle so the skills + razor offering tracks the checkbox state. Same
    // token gate as `GET /`. `types`/`adapters` are the CSV of currently-checked values;
    // `detect:false` makes the query authoritative (empty `types` -> common-only, never re-detect).
    if (req.method === "GET" && parsedUrl.pathname === "/schema") {
      if (providedToken !== token) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      try {
        const types = parsedUrl.searchParams.get("types") ?? "";
        const adapters = parsedUrl.searchParams.get("adapters") ?? "";
        // Current skill/razor selection (CSV of names) — carried so the re-derived skills+razor
        // offering resolves its dependency locks against the page's LIVE toggles: toggling the
        // forcing skill (`grill-me`) off releases the forced one (`grilling`) rather than leaving
        // it stale-locked. Absent (repo-type/adapter re-derive) → resets to the tier defaults.
        const csv = (name: string): string[] =>
          (parsedUrl.searchParams.get(name) ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const { schema } = buildWebSchema({
          type: types,
          adapters,
          excludeSkills: csv("excluded"),
          includeSkills: csv("included"),
          targetDir: opts.targetDir,
          packsRoot: opts.packsRoot,
          detect: false,
        });
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(schema));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
      }
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/submit") {
      let body = "";
      let aborted = false;
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8");
        if (body.length > MAX_BODY_BYTES) {
          aborted = true;
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "payload too large" }));
          req.destroy();
        }
      });
      req.on("end", () => {
        if (aborted) return;
        let parsed: { token?: string; answers?: WizardAnswers } | null = null;
        try {
          parsed = JSON.parse(body) as { token?: string; answers?: WizardAnswers };
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid JSON body" }));
          return;
        }
        const bodyToken = providedToken ?? parsed?.token;
        if (bodyToken !== token) {
          res.writeHead(403, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "forbidden" }));
          return;
        }
        const answers = (parsed?.answers ?? { monorepo: opts.schema.monorepo }) as WizardAnswers;
        const invalid = validateAnswers(answers);
        if (invalid) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: invalid }));
          return;
        }
        if (settled) {
          // One successful submit only — a second POST is rejected (mirrors create's server).
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "already submitted" }));
          return;
        }
        if (!opts.onSubmit) {
          // Transport-only mode: accept and hand the answers to the caller (legacy behavior).
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          settled = true;
          resolveAnswers(answers);
          return;
        }
        // Truthful mode: run the install NOW and answer with its real outcome. A failure leaves
        // the submit unsettled so the user can correct the form and try again.
        Promise.resolve()
          .then(() => opts.onSubmit!(answers))
          .then((outcome) => {
            if (outcome.ok) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
              settled = true;
              resolveAnswers(answers);
            } else {
              res.writeHead(422, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: outcome.error ?? "install failed" }));
            }
          })
          .catch((error: Error) => {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: error.message }));
          });
      });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  return new Promise<WebWizardHandle>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      const url = `http://${host}:${port}/?t=${token}`;
      resolve({
        url,
        port,
        token,
        waitForAnswers: () => answersPromise,
        close: () =>
          new Promise<void>((done) => {
            if (!settled) {
              settled = true;
              rejectAnswers(new Error("server closed before the browser submitted"));
            }
            server.close(() => done());
          }),
      });
    });
  });
}
