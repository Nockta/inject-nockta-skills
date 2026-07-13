import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult, formatInstallHuman } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { getPacksPath } from "../src/packs/get-pack-path.js";
import { EXTRAS_BIN_OVERRIDE_ENV_VAR } from "../src/core/run-extras.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * End-to-end install pipeline test against the REAL bundled `packs/`
 * (post-import: common is installable, spec §5.10/decisions.md D6) and a
 * throwaway vitest temp dir standing in for a target repo.
 */
describe("install e2e (buildInstallResult, real bundled packs/common)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-e2e-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("rejects missing --type", () => {
    const result = buildInstallResult({ adapters: "claude", yes: true, targetDir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("rejects an unknown --type", () => {
    const result = buildInstallResult({ type: "sveltekit", adapters: "claude", yes: true, targetDir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("rejects missing --yes (no interactive confirm path exists yet)", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude", targetDir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/--yes/);
  });

  it("renders cursor (M7 — real renderer now, no longer AdapterNotImplementedError)", () => {
    const result = buildInstallResult({ type: "next", adapters: "cursor", yes: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(targetDir, ".cursor", "rules", "nockta-common.mdc"))).toBe(true);
  });

  it("renders copilot (M7 — real renderer now, no longer AdapterNotImplementedError)", () => {
    const result = buildInstallResult({ type: "next", adapters: "copilot", yes: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(targetDir, ".github", "instructions", "nockta.instructions.md"))).toBe(true);
  });

  it("installs common + next (both installable post-D26 curation import) for --type next", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    // Post-content-import (decisions.md D26): next is now installable too, not just common.
    // razor is always-resolved alongside common (D26) and, once imported, installable too — its
    // 61 skills are all optional-tier, so it contributes zero rendered files by default.
    expect(result.data.installedPacks).toEqual(["common", "next", "razor"]);
    expect(result.data.renderedFileCount).toBeGreaterThan(0);
    // M7 brief item 9: running package version present directly in the JSON payload.
    expect(result.data.version).toBe("9.9.9-test");
    expect(result.data.dryRun).toBe(false);
    expect(result.data.plan).toBeNull();
    // The 3 owner skills are "required" (decisions.md D19). Since D26's curation import, common
    // also carries "default"-tier grill-me whose D21 requires:["grilling"] closure auto-enables
    // + locks its normally-optional dependency even with no --include-skills flag — hence the one
    // recorded delta. next contributes no further requires-closure deltas; razor's 61 optional
    // skills have no requires and stay off by default, contributing none either.
    expect(result.data.skillSelection).toEqual({ excluded: [], included: ["grilling"] });
    // No packs remain skipped — every declared pack now has real authored content.
    expect(result.data.skippedPacks).toEqual([]);

    // .claude/ tree — the 3 imported common skills.
    for (const skill of ["paper-trail", "proof-of-done", "subagent-delegation"]) {
      expect(existsSync(join(targetDir, ".claude", "skills", skill, "SKILL.md"))).toBe(true);
    }
    // subagent-delegation's agents/worker.md -> .claude/agents/worker.md (D8 mapping).
    expect(existsSync(join(targetDir, ".claude", "agents", "worker.md"))).toBe(true);
    // next's default-tier react-best-practices skill also renders.
    expect(existsSync(join(targetDir, ".claude", "skills", "react-best-practices", "SKILL.md"))).toBe(true);

    // Safety boundary (spec §14, decisions.md D34): .claude/ + .nockta/, PLUS the two root
    // standing-mode files — AGENTS.md (single-source contract, written on every install even
    // without the agent adapter) and CLAUDE.md (@AGENTS.md import, claude selected).
    expect(readdirSync(targetDir).sort()).toEqual([".claude", ".nockta", "AGENTS.md", "CLAUDE.md"]);

    // Standing-mode contract (decisions.md D34): the block lives in AGENTS.md; CLAUDE.md imports it.
    const agentsMd = readFileSync(join(targetDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toMatch(/<!-- nockta:standing-mode:start -->/);
    expect(agentsMd).toMatch(/subagent-delegation/);
    expect(readFileSync(join(targetDir, "CLAUDE.md"), "utf8")).toMatch(/@AGENTS\.md/);
  });

  it("writes .nockta/skills-profile.json matching spec §10.1", () => {
    buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packageVersion: "9.9.9-test" });

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.tool).toBe("inject-nockta-skills");
    expect(profile.isMonorepo).toBe(false);
    expect(profile.repoTypes).toEqual(["next"]);
    expect(profile.installedPacks).toEqual(["common", "next", "razor"]);
    expect(profile.installedAdapters).toEqual(["claude"]);
    expect(profile.source).toEqual({ type: "bundled", package: "inject-nockta-skills", version: "9.9.9-test" });
    expect(typeof profile.createdAt).toBe("string");
    expect(typeof profile.updatedAt).toBe("string");
    expect(() => new Date(profile.createdAt).toISOString()).not.toThrow();
  });

  it("writes .nockta/generated-manifest.json with independently-verifiable hashes (D3)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files.length).toBe(result.data.renderedFileCount);

    const paperTrailRecord = manifest.files.find((f: { path: string }) => f.path.endsWith("paper-trail/SKILL.md"));
    expect(paperTrailRecord).toBeDefined();
    expect(paperTrailRecord.adapter).toBe("claude");
    expect(paperTrailRecord.pack).toBe("common");
    expect(paperTrailRecord.skill).toBe("paper-trail");
    expect(paperTrailRecord.generatorVersion).toBe("9.9.9-test");

    // Recompute the hash independently and compare — do not trust the
    // manifest's own numbers without verification (proof-of-done).
    const outputPath = join(targetDir, paperTrailRecord.path);
    const recomputedOutputHash = sha256(outputPath);
    expect(recomputedOutputHash).toBe(paperTrailRecord.outputHash);

    const sourcePath = join(getPacksPath(), "common", "skills", "paper-trail", "SKILL.md");
    const recomputedSourceHash = sha256(sourcePath);
    expect(recomputedSourceHash).toBe(paperTrailRecord.sourceHash);

    // No override authored for paper-trail yet — source and output hash match.
    expect(paperTrailRecord.sourceHash).toBe(paperTrailRecord.outputHash);
  });
});

/**
 * Part A renderer-completeness proof (brief: blocklist copy, decisions.md D8/D26) against the
 * REAL bundled `packs/` — a companion-bearing skill (`codebase-design`) and a heavy,
 * scripts+gz-assets-bundled skill (`shopify-polaris-admin-extensions`), both real authored
 * content, not synthetic fixtures. Complements `test/claude-render.test.ts`'s synthetic-fixture
 * mechanics test with proof against what actually ships.
 */
describe("install e2e — Part A renderer completeness (real bundled packs, companion + heavy skills)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-render-completeness-e2e-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("a companion-bearing skill (codebase-design) ships its companion docs alongside SKILL.md", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      includeSkills: "codebase-design",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    const skillDir = join(targetDir, ".claude", "skills", "codebase-design");
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillDir, "DEEPENING.md"))).toBe(true);
    expect(existsSync(join(skillDir, "DESIGN-IT-TWICE.md"))).toBe(true);
    // Nockta-internal packaging metadata never ships.
    expect(existsSync(join(skillDir, "skill.json"))).toBe(false);
  });

  it("a heavy skill (shopify-polaris-admin-extensions) ships its own scripts/ + gz-only assets/ self-contained", () => {
    const result = buildInstallResult({
      type: "shopify-app",
      adapters: "claude",
      includeSkills: "shopify-polaris-admin-extensions",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    const skillDir = join(targetDir, ".claude", "skills", "shopify-polaris-admin-extensions");
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillDir, "scripts", "validate.mjs"))).toBe(true);
    expect(existsSync(join(skillDir, "package.json"))).toBe(true); // the skill's OWN package.json (its `typescript` dependency) ships too — full self-containment.
    expect(existsSync(join(skillDir, "assets", "types", "index.json"))).toBe(true);
    const gzFiles = readdirSync(join(skillDir, "assets", "types", "preact", "10.29.2"));
    expect(gzFiles.length).toBeGreaterThan(0);
    expect(existsSync(join(skillDir, "skill.json"))).toBe(false);

    // doctor sees a healthy install and TRACKS every one of these extra files (companions,
    // scripts, gz assets) — none of them are "unknown" or "missing".
    const doctorResult = buildDoctorResult({ targetDir, packageVersion: "9.9.9-test" });
    expect(doctorResult.exitCode).toBe(0);
    expect(doctorResult.data.healthy).toBe(true);
    expect(doctorResult.data.counts.missing).toBe(0);
    expect(doctorResult.data.counts.modified).toBe(0);
    const validateRecord = doctorResult.data.files.find(
      (f) => f.path === ".claude/skills/shopify-polaris-admin-extensions/scripts/validate.mjs",
    );
    expect(validateRecord?.classification).toBe("intact");
    const gzAssetRecord = doctorResult.data.files.find((f) =>
      f.path.startsWith(".claude/skills/shopify-polaris-admin-extensions/assets/"),
    );
    expect(gzAssetRecord?.classification).toBe("intact");
  });
});

