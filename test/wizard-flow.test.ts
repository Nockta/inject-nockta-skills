import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWizardFlow as runWizardFlowInternal } from "../src/wizard/run-install-wizard.js";
import { EXTRAS_BIN_OVERRIDE_ENV_VAR } from "../src/core/run-extras.js";
import type { WizardOptions } from "../src/wizard/run-install-wizard.js";
import type { Presenter, PresenterResult } from "../src/wizard/view/presenter.js";
import type { StepModel } from "../src/wizard/core/types.js";
import type { WizardPrompts } from "../src/wizard/prompts.js";
import type { ParsedTarget } from "../src/core/parse-targets.js";

/**
 * D28 rebuild — full `runWizardFlow()` tests now drive the back-aware Controller through a SCRIPTED
 * PRESENTER (the View seam), not the old `WizardPrompts` fake. Each `renderStep()` call dequeues
 * the next scripted step result (an answer value, or a BACK signal); the presenter also records
 * every `StepModel` it was asked to render, so tests can assert what the Controller built (sections,
 * preview preamble, locked rows) without a real TTY. The post-write extras step still uses a tiny
 * `WizardPrompts` (it is not a back-nav wizard step), injected separately via `prompts`.
 *
 * The shared "already installed" extras fixture home (below) makes the extras step silently no-op
 * for every test that isn't specifically exercising it — same convention as before the rebuild.
 */
let alreadyInstalledHomeDir: string;

