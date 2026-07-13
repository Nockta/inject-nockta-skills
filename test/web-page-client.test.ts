import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWizardPage } from "../src/web/page.js";
import { buildWebSchema } from "../src/web/build-web-schema.js";
import { buildInstallResultFromAnswers } from "../src/web/run-web-install.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import type { WizardAnswers } from "../src/wizard/core/types.js";

/**
 * The `--web` page's CLIENT JS, driven headlessly (proof-of-done for the "phantom grilling"
 * client-side delta leak): the inline script is extracted from `renderWizardPage()`'s output and
 * run in a `node:vm` context against a minimal DOM stub — real page logic, no browser.
 *
 * The leak this pins: delta collection used to scrape EVERY row's checkbox state off the DOM,
 * including LOCKED rows. A dependency-forced optional (`grilling`, locked-on by default
 * `grill-me`) therefore leaked into the `included` deltas on both the `/schema` re-lock refetch
 * and the `POST /submit` payload — so after toggling `grill-me` off (which releases the lock
 * server-side), `grilling` re-rendered free-but-ON and would still have installed. A locked row's
 * checked state is the closure's doing, never user intent: it must contribute NO delta unless the
 * user explicitly toggled that row at some point (tracked name-keyed by the click handlers).
 */
const packsRoot = getPacksPath();
const TOKEN = "test-token";
const ALL_ADAPTERS = "claude,cursor,copilot,agent";

// ---- minimal DOM stub (only what page.ts's script actually touches) ----

interface StubNode {
  tagName?: string;
  nodeType?: number;
  className: string;
  children: StubNode[];
  attributes: Record<string, string>;
  listeners: Record<string, Array<() => void>>;
  textContent: string;
  style: Record<string, string>;
  type?: string;
  checked?: boolean;
  disabled?: boolean;
  id?: string;
  parent?: StubNode | null;
  appendChild(child: StubNode): StubNode;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(event: string, fn: () => void): void;
  remove(): void;
  querySelectorAll(selector: string): StubNode[];
  innerHTML: string;
  /** Test helper: fire all listeners for an event (simulates a user interaction). */
  dispatch(event: string): void;
}

function makeNode(tagName?: string): StubNode {
  const node: StubNode = {
    tagName,
    className: "",
    children: [],
    attributes: {},
    listeners: {},
    textContent: "",
    style: {},
    checked: false,
    disabled: false,
    parent: null,
    appendChild(child) {
      child.parent = node;
      node.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      node.attributes[name] = String(value);
    },
    getAttribute(name) {
      return name in node.attributes ? node.attributes[name]! : null;
    },
    addEventListener(event, fn) {
      (node.listeners[event] ??= []).push(fn);
    },
    remove() {
      if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);
      node.parent = null;
    },
    querySelectorAll(selector) {
      return queryAll(node, selector);
    },
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      if (v === "") node.children = [];
    },
    dispatch(event) {
      for (const fn of node.listeners[event] ?? []) fn();
    },
  };
  return node;
}

function walk(root: StubNode, visit: (n: StubNode) => void): void {
  visit(root);
  for (const child of root.children) walk(child, visit);
}

/** Supports the two selector shapes the script uses: `input[data-stepid="X"]` and `.cls1.cls2`. */
function queryAll(root: StubNode, selector: string): StubNode[] {
  const out: StubNode[] = [];
  const attrMatch = /^input\[data-stepid="([^"]+)"\]$/.exec(selector);
  if (attrMatch) {
    walk(root, (n) => {
      if (n.tagName === "input" && n.getAttribute("data-stepid") === attrMatch[1]) out.push(n);
    });
    return out;
  }
  if (selector.startsWith(".")) {
    const classes = selector.slice(1).split(".");
    walk(root, (n) => {
      const own = (n.className || "").split(/\s+/);
      if (classes.every((c) => own.includes(c))) out.push(n);
    });
    return out;
  }
  return out;
}

interface FetchCall {
  url: string;
  options?: { method?: string; body?: string };
}

interface PageHarness {
  fetchCalls: FetchCall[];
  /** FIFO queue of JSON responses the fetch stub hands back. */
  queueResponse(json: unknown): void;
  flushTimers(): void;
  /** All currently attached skill/razor inputs by value. */
  input(stepId: string, value: string): StubNode | undefined;
  clickConfirm(): void;
  confirmButton(): StubNode;
  hint(): StubNode;
  err(): StubNode;
  masthead(): StubNode;
}