describe("install e2e — --with-claude-mem non-interactive extras wiring (spec §7.10, decisions.md D17)", () => {
  let targetDir: string;
  let notInstalledHome: string;
  let scratchRoot: string;
  let successBin: string;
  let failBin: string;
  let sentinel: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-e2e-extras-"));
    notInstalledHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-e2e-extras-home-"));
    scratchRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-e2e-extras-bin-"));
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

  it("withClaudeMem absent: extras never runs — no sentinel, data.extras undefined, install unaffected", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.extras).toBeUndefined();
    expect(existsSync(sentinel)).toBe(false);
  });

  it("withClaudeMem true, success override: extras runs after install succeeds, sentinel created", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      withClaudeMem: true,
      targetDir,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.extras).toEqual({ offered: true, accepted: true, succeeded: true });
    expect(existsSync(sentinel)).toBe(true);
  });

  it("withClaudeMem true, failing override: install exit code/ok UNCHANGED, extras.succeeded false, warning recorded", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = failBin;
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      withClaudeMem: true,
      targetDir,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.extras).toEqual({ offered: true, accepted: true, succeeded: false });
    expect(result.data.warnings.some((w) => /claude-mem/.test(w))).toBe(true);
  });

  it("withClaudeMem true, already installed: skipped, never spawns", () => {
    process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR] = successBin;
    const installedHome = mkdtempSync(join(tmpdir(), "inject-nockta-skills-install-e2e-extras-installed-"));
    try {
      mkdirSync(join(installedHome, ".claude", "plugins", "marketplaces", "thedotmack"), { recursive: true });
      const result = buildInstallResult({
        type: "next",
        adapters: "claude",
        yes: true,
        withClaudeMem: true,
        targetDir,
        packageVersion: "9.9.9-test",
        extrasHomeDir: installedHome,
      });
      expect(result.ok).toBe(true);
      expect(result.data.extras).toEqual({ offered: false, accepted: false, succeeded: false });
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(installedHome, { recursive: true, force: true });
    }
  });

  it("withClaudeMem true but install itself fails (bad --type): extras never attempted", () => {
    const result = buildInstallResult({
      type: "not-a-real-type",
      adapters: "claude",
      yes: true,
      withClaudeMem: true,
      targetDir,
      packageVersion: "9.9.9-test",
      extrasHomeDir: notInstalledHome,
    });
    expect(result.ok).toBe(false);
    expect(result.data.extras).toBeUndefined();
    expect(existsSync(sentinel)).toBe(false);
  });
});