beforeAll(() => {
  alreadyInstalledHomeDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-extras-preinstalled-"));
  mkdirSync(join(alreadyInstalledHomeDir, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
});

afterAll(() => {
  rmSync(alreadyInstalledHomeDir, { recursive: true, force: true });
});

function runWizardFlow(options: WizardOptions) {
  return runWizardFlowInternal({ extrasHomeDir: alreadyInstalledHomeDir, ...options });
}

// ---- scripted View (Presenter) harness -------------------------------------------------------

type StepScript = { kind: "answer"; value: unknown } | { kind: "back" };

/** A step answer: `value` is `string[]` (multiselect/paginated), `boolean` (confirm), or `ParsedTarget[]` (targets). */
function answer(value: unknown): StepScript {
  return { kind: "answer", value };
}
function back(): StepScript {
  return { kind: "back" };
}

interface ScriptedPresenter extends Presenter {
  remaining: () => number;
  rendered: StepModel[];
}

function scriptedPresenter(script: StepScript[]): ScriptedPresenter {
  const queue = [...script];
  const rendered: StepModel[] = [];
  return {
    rendered,
    remaining: () => queue.length,
    clear() {},
    close() {},
    async renderStep(step: StepModel): Promise<PresenterResult> {
      rendered.push(step);
      const next = queue.shift();
      if (!next) throw new Error(`scriptedPresenter: no more scripted results (Controller rendered step "${step.id}")`);
      return next.kind === "back" ? { kind: "back" } : { kind: "answer", value: next.value };
    },
  };
}

/** A minimal `WizardPrompts` for the post-write extras step ONLY — its confirm returns `confirmValue`. */
function extrasPrompts(confirmValue = true): WizardPrompts {
  return {
    async confirm() {
      return confirmValue;
    },
    async select<T extends string>(_m: string, choices: { value: T }[]) {
      return choices[0]!.value;
    },
    async checkbox() {
      return [] as never;
    },
    async input() {
      return "";
    },
  };
}

function noopLog(): void {}

/**
 * The general (non-razor) skill step answer for a real-bundled `common` (+ `next`) install: accept
 * every required+default skill, plus the one optional dependency (`grilling`) that default-tier
 * `grill-me`'s D21 closure pulls in — a fixed point that converges the lock loop in ONE round,
 * matching the same default resolution (`included: ["grilling"]`) a plain `--yes` install produces.
 * Razor is now its OWN step (answered separately with `RAZOR_NONE`), so no razor names appear here.
 */
const COMMON_SKILLS = [
  "paper-trail",
  "proof-of-done",
  "subagent-delegation",
  "grill-me",
  "brainstorming",
  "diagnosing-bugs",
  "webapp-testing",
  "code-review",
  "receiving-code-review",
  "requesting-code-review",
  "writing-plans",
  "finishing-a-development-branch",
  "grilling",
];
const COMMON_PLUS_NEXT_SKILLS = [...COMMON_SKILLS, "react-best-practices", "nextjs-app-router-patterns", "composition-patterns"];
/** The razor step (all optional, default-off): select nothing. */
const RAZOR_NONE = answer([]);

describe("runWizardFlow — single-project happy path", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-single-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("detects single-project, prompts type/adapters/skills/razor/confirm, then writes via the real install core", async () => {
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^15.0.0" } }), "utf8");

    const presenter = scriptedPresenter([
      answer(["next"]), // repo-type
      answer(["claude"]), // adapters
      answer(COMMON_PLUS_NEXT_SKILLS), // skills (general)
      RAZOR_NONE, // razor
      answer(true), // confirm
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.isMonorepo).toBe(false);
    expect(result.data.repoTypes).toEqual(["next"]);
    expect(result.data.installedPacks).toEqual(["common", "next", "razor"]);
    expect(existsSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".nockta", "skills-profile.json"))).toBe(true);
    expect(presenter.remaining()).toBe(0);
  });

  it("razor gets its OWN step, separate from the general skill step; the general step never lists razor skills", async () => {
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^15.0.0" } }), "utf8");

    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(COMMON_PLUS_NEXT_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    const skillsStep = presenter.rendered.find((s) => s.id === "skills");
    const razorStep = presenter.rendered.find((s) => s.id === "razor");
    expect(skillsStep).toBeDefined();
    expect(razorStep).toBeDefined();
    // General step is sectioned by pack (common first, then stack packs) and contains NO razor skills.
    expect(skillsStep!.sections!.map((s) => s.pack)).toContain("common");
    expect(skillsStep!.choices!.every((c) => c.pack !== "razor")).toBe(true);
    // Razor step contains ONLY razor skills.
    expect(razorStep!.choices!.length).toBeGreaterThan(0);
    expect(razorStep!.choices!.every((c) => c.pack === "razor")).toBe(true);
  });

  it("an explicit --type preset skips the repo-type step entirely (D29)", async () => {
    const presenter = scriptedPresenter([
      // NO repo-type answer — proves the step was preset-skipped.
      answer(["claude"]),
      answer(COMMON_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test", type: "nest" });

    expect(result.ok).toBe(true);
    expect(result.data.repoTypes).toEqual(["nest"]);
    // The repo-type step must never have been rendered.
    expect(presenter.rendered.some((s) => s.id === "repo-type")).toBe(false);
  });

  it("an explicit --adapters preset skips the adapter step entirely (D29)", async () => {
    const presenter = scriptedPresenter([
      answer(["vite-react-ts"]),
      // NO adapter answer.
      answer(COMMON_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test", adapters: "claude" });

    expect(result.ok).toBe(true);
    expect(result.data.adapters).toEqual(["claude"]);
    expect(presenter.rendered.some((s) => s.id === "adapters")).toBe(false);
  });

  it("a --yes preset skips the confirm step and still writes", async () => {
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(COMMON_PLUS_NEXT_SKILLS),
      RAZOR_NONE,
      // NO confirm answer.
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test", yes: true });

    expect(result.ok).toBe(true);
    expect(existsSync(join(targetDir, ".nockta", "skills-profile.json"))).toBe(true);
    expect(presenter.rendered.some((s) => s.id === "confirm")).toBe(false);
  });

  it("user declines the confirm step: cancelled, nothing written", async () => {
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(COMMON_PLUS_NEXT_SKILLS),
      RAZOR_NONE,
      answer(false), // decline
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.summary).toMatch(/cancelled/);
    expect(existsSync(join(targetDir, ".nockta"))).toBe(false);
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("narrates step-1 detection via the log and carries the preview in the confirm step's preamble", async () => {
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^15.0.0" } }), "utf8");
    const lines: string[] = [];
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(COMMON_PLUS_NEXT_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    await runWizardFlow({ targetDir, presenter, log: (m) => lines.push(m), packageVersion: "9.9.9-test" });

    expect(lines.some((l) => /single-project repo/.test(l))).toBe(true);
    const confirmStep = presenter.rendered.find((s) => s.id === "confirm");
    expect(confirmStep?.preamble).toMatch(/Packs to install/);
    expect(confirmStep?.preamble).toMatch(/Files that will be generated/);
  });

  it("back-nav: going back from adapters to the repo-type step preserves the already-entered type, then advances again", async () => {
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^15.0.0" } }), "utf8");
    const presenter = scriptedPresenter([
      answer(["next"]), // repo-type (round 1)
      back(), // adapters -> go back
      answer(["vite-react-ts"]), // repo-type (round 2) — change the answer
      answer(["claude"]), // adapters
      answer(COMMON_SKILLS), // common-only (valid for any type)
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.repoTypes).toEqual(["vite-react-ts"]);
    // On re-entry the repo-type step reflected the previously-entered "next" as checked.
    const repoTypeRenders = presenter.rendered.filter((s) => s.id === "repo-type");
    expect(repoTypeRenders.length).toBe(2);
    expect(repoTypeRenders[1]!.choices!.find((c) => c.value === "next")?.checked).toBe(true);
  });
});

describe("runWizardFlow — monorepo happy path", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-monorepo-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web", dependencies: { next: "^15.0.0" } }), "utf8");
    mkdirSync(join(root, "apps", "api"), { recursive: true });
    writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "^10.0.0" } }), "utf8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("collects both targets, then installs via the real monorepo core", async () => {
    const presenter = scriptedPresenter([
      answer([
        { path: "apps/web", types: ["next"] },
        { path: "apps/api", types: ["nest"] },
      ] as ParsedTarget[]), // targets sub-flow returns the resolved targets
      answer(["claude"]), // adapters
      answer(COMMON_SKILLS), // skills
      RAZOR_NONE, // razor (union next+nest -> applicable)
      answer(true), // confirm
    ]);

    const result = await runWizardFlow({ targetDir: root, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.isMonorepo).toBe(true);
    expect(result.data.targets.length).toBe(2);
    expect(existsSync(join(root, ".claude"))).toBe(true);
    expect(existsSync(join(root, ".nockta", "targets.json"))).toBe(true);
    expect(existsSync(join(root, "apps", "web", ".claude"))).toBe(false);
  });

  it("preset --target values (from a partial CLI invocation) skip the targets step entirely (D29)", async () => {
    const presenter = scriptedPresenter([
      // NO targets answer — proves the targets step was preset-skipped.
      answer(["claude"]),
      answer(COMMON_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({
      targetDir: root,
      presenter,
      log: noopLog,
      packageVersion: "9.9.9-test",
      targets: ["apps/web:next", "apps/api:nest"],
    });

    expect(result.ok).toBe(true);
    expect(result.data.targets.map((t) => t.path).sort()).toEqual(["apps/api", "apps/web"]);
    expect(presenter.rendered.some((s) => s.id === "targets")).toBe(false);
  });

  it("--monorepo forces monorepo mode; the targets step's manual entry yields the targets", async () => {
    const bare = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-monorepo-bare-"));
    try {
      mkdirSync(join(bare, "apps", "one"), { recursive: true });
      const presenter = scriptedPresenter([
        answer([{ path: "apps/one", types: ["next"] }] as ParsedTarget[]), // targets (manual)
        answer(["claude"]),
        answer(COMMON_PLUS_NEXT_SKILLS),
        RAZOR_NONE,
        answer(true),
      ]);

      const result = await runWizardFlow({ targetDir: bare, presenter, log: noopLog, packageVersion: "9.9.9-test", monorepo: true });

      expect(result.ok).toBe(true);
      expect(result.data.isMonorepo).toBe(true);
      expect(result.data.targets.map((t) => t.path)).toEqual(["apps/one"]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("an empty targets answer cancels cleanly (no targets at all)", async () => {
    const bare = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-monorepo-cancel-"));
    try {
      const presenter = scriptedPresenter([answer([] as ParsedTarget[])]);
      const result = await runWizardFlow({ targetDir: bare, presenter, log: noopLog, packageVersion: "9.9.9-test", monorepo: true });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.summary).toMatch(/no monorepo targets/);
      expect(existsSync(join(bare, ".nockta"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe("runWizardFlow — final result matches the plain buildInstallResult() shape", () => {
  it("a wizard-driven single-project install and an equivalent flag-driven install produce the same installed packs/files", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-parity-"));
    try {
      const presenter = scriptedPresenter([
        answer(["next"]),
        answer(["claude"]),
        answer(COMMON_PLUS_NEXT_SKILLS),
        RAZOR_NONE,
        answer(true),
      ]);
      const wizardResult = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

      const { buildInstallResult } = await import("../src/commands/install.js");
      const flagDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-parity-flag-"));
      try {
        const flagResult = buildInstallResult({
          type: "next",
          adapters: "claude",
          yes: true,
          targetDir: flagDir,
          packageVersion: "9.9.9-test",
        });
        expect(wizardResult.data.installedPacks).toEqual(flagResult.data.installedPacks);
        expect(wizardResult.data.renderedFiles).toEqual(flagResult.data.renderedFiles);
      } finally {
        rmSync(flagDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe("runWizardFlow — unknown detection falls back to a full manual choice", () => {
  it("no package.json at all: still resolves via the user's own selection, no crash", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-unknown-"));
    try {
      const presenter = scriptedPresenter([
        answer(["shopify-app"]),
        answer(["claude"]),
        answer(COMMON_SKILLS),
        RAZOR_NONE,
        answer(true),
      ]);
      const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });
      expect(result.ok).toBe(true);
      expect(result.data.repoTypes).toEqual(["shopify-app"]);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe("runWizardFlow — D22 multi-type (multi-select type step, scripted presenter)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-multitype-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("single-project: multi-select with two chosen types -> repoTypes[] with both", async () => {
    const presenter = scriptedPresenter([
      answer(["shopify-app", "vite-react-ts"]),
      answer(["claude"]),
      answer(COMMON_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.repoTypes?.sort()).toEqual(["shopify-app", "vite-react-ts"].sort());
  });

  it("an explicit comma-form --type preset (multi-type) skips the repo-type step entirely", async () => {
    const presenter = scriptedPresenter([answer(["claude"]), answer(COMMON_SKILLS), RAZOR_NONE, answer(true)]);

    const result = await runWizardFlow({
      targetDir,
      presenter,
      log: noopLog,
      packageVersion: "9.9.9-test",
      type: "shopify-theme,vite-react-ts",
    });

    expect(result.ok).toBe(true);
    expect(result.data.repoTypes?.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
    expect(presenter.rendered.some((s) => s.id === "repo-type")).toBe(false);
  });

  it('D22 "root-is-a-project monorepo": a Shopify theme root with a workspaces field is a SINGLE multi-type install at root', async () => {
    mkdirSync(join(targetDir, "sections"), { recursive: true });
    mkdirSync(join(targetDir, "templates"), { recursive: true });
    mkdirSync(join(targetDir, "config"), { recursive: true });
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }), "utf8");
    mkdirSync(join(targetDir, "packages", "assets"), { recursive: true });
    writeFileSync(
      join(targetDir, "packages", "assets", "package.json"),
      JSON.stringify({ name: "assets", dependencies: { react: "^18.0.0" }, devDependencies: { vite: "^5.0.0", typescript: "^5.0.0" } }),
      "utf8",
    );

    const lines: string[] = [];
    const presenter = scriptedPresenter([
      answer(["shopify-theme", "vite-react-ts"]),
      answer(["claude"]),
      answer(COMMON_SKILLS),
      RAZOR_NONE,
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, presenter, log: (m) => lines.push(m), packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.isMonorepo).toBe(false);
    expect(result.data.repoTypes?.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
    expect(existsSync(join(targetDir, "packages", "assets", ".claude"))).toBe(false);
    // The dev-speak "decisions.md D22" citation was stripped; the plain concept phrase is kept.
    expect(lines.some((l) => /root-is-a-project monorepo/.test(l))).toBe(true);
    expect(lines.some((l) => /decisions\.md/.test(l))).toBe(false);
  });
});

describe("runWizardFlow — extras (spec §7.10, decisions.md D17) — dedicated, real prompt-injection", () => {
  let targetDir: string;
  let notInstalledHome: string;
  let scratchRoot: string;
  let successBin: string;
  let failBin: string;
  let sentinel: string;

  function mainFlow(confirmValue = true): StepScript[] {
    return [answer(["next"]), answer(["claude"]), answer(COMMON_PLUS_NEXT_SKILLS), RAZOR_NONE, answer(confirmValue)];
  }

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-extras-"));
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^15.0.0" } }), "utf8");
    notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-extras-home-"));
    scratchRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-extras-bin-"));
    successBin = join(scratchRoot, "success.mjs");
    failBin = join(scratchRoot, "fail.mjs");
    sentinel = join(scratchRoot, "sentinel.txt");
    writeFileSync(
      successBin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.EXTRAS_TEST_SENTINEL, "ok\\n");
process.exit(0);
`,
    );
    writeFileSync(failBin, `#!/usr/bin/env node\nprocess.exit(3);\n`);
    process.env.EXTRAS_TEST_SENTINEL = sentinel;
  });

  afterEach(() => {
    delete process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR];
    delete process.env.EXTRAS_TEST_SENTINEL;
    rmSync(targetDir, { recursive: true, force: true });
    rmSync(notInstalledHome, { recursive: true, force: true });
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("declined (default No): install still succeeds; extras.accepted false; nothing spawned", async () => {
    const result = await runWizardFlowInternal({
      targetDir,
      presenter: scriptedPresenter(mainFlow()),
      prompts: extrasPrompts(false),
      log: noopLog,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.extras).toEqual({ offered: true, accepted: false, succeeded: false });
    expect(existsSync(sentinel)).toBe(false);
  });

  it("accepted, success override: spawns via the override (never real npx), extras.succeeded true", async () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const result = await runWizardFlowInternal({
      targetDir,
      presenter: scriptedPresenter(mainFlow()),
      prompts: extrasPrompts(true),
      log: noopLog,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.data.extras).toEqual({ offered: true, accepted: true, succeeded: true });
    expect(existsSync(sentinel)).toBe(true);
  });

  it("accepted, failing override: install stays ok:true/exit 0, extras.succeeded false, warning recorded", async () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = failBin;
    const result = await runWizardFlowInternal({
      targetDir,
      presenter: scriptedPresenter(mainFlow()),
      prompts: extrasPrompts(true),
      log: noopLog,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.extras).toEqual({ offered: true, accepted: true, succeeded: false });
    expect(result.data.warnings.some((w) => /claude-mem/.test(w))).toBe(true);
  });

  it("already installed: prompt is skipped entirely — extras.offered false", async () => {
    const installedHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-extras-installed-"));
    try {
      mkdirSync(join(installedHome, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
      const presenter = scriptedPresenter(mainFlow());
      const result = await runWizardFlowInternal({
        targetDir,
        presenter,
        prompts: extrasPrompts(true),
        log: noopLog,
        packageVersion: "9.9.9-test",
        extrasHomeDir: installedHome,
      });
      expect(result.ok).toBe(true);
      expect(result.data.extras).toEqual({ offered: false, accepted: false, succeeded: false });
      expect(presenter.remaining()).toBe(0);
    } finally {
      rmSync(installedHome, { recursive: true, force: true });
    }
  });

  it("a cancelled install (confirm declined) never reaches extras at all — no extras key", async () => {
    const result = await runWizardFlowInternal({
      targetDir,
      presenter: scriptedPresenter(mainFlow(false)),
      prompts: extrasPrompts(true),
      log: noopLog,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(false);
    expect(result.data.extras).toBeUndefined();
  });
});

describe("runWizardFlow — skill selection (spec §7.1, decisions.md D19) — dedicated fixture with all 3 tiers", () => {
  let packsRoot: string;
  let targetDir: string;

  function writeFile(path: string, content: string): void {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  function writeSkill(pack: string, skill: string, enablement: "required" | "default" | "optional"): void {
    const skillDir = join(packsRoot, pack, "skills", skill);
    writeFile(join(skillDir, "SKILL.md"), `# ${skill}`);
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: skill, supportedAdapters: ["claude"], outputs: { claude: { skills: true } }, enablement }),
    );
  }
  function writePack(name: string, skills: string[]): void {
    writeFile(join(packsRoot, name, "pack.json"), JSON.stringify({ name, displayName: name, description: name, requires: [], skills, adapters: ["claude"] }));
  }

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-skills-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-skills-target-"));
    writePack("common", ["required-a", "default-a", "optional-a"]);
    writeSkill("common", "required-a", "required");
    writeSkill("common", "default-a", "default");
    writeSkill("common", "optional-a", "optional");
    writePack("next", ["placeholder"]);
    // razor declared-only (no content) — stays "planned", so no razor step appears here.
    writePack("razor", ["placeholder-razor-skill"]);
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("real toggle flow: unchecking a default and checking an optional -> written into the profile's skillSelection", async () => {
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(["required-a", "optional-a"]), // default-a deselected, optional-a selected
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, packsRoot, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
    expect(existsSync(join(targetDir, ".claude", "skills", "required-a", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "optional-a", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "default-a", "SKILL.md"))).toBe(false);

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
    expect(presenter.remaining()).toBe(0);
  });

  it("--exclude-skills/--include-skills presets skip the skill step entirely (D29)", async () => {
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      // NO skills answer — proves the preset short-circuited it.
      answer(true),
    ]);

    const result = await runWizardFlow({
      targetDir,
      packsRoot,
      presenter,
      log: noopLog,
      packageVersion: "9.9.9-test",
      excludeSkills: ["default-a"],
      includeSkills: ["optional-a"],
    });

    expect(result.ok).toBe(true);
    expect(result.data.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
    expect(presenter.rendered.some((s) => s.id === "skills")).toBe(false);
    expect(presenter.remaining()).toBe(0);
  });
});

describe("runWizardFlow — D21 skill dependency lock/release, end to end through the real wizard wiring", () => {
  let packsRoot: string;
  let targetDir: string;

  function writeFile(path: string, content: string): void {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  function writeSkill(pack: string, skill: string, enablement: "required" | "default" | "optional", requires: string[] = []): void {
    const skillDir = join(packsRoot, pack, "skills", skill);
    writeFile(join(skillDir, "SKILL.md"), `# ${skill}`);
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: skill,
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
        enablement,
        ...(requires.length > 0 ? { requires } : {}),
      }),
    );
  }
  function writePack(name: string, skills: string[]): void {
    writeFile(join(packsRoot, name, "pack.json"), JSON.stringify({ name, displayName: name, description: name, requires: [], skills, adapters: ["claude"] }));
  }

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-deps-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-flow-deps-target-"));
    writePack("common", ["required-a", "grill-me", "grilling"]);
    writeSkill("common", "required-a", "required");
    writeSkill("common", "grill-me", "optional", ["grilling"]);
    writeSkill("common", "grilling", "optional");
    writePack("next", ["placeholder"]);
    writePack("razor", ["placeholder-razor-skill"]);
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("checking grill-me alone pulls+locks grilling via a second render round, and both land in the written profile", async () => {
    const presenter = scriptedPresenter([
      answer(["next"]),
      answer(["claude"]),
      answer(["required-a", "grill-me"]), // skills round 1 — grilling not checked yet
      answer(["required-a", "grill-me", "grilling"]), // skills round 2 — grilling now locked+checked
      answer(true),
    ]);

    const result = await runWizardFlow({ targetDir, packsRoot, presenter, log: noopLog, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.data.skillSelection).toEqual({ excluded: [], included: ["grill-me", "grilling"] });
    expect(existsSync(join(targetDir, ".claude", "skills", "grilling", "SKILL.md"))).toBe(true);

    // Round 2's re-render must show grilling locked (disabled) + checked with a plain-language reason.
    const skillRenders = presenter.rendered.filter((s) => s.id === "skills");
    expect(skillRenders.length).toBe(2);
    const grillingRow = skillRenders[1]!.choices!.find((c) => c.value === "grilling");
    expect(grillingRow?.checked).toBe(true);
    expect(grillingRow?.disabled).toBe(true);
    expect(grillingRow?.disabledReason).toMatch(/needed by grill-me/);

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.skillSelection.included.sort()).toEqual(["grill-me", "grilling"]);
    expect(presenter.remaining()).toBe(0);
  });
});
