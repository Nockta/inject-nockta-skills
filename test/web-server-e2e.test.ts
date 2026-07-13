import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startWebWizardServer } from "../src/web/server.js";
import { buildWebSchema } from "../src/web/build-web-schema.js";
import { buildInstallResultFromAnswers } from "../src/web/run-web-install.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import type { WizardAnswers, WizardSchema } from "../src/wizard/core/types.js";

/**
 * End-to-end `--web` server test WITHOUT a real browser (decisions.md D30's proof-of-done): start
 * the server, GET the page with the token, POST a representative answers object, and prove the
 * submitted answers flow through `resolve()` + the existing install write path into a temp target.
 * Also proves the security posture: a bad/missing token is rejected on both GET and POST.
 */
const packsRoot = getPacksPath();

describe("web wizard server e2e (decisions.md D30)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-web-e2e-"));
  });
  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("binds loopback on a random port with a token URL", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{48}$/);
      expect(handle.port).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });

  it("GET / with the token serves the page embedding the schema sections", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    try {
      const res = await fetch(handle.url);
      expect(res.status).toBe(200);
      const html = await res.text();
      // schema is embedded; the section labels + token are present in the served page.
      expect(html).toContain("Common");
      expect(html).toContain('"repo-type"');
      expect(html).toContain('"razor"');
      expect(html).toContain(handle.token);
    } finally {
      await handle.close();
    }
  });

  it("rejects a GET with a missing/bad token (403)", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    try {
      const noToken = await fetch(`http://127.0.0.1:${handle.port}/`);
      expect(noToken.status).toBe(403);
      const badToken = await fetch(`http://127.0.0.1:${handle.port}/?t=deadbeef`);
      expect(badToken.status).toBe(403);
    } finally {
      await handle.close();
    }
  });

  it("rejects a POST /submit with a bad token (403) and does NOT resolve answers", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    let resolved = false;
    // attach a catch: close() in `finally` legitimately rejects this (Ctrl-C path) — we only care
    // that a BAD token never RESOLVED it.
    handle
      .waitForAnswers()
      .then(() => {
        resolved = true;
      })
      .catch(() => {});
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/submit?t=wrong`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "wrong", answers: { monorepo: false } }),
      });
      expect(res.status).toBe(403);
      // give any (incorrect) resolution a tick to have fired
      await new Promise((r) => setTimeout(r, 20));
      expect(resolved).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("POST /submit with the token hands back answers -> resolve() -> buildInstallResult writes files", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });

    const answers: WizardAnswers = {
      monorepo: false,
      repoTypes: ["next"],
      adapters: ["claude"],
      skills: { excluded: [], included: [] },
      razor: { excluded: [], included: [] },
      confirmed: true,
    };

    try {
      const answersPromise = handle.waitForAnswers();
      const res = await fetch(`http://127.0.0.1:${handle.port}/submit?t=${handle.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: handle.token, answers }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const received = await answersPromise;
      expect(received.repoTypes).toEqual(["next"]);
      expect(received.adapters).toEqual(["claude"]);
      expect(received.confirmed).toBe(true);

      // The exact tail the CLI wizard's confirm runs: resolve() -> buildInstallResult().
      const result = buildInstallResultFromAnswers(received, { targetDir, packsRoot });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.command).toBe("install");
      expect(result.data.renderedFileCount).toBeGreaterThan(0);
      expect(result.data.repoTypes).toEqual(["next"]);
      expect(result.data.adapters).toEqual(["claude"]);
      expect(existsSync(join(targetDir, ".claude"))).toBe(true);
      expect(existsSync(join(targetDir, ".nockta"))).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it("GET /schema re-derives the offering per repo type(s) (reactive Bug A fix)", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema, packsRoot, targetDir });
    try {
      // types=next -> common + next skills, razor category sections incl. Domain: Next.js
      const rNext = await fetch(`http://127.0.0.1:${handle.port}/schema?t=${handle.token}&types=next`);
      expect(rNext.status).toBe(200);
      const sNext = (await rNext.json()) as WizardSchema;
      const skillsNext = sNext.steps.find((s) => s.id === "skills")!;
      const razorNext = sNext.steps.find((s) => s.id === "razor")!;
      const packsNext = [...new Set((skillsNext.choices ?? []).map((c) => c.pack))];
      expect(packsNext).toContain("common");
      expect(packsNext).toContain("next");
      expect(packsNext).not.toContain("nest");
      const razorLabelsNext = (razorNext.sections ?? []).map((s) => s.label);
      expect(razorLabelsNext).toContain("Domain: Next.js");
      expect(razorLabelsNext).not.toContain("Domain: NestJS");

      // types=next,nest -> both packs + Domain: NestJS
      const rBoth = await fetch(`http://127.0.0.1:${handle.port}/schema?t=${handle.token}&types=next,nest`);
      expect(rBoth.status).toBe(200);
      const sBoth = (await rBoth.json()) as WizardSchema;
      const skillsBoth = sBoth.steps.find((s) => s.id === "skills")!;
      const razorBoth = sBoth.steps.find((s) => s.id === "razor")!;
      const packsBoth = [...new Set((skillsBoth.choices ?? []).map((c) => c.pack))];
      expect(packsBoth).toContain("next");
      expect(packsBoth).toContain("nest");
      const razorLabelsBoth = (razorBoth.sections ?? []).map((s) => s.label);
      expect(razorLabelsBoth).toContain("Domain: Next.js");
      expect(razorLabelsBoth).toContain("Domain: NestJS");

      // types= (empty) -> common-only, razor step gated off (every razor skill is applicability-gated)
      const rEmpty = await fetch(`http://127.0.0.1:${handle.port}/schema?t=${handle.token}&types=`);
      expect(rEmpty.status).toBe(200);
      const sEmpty = (await rEmpty.json()) as WizardSchema;
      const skillsEmpty = sEmpty.steps.find((s) => s.id === "skills")!;
      const razorEmpty = sEmpty.steps.find((s) => s.id === "razor");
      const packsEmpty = [...new Set((skillsEmpty.choices ?? []).map((c) => c.pack))];
      expect(packsEmpty).toEqual(["common"]);
      expect(razorEmpty).toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it("GET /schema re-resolves dependency locks against the live skill selection (grill-me off -> grilling released)", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema, packsRoot, targetDir });
    const findGrilling = (s: WizardSchema) =>
      s.steps.find((st) => st.id === "skills")!.choices!.find((c) => c.value === "grilling")!;
    try {
      // Default selection: default grill-me requires optional grilling, so grilling is locked-on.
      const rDefault = await fetch(
        `http://127.0.0.1:${handle.port}/schema?t=${handle.token}&types=next&adapters=claude,cursor,copilot,agent`,
      );
      const grillingDefault = findGrilling((await rDefault.json()) as WizardSchema);
      expect(grillingDefault.checked).toBe(true);
      expect(grillingDefault.disabled).toBe(true);
      expect(grillingDefault.disabledReason).toMatch(/needed by grill-me/);

      // grill-me toggled off (sent as the current `excluded` delta) -> grilling is RELEASED.
      const rOff = await fetch(
        `http://127.0.0.1:${handle.port}/schema?t=${handle.token}&types=next&adapters=claude,cursor,copilot,agent&excluded=grill-me`,
      );
      const grillingOff = findGrilling((await rOff.json()) as WizardSchema);
      expect(grillingOff.checked).toBe(false);
      expect(grillingOff.disabled).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("rejects a GET /schema with a bad/missing token (403)", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema, packsRoot, targetDir });
    try {
      const noToken = await fetch(`http://127.0.0.1:${handle.port}/schema?types=next`);
      expect(noToken.status).toBe(403);
      const badToken = await fetch(`http://127.0.0.1:${handle.port}/schema?t=deadbeef&types=next`);
      expect(badToken.status).toBe(403);
    } finally {
      await handle.close();
    }
  });

  it("close() before submit rejects the pending answers promise (Ctrl-C path)", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    const pending = handle.waitForAnswers();
    await handle.close();
    await expect(pending).rejects.toThrow(/closed before/);
  });

  it("rejects a zero-repo-type submit with 400 (mirrors the TTY wizard's cancel rule) and does NOT resolve answers", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    const handle = await startWebWizardServer({ schema });
    let resolved = false;
    handle
      .waitForAnswers()
      .then(() => {
        resolved = true;
      })
      .catch(() => {});
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/submit?t=${handle.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: handle.token,
          answers: { monorepo: false, repoTypes: [], adapters: ["claude"], confirmed: true },
        }),
      });
      expect(res.status).toBe(400);
      const j = (await res.json()) as { ok: boolean; error?: string };
      expect(j.ok).toBe(false);
      expect(j.error).toMatch(/project type/);
      await new Promise((r) => setTimeout(r, 20));
      expect(resolved).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("onSubmit truthfulness: a failed install responds ok:false (no false Done) and stays retryable; success resolves", async () => {
    const { schema } = buildWebSchema({ type: "next", packsRoot });
    // The REAL runWebInstall wiring: the install runs inside the submit handler.
    const handle = await startWebWizardServer({
      schema,
      onSubmit: (answers) => {
        const result = buildInstallResultFromAnswers(answers, { targetDir, packsRoot });
        return result.ok ? { ok: true } : { ok: false, error: result.summary };
      },
    });
    let resolved = false;
    handle
      .waitForAnswers()
      .then(() => {
        resolved = true;
      })
      .catch(() => {});
    const post = (answers: WizardAnswers) =>
      fetch(`http://127.0.0.1:${handle.port}/submit?t=${handle.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: handle.token, answers }),
      });
    try {
      // Empty adapters → the backend rejects ("missing required --adapters"). Before the fix the
      // server answered {ok:true} regardless and the page showed "Done" while nothing installed.
      const bad = await post({ monorepo: false, repoTypes: ["next"], adapters: [], confirmed: true });
      expect(bad.status).toBe(422);
      const badJson = (await bad.json()) as { ok: boolean; error?: string };
      expect(badJson.ok).toBe(false);
      expect(badJson.error).toMatch(/adapters/);
      expect(existsSync(join(targetDir, ".nockta"))).toBe(false); // nothing was written
      await new Promise((r) => setTimeout(r, 20));
      expect(resolved).toBe(false); // the flow did not proceed on failure

      // Corrected resubmit succeeds: real files land and the answers resolve.
      const good = await post({ monorepo: false, repoTypes: ["next"], adapters: ["claude"], confirmed: true });
      expect(good.status).toBe(200);
      expect(await good.json()).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(resolved).toBe(true);
      expect(existsSync(join(targetDir, ".nockta"))).toBe(true);
      expect(existsSync(join(targetDir, ".claude"))).toBe(true);
    } finally {
      await handle.close();
    }
  });
});
