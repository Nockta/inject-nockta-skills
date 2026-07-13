import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverWorkspaceCandidates } from "../src/wizard/steps/select-targets.js";
import { planRepoTypeStep, selectRepoTypes } from "../src/wizard/steps/select-repo-type.js";
import { planAdapterStep, selectAdapters } from "../src/wizard/steps/select-adapters.js";
import { buildPreviewPlan, formatPreviewHuman } from "../src/wizard/steps/preview-plan.js";
import { confirmInstall } from "../src/wizard/steps/confirm.js";
import { runDetectRepoStep } from "../src/wizard/steps/detect-repo.js";
import { runExtrasWizardStep } from "../src/wizard/steps/extras.js";
import { EXTRAS_BIN_OVERRIDE_ENV_VAR } from "../src/core/run-extras.js";
import { planSkillSelectionStep, selectSkills } from "../src/wizard/steps/select-skills.js";
import { resolvePacks } from "../src/packs/resolve-packs.js";
import { buildSkillCatalog } from "../src/packs/skill-catalog.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import type { WizardChoice, WizardPrompts } from "../src/wizard/prompts.js";
import type { RepoType } from "../src/types/repo-type.js";
import type { AdapterType } from "../src/types/adapter.js";
import type { SkillCatalogEntry } from "../src/packs/skill-catalog.js";

/** A fully-inert fake `WizardPrompts` — every call records its args and returns a canned answer,
 * so wizard step tests never touch a real TTY or `@inquirer/prompts` (brief item 4: "injected
 * prompt answers — no real TTY needed"). */
function makeFakePrompts(answers: {
  confirm?: boolean;
  select?: string;
  /**
   * `string[]` — the SAME constant answer is returned on every `checkbox()` call (pre-existing
   * behavior). `string[][]` (D21, new) — a QUEUE: each `checkbox()` call dequeues the next array;
   * once exhausted, the LAST queued array is returned for any further calls (a safe repeat rather
   * than a throw, so a test that under-scripts a round still gets a deterministic answer instead
   * of a crash). Used by the D21 lock/release round-trip tests below, where `selectSkills()`'s
   * fixed-point loop (`src/wizard/steps/select-skills.ts`) may call `checkbox()` more than once.
   */
  checkbox?: string[] | string[][];
  input?: string;
}): WizardPrompts & { calls: { confirm: unknown[]; select: unknown[]; checkbox: unknown[]; input: unknown[] } } {
  const calls = { confirm: [] as unknown[], select: [] as unknown[], checkbox: [] as unknown[], input: [] as unknown[] };
  const isQueue = Array.isArray(answers.checkbox) && Array.isArray(answers.checkbox[0]);
  const checkboxQueue = isQueue ? [...(answers.checkbox as string[][])] : undefined;
  return {
    calls,
    async confirm(message, defaultValue) {
      calls.confirm.push({ message, defaultValue });
      return answers.confirm ?? true;
    },
    async select(message, choices) {
      calls.select.push({ message, choices });
      return (answers.select ?? choices[0]?.value) as never;
    },
    async checkbox(message, choices) {
      calls.checkbox.push({ message, choices });
      if (checkboxQueue) {
        const next = checkboxQueue.length > 1 ? checkboxQueue.shift()! : checkboxQueue[0]!;
        return next as never;
      }
      return ((answers.checkbox as string[] | undefined) ?? []) as never;
    },
    async input(message, defaultValue) {
      calls.input.push({ message, defaultValue });
      return answers.input ?? "";
    },
  };
}