/**
 * Part B non-interactive parity (brief item 7, decisions.md D26): `--include-skills <razorSkill>`
 * whose declared `applicability` excludes the current `--type` -> invalid-input exit, against the
 * REAL bundled `packs/razor` (curated applicability data, not a synthetic fixture) — mirrors D21's
 * own adapter-ineligibility non-interactive test (`test/skill-dependencies-e2e.test.ts`'s
 * "improve-codebase-architecture WITHOUT --adapters claude" case) one axis over.
 */
describe("install e2e — Part B razor applicability non-interactive validation (real bundled packs/razor, decisions.md D26)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-razor-applicability-e2e-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("--include-skills of a nest-only razor skill for --type next -> invalid-input exit 1, clear message", () => {
    // authenticate-once-authorize-again's applicability is ["nest"] only (curation-decisions.json).
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
      includeSkills: "authenticate-once-authorize-again",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/not applicable to the selected repo type/);
    expect(result.errors?.[0]).toMatch(/authenticate-once-authorize-again/);
    // Nothing written on the invalid-input path.
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("--include-skills of that SAME razor skill for --type nest (its actual applicability) succeeds and renders", () => {
    const result = buildInstallResult({
      type: "nest",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
      includeSkills: "authenticate-once-authorize-again",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(targetDir, ".claude", "skills", "authenticate-once-authorize-again", "SKILL.md"))).toBe(true);
  });

  it("--include-skills of a UNIVERSAL razor skill (applicability spans all 8 repo types) succeeds for any --type", () => {
    // bounded-diff's applicability covers every repo type (D26 "universal" category).
    const result = buildInstallResult({
      type: "shopify-theme",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
      includeSkills: "bounded-diff",
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(targetDir, ".claude", "skills", "bounded-diff", "SKILL.md"))).toBe(true);
  });
});