function runPage(schema: unknown): PageHarness {
  const html = renderWizardPage(schema as never, TOKEN);
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(html);
  expect(scriptMatch).toBeTruthy();

  const masthead = makeNode("div");
  masthead.className = "masthead";
  const mastMeta = makeNode("div");
  mastMeta.id = "mast-meta";
  masthead.appendChild(mastMeta);
  const app = makeNode("div");
  app.id = "app";
  const body = makeNode("body");
  body.appendChild(masthead);
  body.appendChild(app);

  const documentStub = {
    createElement: (tag: string) => makeNode(tag),
    createTextNode: (text: string) => {
      const n = makeNode();
      n.nodeType = 3;
      n.textContent = text;
      return n;
    },
    getElementById: (id: string) => (id === "app" ? app : id === "mast-meta" ? mastMeta : null),
    querySelector: (selector: string) => queryAll(body, selector)[0] ?? null,
    querySelectorAll: (selector: string) => queryAll(body, selector),
    body,
  };

  const fetchCalls: FetchCall[] = [];
  const responses: unknown[] = [];
  const pendingTimers = new Map<number, () => void>();
  let nextTimerId = 1;

  const context = createContext({
    document: documentStub,
    fetch: (url: string, options?: { method?: string; body?: string }) => {
      fetchCalls.push({ url, options });
      const json = responses.shift();
      return Promise.resolve({ json: () => Promise.resolve(json) });
    },
    setTimeout: (fn: () => void) => {
      const id = nextTimerId++;
      pendingTimers.set(id, fn);
      return id;
    },
    clearTimeout: (handle: number) => {
      pendingTimers.delete(handle);
    },
  });
  runInContext(scriptMatch![1]!, context);

  return {
    fetchCalls,
    queueResponse: (json) => responses.push(json),
    flushTimers: () => {
      while (pendingTimers.size > 0) {
        const [id, fn] = pendingTimers.entries().next().value as [number, () => void];
        pendingTimers.delete(id);
        fn();
      }
    },
    input: (stepId, value) =>
      queryAll(body, `input[data-stepid="${stepId}"]`).find((n) => n.getAttribute("data-value") === value),
    clickConfirm: () => {
      const btn = queryAll(body, ".confirm")[0];
      expect(btn).toBeDefined();
      btn!.dispatch("click");
    },
    confirmButton: () => queryAll(body, ".confirm")[0]!,
    hint: () => queryAll(body, ".hint")[0]!,
    err: () => queryAll(body, ".err")[0]!,
    masthead: () => masthead,
  };
}

const tick = () => new Promise((r) => setImmediate(r));

// ---- the regression sequence ----