describe("wizard step 1: detect-repo.ts", () => {
  it("wraps detectMonorepo verbatim", () => {
    const root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-detect-repo-"));
    try {
      writeFileSync(join(root, "turbo.json"), "{}", "utf8");
      const result = runDetectRepoStep(root);
      expect(result.isMonorepo).toBe(true);
      expect(result.signals).toContain("turbo.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("wizard steps 2-3: select-repo-type.ts (decisions.md D22 — multi-select)", () => {
  it("planRepoTypeStep: unknown detection (no guesses) has nothing pre-checked and every repo type as a choice", () => {
    const plan = planRepoTypeStep([]);
    expect(plan.preChecked).toEqual([]);
    expect(plan.topGuess).toBeNull();
    expect(plan.choices.map((c) => c.value).sort()).toEqual(
      ["next", "vite-react-ts", "nest", "shopify-app", "shopify-theme", "shopify-headless", "react-native", "expo"].sort(),
    );
    expect(plan.choices.every((c) => c.checked === false)).toBe(true);
  });

  it("planRepoTypeStep: every guess is pre-checked and annotated in its choice label; ranked, top guess exposed separately", () => {
    const plan = planRepoTypeStep([
      { type: "next", confidence: 0.95, evidence: ['package.json includes "next"'] },
      { type: "vite-react-ts", confidence: 0.4, evidence: ["weak vite-only signal"] },
    ]);
    expect(plan.preChecked.sort()).toEqual(["next", "vite-react-ts"].sort());
    expect(plan.topGuess?.type).toBe("next");
    const nextChoice = plan.choices.find((c) => c.value === "next");
    expect(nextChoice?.checked).toBe(true);
    expect(nextChoice?.name).toMatch(/95%/);
    expect(nextChoice?.description).toMatch(/next/);
    const viteChoice = plan.choices.find((c) => c.value === "vite-react-ts");
    expect(viteChoice?.checked).toBe(true);
    const nestChoice = plan.choices.find((c) => c.value === "nest");
    expect(nestChoice?.checked).toBe(false);
  });

  it("selectRepoTypes: an explicit valid single-type --type preset short-circuits WITHOUT prompting", async () => {
    const prompts = makeFakePrompts({});
    const result = await selectRepoTypes(prompts, [{ type: "next", confidence: 0.95, evidence: ["x"] }], "nest");
    expect(result).toEqual(["nest"]); // preset wins even though detection guessed "next"
    expect(prompts.calls.checkbox.length).toBe(0); // detection was never even consulted (brief item 1)
  });

  it("selectRepoTypes: an explicit valid MULTI-type comma preset short-circuits WITHOUT prompting (D22)", async () => {
    const prompts = makeFakePrompts({});
    const result = await selectRepoTypes(prompts, [], "shopify-theme,vite-react-ts");
    expect(result.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
    expect(prompts.calls.checkbox.length).toBe(0);
  });

  it("selectRepoTypes: an INVALID preset falls through to prompting", async () => {
    const prompts = makeFakePrompts({ checkbox: ["vite-react-ts"] });
    const result = await selectRepoTypes(prompts, [], "sveltekit");
    expect(result).toEqual(["vite-react-ts"]);
    expect(prompts.calls.checkbox.length).toBe(1);
  });

  it("selectRepoTypes: a PARTIALLY invalid preset (one valid, one not) also falls through to prompting", async () => {
    const prompts = makeFakePrompts({ checkbox: ["next"] });
    const result = await selectRepoTypes(prompts, [], "next,sveltekit");
    expect(result).toEqual(["next"]);
    expect(prompts.calls.checkbox.length).toBe(1);
  });

  it("selectRepoTypes: no preset -> prompts (checkbox), using detection as the pre-checked defaults", async () => {
    const prompts = makeFakePrompts({ checkbox: ["nest"] });
    const result = await selectRepoTypes(prompts, [{ type: "next", confidence: 0.95, evidence: ["x"] }]);
    expect(result).toEqual(["nest"]); // user overrode the detected default
    expect(prompts.calls.checkbox.length).toBe(1);
    const call = prompts.calls.checkbox[0] as { message: string; choices: WizardChoice<RepoType>[] };
    expect(call.message).toMatch(/Detected likely project type\(s\): next/);
    expect(call.choices.find((c) => c.value === "next")?.checked).toBe(true);
  });

  it("selectRepoTypes: no preset, multiple detected candidates -> both pre-checked (D22 union case)", async () => {
    const prompts = makeFakePrompts({ checkbox: ["shopify-theme", "vite-react-ts"] });
    const result = await selectRepoTypes(prompts, [
      { type: "shopify-theme", confidence: 0.85, evidence: ["theme dirs"] },
      { type: "vite-react-ts", confidence: 0.9, evidence: ["vite+react"] },
    ]);
    expect(result.sort()).toEqual(["shopify-theme", "vite-react-ts"].sort());
    const call = prompts.calls.checkbox[0] as { choices: WizardChoice<RepoType>[] };
    expect(call.choices.find((c) => c.value === "shopify-theme")?.checked).toBe(true);
    expect(call.choices.find((c) => c.value === "vite-react-ts")?.checked).toBe(true);
  });
});

describe("wizard step 4: select-adapters.ts", () => {
  it("planAdapterStep: all five adapters are enabled (D24 agent renderer; D35 antigravity renderer)", () => {
    const plan = planAdapterStep();
    const claude = plan.choices.find((c) => c.value === "claude");
    const cursor = plan.choices.find((c) => c.value === "cursor");
    const copilot = plan.choices.find((c) => c.value === "copilot");
    const agent = plan.choices.find((c) => c.value === "agent");
    const antigravity = plan.choices.find((c) => c.value === "antigravity");
    expect(claude?.disabled).toBe(false);
    expect(cursor?.disabled).toBe(false);
    expect(copilot?.disabled).toBe(false);
    expect(agent?.disabled).toBe(false);
    expect(antigravity?.disabled).toBe(false);
    expect(agent?.description).toMatch(/AGENTS\.md/);
    expect(antigravity?.description).toMatch(/\.agents\/skills/);
    expect(plan.defaultSelected).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });

  it("selectAdapters: a valid --adapters preset short-circuits without prompting", async () => {
    const prompts = makeFakePrompts({});
    const result = await selectAdapters(prompts, "claude");
    expect(result).toEqual(["claude"]);
    expect(prompts.calls.checkbox.length).toBe(0);
  });

  it("selectAdapters: an invalid preset (unknown adapter) falls through to prompting", async () => {
    const prompts = makeFakePrompts({ checkbox: ["claude"] });
    const result = await selectAdapters(prompts, "windsurf");
    expect(result).toEqual(["claude"]);
    expect(prompts.calls.checkbox.length).toBe(1);
  });

  it("selectAdapters: no preset, empty checkbox answer falls back to the default (all five)", async () => {
    const prompts = makeFakePrompts({ checkbox: [] });
    const result = await selectAdapters(prompts);
    expect(result).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });

  it("selectAdapters: no preset, user picks explicitly", async () => {
    const prompts = makeFakePrompts({ checkbox: ["claude"] as AdapterType[] });
    const result = await selectAdapters(prompts);
    expect(result).toEqual(["claude"]);
  });
});

describe("wizard step 5: preview-plan.ts (reuses resolvePacks + computeRenderPlan, writes nothing)", () => {
  it("buildPreviewPlan against the real bundled packs: common+next installed (decisions.md D26), files listed", () => {
    const plan = buildPreviewPlan({ repoTypes: ["next"], adapters: ["claude"], monorepo: false });
    // razor is always-resolved alongside common and installable once imported (decisions.md D26).
    expect(plan.installedPacks).toEqual(["common", "next", "razor"]);
    expect(plan.plannedPacks).toEqual([]);
    expect(plan.files.length).toBeGreaterThan(0);
    expect(plan.files.every((f) => f.startsWith(".claude/"))).toBe(true);
  });

  it("formatPreviewHuman renders packs + files as readable text", () => {
    const plan = buildPreviewPlan({ repoTypes: ["next"], adapters: ["claude"], monorepo: false });
    const text = formatPreviewHuman(plan);
    expect(text).toMatch(/Packs to install/);
    expect(text).toMatch(/Files that will be generated/);
    expect(text).toMatch(/\.claude\//);
  });

  it("writes nothing to disk (scratch-dir rendering, discarded)", () => {
    // No assertion needed beyond "does not throw and returns data" — computeRenderPlan's own
    // scratch-dir/mkdtemp cleanup is covered by render-plan's existing tests; this just proves
    // the wizard step doesn't add a real targetDir write path of its own.
    expect(() => buildPreviewPlan({ repoTypes: ["next"], adapters: ["claude"], monorepo: false })).not.toThrow();
  });
});

describe("wizard step 6: confirm.ts", () => {
  it("a --yes preset short-circuits to true without prompting", async () => {
    const prompts = makeFakePrompts({ confirm: false });
    const result = await confirmInstall(prompts, true);
    expect(result).toBe(true);
    expect(prompts.calls.confirm.length).toBe(0);
  });

  it("no preset -> prompts and returns the user's answer", async () => {
    const prompts = makeFakePrompts({ confirm: false });
    const result = await confirmInstall(prompts);
    expect(result).toBe(false);
    expect(prompts.calls.confirm.length).toBe(1);
  });
});

describe("wizard steps 2-3 (monorepo): select-targets.ts workspace discovery", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-select-targets-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("discovers candidates from pnpm-workspace.yaml's packages: glob list, with per-candidate type guesses", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web", dependencies: { next: "^15.0.0" } }), "utf8");
    mkdirSync(join(root, "apps", "api"), { recursive: true });
    writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "^10.0.0" } }), "utf8");

    const candidates = discoverWorkspaceCandidates(root);
    expect(candidates.map((c) => c.path).sort()).toEqual(["apps/api", "apps/web"]);
    const web = candidates.find((c) => c.path === "apps/web");
    expect(web?.guesses[0]?.type).toBe("next");
    const api = candidates.find((c) => c.path === "apps/api");
    expect(api?.guesses[0]?.type).toBe("nest");
  });

  it("discovers candidates from package.json workspaces array", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }), "utf8");
    mkdirSync(join(root, "packages", "theme"), { recursive: true });
    writeFileSync(join(root, "packages", "theme", "package.json"), JSON.stringify({ name: "theme" }), "utf8");

    const candidates = discoverWorkspaceCandidates(root);
    expect(candidates.map((c) => c.path)).toEqual(["packages/theme"]);
  });

  it("ignores a workspace directory entry that has no package.json (not a real project)", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(root, "apps", "not-a-project"), { recursive: true });
    expect(discoverWorkspaceCandidates(root)).toEqual([]);
  });

  it("returns an empty list (manual fallback territory) when no workspace globs are found at all", () => {
    writeFileSync(join(root, "turbo.json"), "{}", "utf8"); // a monorepo signal, but no workspaces glob
    expect(discoverWorkspaceCandidates(root)).toEqual([]);
  });

  it("never throws on a malformed pnpm-workspace.yaml", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "not: [valid, yaml, packages", "utf8");
    expect(() => discoverWorkspaceCandidates(root)).not.toThrow();
  });
});