/**
 * RED-1 disclosure (packs-redistribution-audit.md, owner ruling: "just disclose, the user wants
 * to opt-out or not that is theirs"): `install` surfaces a one-line Shopify-telemetry notice —
 * present in `data.notices` (and the human summary) whenever a `shopify-*` pack was actually
 * installed, absent otherwise. Scripts themselves are untouched by this — see
 * `core/shopify-telemetry-notice.ts`.
 */
describe("install e2e — RED-1 Shopify telemetry disclosure notice", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-notice-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("a shopify-app install carries the telemetry notice in data.notices and the human summary", () => {
    const result = buildInstallResult({
      type: "shopify-app",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.notices).toHaveLength(1);
    expect(result.data.notices[0]).toMatch(/OPT_OUT_INSTRUMENTATION=true/);
    expect(result.data.notices[0]).toMatch(/shopify\.dev/);
  });

  it("a shopify-headless install and a shopify-theme install both carry the notice too", () => {
    const headlessDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-notice-headless-"));
    const themeDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-notice-theme-"));
    try {
      const headless = buildInstallResult({
        type: "shopify-headless",
        adapters: "claude",
        yes: true,
        targetDir: headlessDir,
        packageVersion: "9.9.9-test",
      });
      expect(headless.data.notices).toHaveLength(1);

      const theme = buildInstallResult({
        type: "shopify-theme",
        adapters: "claude",
        yes: true,
        targetDir: themeDir,
        packageVersion: "9.9.9-test",
      });
      expect(theme.data.notices).toHaveLength(1);
    } finally {
      rmSync(headlessDir, { recursive: true, force: true });
      rmSync(themeDir, { recursive: true, force: true });
    }
  });

  it("a non-shopify install (next) carries NO telemetry notice", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.notices).toEqual([]);
  });

  it("--dry-run for a shopify type still surfaces the notice (would-install, not just installed)", () => {
    const result = buildInstallResult({
      type: "shopify-app",
      adapters: "claude",
      dryRun: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(true);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.notices).toHaveLength(1);
    // dry-run never writes.
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("the human summary includes the notice line only when a shopify pack was installed", () => {
    const shopifyDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-human-shopify-"));
    const nextDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-red1-human-next-"));
    try {
      const shopify = buildInstallResult({
        type: "shopify-app",
        adapters: "claude",
        yes: true,
        targetDir: shopifyDir,
        packageVersion: "9.9.9-test",
      });
      const human = formatInstallHuman(shopify);
      expect(human).toMatch(/OPT_OUT_INSTRUMENTATION=true/);

      const next = buildInstallResult({
        type: "next",
        adapters: "claude",
        yes: true,
        targetDir: nextDir,
        packageVersion: "9.9.9-test",
      });
      const humanNext = formatInstallHuman(next);
      expect(humanNext).not.toMatch(/OPT_OUT_INSTRUMENTATION/);
    } finally {
      rmSync(shopifyDir, { recursive: true, force: true });
      rmSync(nextDir, { recursive: true, force: true });
    }
  });
});