describe("web page client JS — forced-dependency deltas (phantom grilling leak)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-web-client-"));
  });
  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("default → grill-me off: refetch + submit carry NO grilling delta; grilling releases to Off; install skips it", async () => {
    const { schema } = buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, packsRoot });
    const page = runPage(schema);

    // First paint: grilling is locked-on (forced by default grill-me) — the schema-level fix.
    const grillingBefore = page.input("skills", "grilling")!;
    expect(grillingBefore.checked).toBe(true);
    expect(grillingBefore.disabled).toBe(true);

    // User toggles grill-me OFF. The re-lock refetch must NOT read the locked grilling row's
    // forced checked state as user intent.
    const grillMe = page.input("skills", "grill-me")!;
    expect(grillMe.disabled).toBe(false);
    grillMe.checked = false;
    // What the server would answer for excluded=grill-me: grilling released to its tier default.
    page.queueResponse(
      buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, excludeSkills: ["grill-me"], packsRoot, detect: false })
        .schema,
    );
    grillMe.dispatch("change");
    page.flushTimers();
    await tick();

    const schemaCall = page.fetchCalls.find((c) => c.url.includes("/schema"))!;
    expect(schemaCall).toBeDefined();
    const params = new URL(schemaCall.url, "http://x").searchParams;
    expect((params.get("excluded") ?? "").split(",")).toContain("grill-me");
    expect((params.get("included") ?? "").split(",")).not.toContain("grilling"); // THE leak
    // Re-rendered from the response: grilling is free and OFF (tier default), not free-but-ON.
    const grillingAfter = page.input("skills", "grilling")!;
    expect(grillingAfter.disabled).toBe(false);
    expect(grillingAfter.checked).toBe(false);

    // Submit: the POSTed answers must carry excluded=[…grill-me…] and NO grilling in included.
    page.queueResponse({ ok: true });
    page.clickConfirm();
    await tick();
    const submitCall = page.fetchCalls.find((c) => c.url.includes("/submit"))!;
    expect(submitCall).toBeDefined();
    const payload = JSON.parse(submitCall.options!.body!) as { answers: WizardAnswers };
    expect(payload.answers.skills!.excluded).toContain("grill-me");
    expect(payload.answers.skills!.included).not.toContain("grilling");

    // The captured payload through the real install tail: grilling is NOT written.
    const result = buildInstallResultFromAnswers(payload.answers, { targetDir, packsRoot });
    expect(result.ok).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "grilling"))).toBe(false);
    expect(existsSync(join(targetDir, ".claude", "skills", "grill-me"))).toBe(false);
    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8")) as {
      skillSelection: { excluded: string[]; included: string[] };
    };
    expect(profile.skillSelection.excluded).toContain("grill-me");
    expect(profile.skillSelection.included).not.toContain("grilling");
  });

  it("an EXPLICIT user toggle on a later-locked row survives its forcer's release (intent is name-keyed, not scraped)", async () => {
    // Start with grill-me already excluded → grilling is a free Off toggle.
    const derive = (deltas: { excludeSkills?: string[]; includeSkills?: string[] }) =>
      buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, ...deltas, packsRoot, detect: false }).schema;
    const { schema } = buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, excludeSkills: ["grill-me"], packsRoot });
    const page = runPage(schema);
    const toggle = async (value: string, on: boolean, response: unknown) => {
      const inp = page.input("skills", value)!;
      expect(inp.disabled).toBe(false);
      inp.checked = on;
      page.queueResponse(response);
      inp.dispatch("change");
      page.flushTimers();
      await tick();
    };

    // 1. User explicitly turns grilling ON while it is free (recorded as name-keyed intent).
    await toggle("grilling", true, derive({ excludeSkills: ["grill-me"], includeSkills: ["grilling"] }));
    // 2. User turns grill-me back ON → grilling becomes LOCKED (needed by grill-me) again.
    await toggle("grill-me", true, derive({ includeSkills: ["grilling"] }));
    expect(page.input("skills", "grilling")!.disabled).toBe(true);
    // 3. User turns grill-me OFF once more. grilling's row is locked — DOM-scraping would drop it —
    //    but the EXPLICIT step-1 intent must survive: included still carries grilling.
    await toggle("grill-me", false, derive({ excludeSkills: ["grill-me"], includeSkills: ["grilling"] }));

    const lastSchemaCall = page.fetchCalls.filter((c) => c.url.includes("/schema")).pop()!;
    const params = new URL(lastSchemaCall.url, "http://x").searchParams;
    expect((params.get("excluded") ?? "").split(",")).toContain("grill-me");
    expect((params.get("included") ?? "").split(",")).toContain("grilling"); // explicit intent kept
    // And the re-rendered row honors it: free (nothing forces it) and ON (user chose it).
    const grillingFinal = page.input("skills", "grilling")!;
    expect(grillingFinal.disabled).toBe(false);
    expect(grillingFinal.checked).toBe(true);
  });
});

describe("web page client JS — Confirm gating + submit truthfulness", () => {
  it("Confirm is DISABLED with zero repo types (mirrors the TTY cancel rule) and enables once one is checked", () => {
    // No --type, no detection → zero repo types checked on first paint.
    const { schema } = buildWebSchema({ adapters: ALL_ADAPTERS, packsRoot, detect: false });
    const page = runPage(schema);

    expect(page.confirmButton().disabled).toBe(true);
    expect(page.hint().textContent).toMatch(/at least one project type/);

    // User checks a repo type → the gate opens (synchronously, before any debounce fires).
    const next = page.input("repo-type", "next")!;
    next.checked = true;
    page.queueResponse(buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, packsRoot, detect: false }).schema);
    next.dispatch("change");
    expect(page.confirmButton().disabled).toBe(false);
    expect(page.hint().textContent).not.toMatch(/at least one/);
    page.flushTimers(); // drain the queued re-derive so no dangling promise leaks

    // Unchecking it again closes the gate.
    next.checked = false;
    page.queueResponse(buildWebSchema({ adapters: ALL_ADAPTERS, packsRoot, detect: false }).schema);
    next.dispatch("change");
    expect(page.confirmButton().disabled).toBe(true);
    page.flushTimers();
  });

  it("a FAILED submit shows the error and keeps the form — never the Done screen", async () => {
    const { schema } = buildWebSchema({ type: "next", adapters: ALL_ADAPTERS, packsRoot });
    const page = runPage(schema);

    page.queueResponse({ ok: false, error: "missing required --adapters <list>" });
    page.clickConfirm();
    await tick();

    // The masthead/form is still up (showDone hides the masthead) and the failure is displayed.
    expect(page.masthead().style["display"]).not.toBe("none");
    expect(page.err().textContent).toMatch(/Install failed: missing required --adapters/);
    // Confirm is re-enabled (gate re-evaluated) so the user can correct and retry.
    expect(page.confirmButton().disabled).toBe(false);

    // A successful retry reaches the Done screen.
    page.queueResponse({ ok: true });
    page.clickConfirm();
    await tick();
    expect(page.masthead().style["display"]).toBe("none");
  });
});