describe("wizard step 8: extras.ts (spec §7.10, decisions.md D17) — interactive prompt wrapper", () => {
  let notInstalledHome: string;
  let installedHome: string;
  let scratchRoot: string;
  let successBin: string;
  let failBin: string;
  let sentinel: string;

  beforeEach(() => {
    notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-extras-notinstalled-"));
    installedHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-extras-installed-"));
    mkdirSync(join(installedHome, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
    scratchRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-wizard-extras-bin-"));
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
    rmSync(notInstalledHome, { recursive: true, force: true });
    rmSync(installedHome, { recursive: true, force: true });
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("already installed: skips the prompt entirely, never spawns", async () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const prompts = makeFakePrompts({});
    const logs: string[] = [];
    const report = await runExtrasWizardStep(prompts, (m) => logs.push(m), { homeDir: installedHome });
    expect(report).toEqual({ offered: false, accepted: false, succeeded: false });
    expect(prompts.calls.confirm.length).toBe(0);
    expect(existsSync(sentinel)).toBe(false);
  });

  it("not installed, declined (default No): offered true, accepted false, nothing spawned", async () => {
    const prompts = makeFakePrompts({ confirm: false });
    const report = await runExtrasWizardStep(prompts, () => {}, { homeDir: notInstalledHome });
    expect(report).toEqual({ offered: true, accepted: false, succeeded: false });
    expect(prompts.calls.confirm.length).toBe(1);
    expect((prompts.calls.confirm[0] as { defaultValue?: boolean }).defaultValue).toBe(false);
    expect(existsSync(sentinel)).toBe(false);
  });

  it("not installed, accepted, success override: spawns via override, sentinel created, succeeded true", async () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const prompts = makeFakePrompts({ confirm: true });
    const report = await runExtrasWizardStep(prompts, () => {}, { homeDir: notInstalledHome });
    expect(report).toEqual({ offered: true, accepted: true, succeeded: true });
    expect(existsSync(sentinel)).toBe(true);
  });

  it("not installed, accepted, failing override: succeeded false, warning logged, still returns cleanly", async () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = failBin;
    const prompts = makeFakePrompts({ confirm: true });
    const logs: string[] = [];
    const report = await runExtrasWizardStep(prompts, (m) => logs.push(m), { homeDir: notInstalledHome });
    expect(report).toEqual({ offered: true, accepted: true, succeeded: false });
    expect(logs.some((l) => /warning/.test(l))).toBe(true);
  });
});

describe("wizard step 5: select-skills.ts (spec §7.1, decisions.md D19)", () => {
  const ADAPTERS: AdapterType[] = ["claude"];
  // D26: repoTypes for the applicability filter — none of this describe block's fake catalog
  // entries declare `applicability`, so any non-empty RepoType[] is a no-op filter here.
  const REPO_TYPES: RepoType[] = ["next"];
  const CATALOG: SkillCatalogEntry[] = [
    { pack: "common", skill: "required-a", enablement: "required", supportedAdapters: ["claude"], requires: [] },
    { pack: "common", skill: "default-a", enablement: "default", supportedAdapters: ["claude"], requires: [] },
    { pack: "common", skill: "optional-a", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
  ];

  it("planSkillSelectionStep: required is checked+disabled, default checked+togglable, optional unchecked+togglable, label carries tier+pack", () => {
    const plan = planSkillSelectionStep(CATALOG, ADAPTERS, REPO_TYPES);
    const required = plan.choices.find((c) => c.value === "required-a");
    const def = plan.choices.find((c) => c.value === "default-a");
    const optional = plan.choices.find((c) => c.value === "optional-a");

    expect(required?.checked).toBe(true);
    expect(required?.disabled).toBeTruthy();
    expect(required?.name).toMatch(/required/);
    expect(required?.name).toMatch(/common/);

    expect(def?.checked).toBe(true);
    expect(def?.disabled).toBe(false);

    expect(optional?.checked).toBe(false);
    expect(optional?.disabled).toBe(false);
  });

  it("selectSkills: a preset (either --exclude-skills or --include-skills given) short-circuits without prompting", async () => {
    const prompts = makeFakePrompts({});
    const result = await selectSkills(prompts, CATALOG, ADAPTERS, REPO_TYPES, ["default-a"], undefined);
    expect(result).toEqual({ excluded: ["default-a"], included: [] });
    expect(prompts.calls.checkbox.length).toBe(0);
  });

  it("selectSkills: an explicitly empty preset array ALSO short-circuits (distinct from 'no preset at all')", async () => {
    const prompts = makeFakePrompts({});
    const result = await selectSkills(prompts, CATALOG, ADAPTERS, REPO_TYPES, [], []);
    expect(result).toEqual({ excluded: [], included: [] });
    expect(prompts.calls.checkbox.length).toBe(0);
  });

  it("selectSkills: nothing togglable at all (every skill required) skips the prompt entirely", async () => {
    const allRequired: SkillCatalogEntry[] = [
      { pack: "common", skill: "required-a", enablement: "required", supportedAdapters: ["claude"], requires: [] },
    ];
    const prompts = makeFakePrompts({});
    const result = await selectSkills(prompts, allRequired, ADAPTERS, REPO_TYPES);
    expect(result).toEqual({ excluded: [], included: [] });
    expect(prompts.calls.checkbox.length).toBe(0);
  });

  it("selectSkills: real toggle flow — user unchecks the default and checks the optional (required stays locked in the answer regardless)", async () => {
    // Simulates the real @inquirer/prompts checkbox behavior: the FINAL answer array is exactly
    // what the user left checked — required-a stays in it (locked, they could never uncheck it),
    // default-a is user-deselected, optional-a is user-selected.
    const prompts = makeFakePrompts({ checkbox: ["required-a", "optional-a"] });
    const result = await selectSkills(prompts, CATALOG, ADAPTERS, REPO_TYPES);
    expect(result).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
    expect(prompts.calls.checkbox.length).toBe(1);
  });

  it("selectSkills: user leaves everything at its default (required+default checked, optional unchecked) -> empty deltas", async () => {
    const prompts = makeFakePrompts({ checkbox: ["required-a", "default-a"] });
    const result = await selectSkills(prompts, CATALOG, ADAPTERS, REPO_TYPES);
    expect(result).toEqual({ excluded: [], included: [] });
  });
});

describe("wizard step 5 — D21 skill dependencies: adapter-gated offerability + lock/release", () => {
  const ALL_ADAPTERS: AdapterType[] = ["claude", "cursor", "copilot"];
  // D26: repoTypes for the applicability filter — none of this describe block's fake catalog
  // entries declare `applicability`, so any non-empty RepoType[] is a no-op filter here.
  const REPO_TYPES2: RepoType[] = ["next"];

  it("planSkillSelectionStep: an adapter-ineligible default/optional skill is OMITTED from the choice list entirely", () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "req", enablement: "required", supportedAdapters: ["claude"], requires: [] },
      { pack: "common", skill: "claude-only-optional", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
      { pack: "common", skill: "portable-default", enablement: "default", supportedAdapters: ["claude", "cursor"], requires: [] },
    ];
    const plan = planSkillSelectionStep(catalog, ["cursor"], REPO_TYPES2);
    expect(plan.choices.find((c) => c.value === "claude-only-optional")).toBeUndefined();
    expect(plan.choices.find((c) => c.value === "portable-default")).toBeDefined();
    // Required entries are NEVER filtered by adapter eligibility (existing D8 per-adapter render
    // skip already handles that case; D21 does not change required-tier offerability).
    expect(plan.choices.find((c) => c.value === "req")).toBeDefined();
  });

  it("selectSkills: a dependent whose OWN dependency is adapter-ineligible is itself not offerable (defensive — brief item 5)", async () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "dependent", enablement: "optional", supportedAdapters: ["claude", "cursor"], requires: ["dep"] },
      { pack: "common", skill: "dep", enablement: "default", supportedAdapters: ["claude"], requires: [] },
      // A normal, portable optional skill so the prompt is not entirely skipped ("nothing
      // togglable") — this test is specifically about "dependent" being absent from the choices,
      // not about the whole catalog collapsing to zero offerable skills.
      { pack: "common", skill: "unrelated-optional", enablement: "optional", supportedAdapters: ["cursor"], requires: [] },
    ];
    const prompts = makeFakePrompts({ checkbox: [] });
    await selectSkills(prompts, catalog, ["cursor"], REPO_TYPES2);
    const shown = prompts.calls.checkbox[0] as { choices: WizardChoice<string>[] };
    expect(shown.choices.find((c) => c.value === "dependent")).toBeUndefined();
    expect(shown.choices.find((c) => c.value === "unrelated-optional")).toBeDefined();
  });

  it("selectSkills: enabling a dependent whose deps are already default-tier (already checked) converges in ONE round", async () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "dependent", enablement: "optional", supportedAdapters: ["claude"], requires: ["dep"] },
      { pack: "common", skill: "dep", enablement: "default", supportedAdapters: ["claude"], requires: [] },
    ];
    // Round-1 answer: user checks "dependent" in addition to everything already checked ("dep").
    const prompts = makeFakePrompts({ checkbox: [["dependent", "dep"]] });
    const result = await selectSkills(prompts, catalog, ["claude"], REPO_TYPES2);
    expect(result).toEqual({ excluded: [], included: ["dependent"] });
    expect(prompts.calls.checkbox.length).toBe(1);
  });

  it("selectSkills: enabling a dependent pulls an optional-tier dep the user hadn't checked -> SECOND round shows it locked+checked, final deltas include the whole closure", async () => {
    // grill-me -> grilling (decisions.md D21's own dangling-dependency example), both optional.
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "grill-me", enablement: "optional", supportedAdapters: ["claude"], requires: ["grilling"] },
      { pack: "common", skill: "grilling", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
    ];
    // Round 1: user checks only "grill-me" — "grilling" isn't checked yet (not shown locked yet).
    // Round 2: the code re-shows the checkbox with "grilling" now locked+checked; the (faithful)
    // scripted answer includes it, since a disabled+checked row is returned regardless of user
    // input (same established convention as the existing required-tier test above).
    const prompts = makeFakePrompts({ checkbox: [["grill-me"], ["grill-me", "grilling"]] });
    const result = await selectSkills(prompts, catalog, ["claude"], REPO_TYPES2);
    expect(result).toEqual({ excluded: [], included: ["grill-me", "grilling"] });
    expect(prompts.calls.checkbox.length).toBe(2);

    const round2 = prompts.calls.checkbox[1] as { choices: WizardChoice<string>[] };
    const grillingChoice = round2.choices.find((c) => c.value === "grilling");
    expect(grillingChoice?.checked).toBe(true);
    expect(grillingChoice?.disabled).toBeTruthy();
    expect(grillingChoice?.name).toMatch(/required by grill-me/);
  });

  it("selectSkills: a diamond dependency stays locked while ANY dependent is on, and releases once the last one is turned off", async () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "dep-x", enablement: "optional", supportedAdapters: ["claude"], requires: ["shared"] },
      { pack: "common", skill: "dep-y", enablement: "optional", supportedAdapters: ["claude"], requires: ["shared"] },
      { pack: "common", skill: "shared", enablement: "optional", supportedAdapters: ["claude"], requires: [] },
    ];
    // Round 1: check both dependents, neither shared yet.
    // Round 2: shared is now locked+checked (required by both) — the user (per this script) then
    // turns dep-x off; dep-y stays on, so shared MUST remain locked in the final result.
    const prompts = makeFakePrompts({
      checkbox: [
        ["dep-x", "dep-y"],
        ["dep-y", "shared"],
      ],
    });
    const result = await selectSkills(prompts, catalog, ["claude"], REPO_TYPES2);
    expect(result.included.sort()).toEqual(["dep-y", "shared"]);
    expect(result.included).not.toContain("dep-x");
  });

  it("selectSkills: locked entries always resolve via all adapters when none narrow eligibility", () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "req", enablement: "required", supportedAdapters: ["claude"], requires: [] },
    ];
    const plan = planSkillSelectionStep(catalog, ALL_ADAPTERS, REPO_TYPES2);
    expect(plan.choices).toHaveLength(1);
  });
});

describe("wizard step 5 — D26: descriptions + clash disclaimer (synthetic catalog)", () => {
  const ADAPTERS: AdapterType[] = ["claude"];
  const REPO_TYPES: RepoType[] = ["next"];

  it("planSkillSelectionStep: a choice's description is the skill's skill.json description verbatim", () => {
    const catalog: SkillCatalogEntry[] = [
      {
        pack: "common",
        skill: "plain-skill",
        enablement: "default",
        supportedAdapters: ["claude"],
        requires: [],
        description: "Does one thing well.",
      },
    ];
    const plan = planSkillSelectionStep(catalog, ADAPTERS, REPO_TYPES);
    const choice = plan.choices.find((c) => c.value === "plain-skill");
    expect(choice?.description).toBe("Does one thing well.");
  });

  it("planSkillSelectionStep: a skill with no description at all has an undefined choice description (no clash either)", () => {
    const catalog: SkillCatalogEntry[] = [
      { pack: "common", skill: "bare-skill", enablement: "default", supportedAdapters: ["claude"], requires: [] },
    ];
    const plan = planSkillSelectionStep(catalog, ADAPTERS, REPO_TYPES);
    expect(plan.choices.find((c) => c.value === "bare-skill")?.description).toBeUndefined();
  });

  it("planSkillSelectionStep: clashesWith appends a NON-BLOCKING overlap disclaimer, resolving razor: ids to '<name> (razor)' and bare ids as-is — never disables the choice", () => {
    const catalog: SkillCatalogEntry[] = [
      {
        pack: "common",
        skill: "codebase-design",
        enablement: "optional",
        supportedAdapters: ["claude"],
        requires: [],
        description: "Shared vocabulary for designing deep modules.",
        clashesWith: ["razor:boundaries-follow-authority", "razor:ownership-before-abstraction"],
      },
      {
        pack: "common",
        skill: "grill-me",
        enablement: "optional",
        supportedAdapters: ["claude"],
        requires: [],
        clashesWith: ["constraints-are-code"], // a bare (non-razor-prefixed) clash id.
      },
    ];
    const plan = planSkillSelectionStep(catalog, ADAPTERS, REPO_TYPES);

    const codebaseDesign = plan.choices.find((c) => c.value === "codebase-design");
    expect(codebaseDesign?.description).toBe(
      "Shared vocabulary for designing deep modules. ⚠ Overlaps with: boundaries-follow-authority (razor), ownership-before-abstraction (razor) — enable at your discretion.",
    );
    // Purely informational — never blocks/disables the choice (owner's headline ask).
    expect(codebaseDesign?.disabled).toBe(false);

    const grillMe = plan.choices.find((c) => c.value === "grill-me");
    expect(grillMe?.description).toBe(" ⚠ Overlaps with: constraints-are-code — enable at your discretion.".trim());
    expect(grillMe?.disabled).toBe(false);
  });
});

/**
 * D26 razor applicability offer filter (board decision d20) against the REAL bundled
 * `packs/razor` (curated applicability data, not a synthetic fixture) — proves the wizard-time
 * filter end to end: a `nest` install offers nest-scoped + universal razor skills, and omits
 * next-only ones entirely (not shown disabled — omitted, same D21 "omitted, not disabled"
 * posture the adapter-ineligibility filter already established).
 */
describe("wizard step 5 — D26 razor applicability wizard-time filter (real bundled packs/razor)", () => {
  it("nest install offers a nest-only razor skill and a universal razor skill, but omits a next-only razor skill", () => {
    const resolved = resolvePacks({ requestedPacks: ["nest"], monorepo: false });
    const catalog = buildSkillCatalog(resolved.installable, getPacksPath());

    const plan = planSkillSelectionStep(catalog, ["claude"], ["nest"]);
    const values = new Set(plan.choices.map((c) => c.value));

    // authenticate-once-authorize-again's applicability is ["nest"] only.
    expect(values.has("authenticate-once-authorize-again")).toBe(true);
    // bounded-diff's applicability spans all 8 repo types (D26 "universal" category).
    expect(values.has("bounded-diff")).toBe(true);
    // caching-is-never-accidental's applicability is ["next"] only — must be OMITTED for a nest install.
    expect(values.has("caching-is-never-accidental")).toBe(false);
  });

  it("next install offers the next-only razor skill and omits the nest-only one — filter works both directions", () => {
    const resolved = resolvePacks({ requestedPacks: ["next"], monorepo: false });
    const catalog = buildSkillCatalog(resolved.installable, getPacksPath());

    const plan = planSkillSelectionStep(catalog, ["claude"], ["next"]);
    const values = new Set(plan.choices.map((c) => c.value));

    expect(values.has("caching-is-never-accidental")).toBe(true);
    expect(values.has("bounded-diff")).toBe(true);
    expect(values.has("authenticate-once-authorize-again")).toBe(false);
  });
});
