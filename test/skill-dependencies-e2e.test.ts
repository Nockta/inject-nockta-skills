import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { buildUpgradeResult } from "../src/commands/upgrade.js";

/**
 * End-to-end skill-DEPENDENCY tests (decisions.md D21) against a SYNTHETIC fixture `packsRoot`
 * (`mkdtemp`) — mirrors `test/skill-selection-e2e.test.ts`'s fixture-pack mechanism exactly, one
 * level up: this fixture ALSO declares `requires` edges, encoding the two REAL edges named in
 * D21's decision record verbatim (the mattpocock cluster and grill-me are not yet imported into
 * `packs/common/` — see `src/core/CONTEXT.md`'s import-time-authoring note — so this is where the
 * mechanism is proven against real names ahead of that import).
 */

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function writeSkill(
  packsRoot: string,
  pack: string,
  skill: string,
  enablement: "required" | "default" | "optional",
  opts: { supportedAdapters?: string[]; requires?: string[] } = {},
): void {
  const skillDir = join(packsRoot, pack, "skills", skill);
  writeFile(join(skillDir, "SKILL.md"), `# ${skill}\n\n${enablement}-tier skill.`);
  writeFile(
    join(skillDir, "skill.json"),
    JSON.stringify({
      name: skill,
      supportedAdapters: opts.supportedAdapters ?? ["claude"],
      outputs: { claude: { skills: true }, cursor: { skills: true }, copilot: { skills: true } },
      enablement,
      ...(opts.requires ? { requires: opts.requires } : {}),
    }),
  );
}

function writePack(packsRoot: string, name: string, displayName: string, skills: string[]): void {
  writeFile(
    join(packsRoot, name, "pack.json"),
    JSON.stringify({ name, displayName, description: `${displayName} pack`, requires: [], skills, adapters: ["claude", "cursor", "copilot"] }),
  );
}

/**
 * `common`: `required-a` (required, portable) + the D21 decision-record edges verbatim —
 * `improve-codebase-architecture` (optional, CLAUDE-ONLY) requiring `codebase-design`/`grilling`/
 * `domain-modeling` (all default-tier, portable), and `grill-me` (optional) requiring `grilling`
 * (the pre-existing "dangling dependency" D21 closes). `next` is a harmless planned pack (declared,
 * no `SKILL.md` content) — `resolvePacks()` needs SOME pack dir to exist for `--type next`.
 */
function buildFixture(packsRoot: string): void {
  writePack(packsRoot, "common", "Common", [
    "required-a",
    "codebase-design",
    "grilling",
    "domain-modeling",
    "improve-codebase-architecture",
    "grill-me",
  ]);
  writeSkill(packsRoot, "common", "required-a", "required");
  writeSkill(packsRoot, "common", "codebase-design", "default");
  writeSkill(packsRoot, "common", "grilling", "default");
  writeSkill(packsRoot, "common", "domain-modeling", "default");
  writeSkill(packsRoot, "common", "improve-codebase-architecture", "optional", {
    supportedAdapters: ["claude"],
    requires: ["codebase-design", "grilling", "domain-modeling"],
  });
  writeSkill(packsRoot, "common", "grill-me", "optional", { requires: ["grilling"] });
  writePack(packsRoot, "next", "Next.js", ["placeholder"]);
  // razor is now always-resolved alongside common (decisions.md D26) — declared only (no
  // SKILL.md content), so resolvePacks() doesn't report it "missing" and trip install's hard
  // "requested pack(s) not found on disk" error; stays D6-"planned".
  writePack(packsRoot, "razor", "Razor Principles", ["placeholder-razor-skill"]);
}

function claudeSkillPath(skill: string): string {
  return join(".claude", "skills", skill, "SKILL.md");
}

describe("skill dependencies e2e (decisions.md D21) — fixture packsRoot with the mattpocock/grill-me edges", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-target-"));
    buildFixture(packsRoot);
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("no deltas: improve-codebase-architecture and grill-me stay off (optional-tier default), deps render only because they're default-tier anyway", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packsRoot, packageVersion: "1.0.0" });
    expect(result.ok).toBe(true);
    expect(result.data.renderedFiles).not.toContain(claudeSkillPath("improve-codebase-architecture"));
    expect(result.data.renderedFiles).not.toContain(claudeSkillPath("grill-me"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("codebase-design"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("grilling"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("domain-modeling"));
  });

  it("--include-skills improve-codebase-architecture with --adapters claude pulls+renders its whole closure, recorded in the written profile deltas", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "improve-codebase-architecture",
    });
    expect(result.ok).toBe(true);
    expect(result.data.renderedFiles).toContain(claudeSkillPath("improve-codebase-architecture"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("codebase-design"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("grilling"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("domain-modeling"));

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.skillSelection.included).toEqual(["improve-codebase-architecture"]);
  });

  it("--include-skills improve-codebase-architecture WITHOUT --adapters claude -> invalid-input exit 1 (D21's own worked example)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "cursor",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "improve-codebase-architecture",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/not supported by the selected adapter/);
  });

  it("--include-skills grill-me auto-satisfies its dangling dependency on grilling (D21's closing example)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "grill-me",
    });
    expect(result.ok).toBe(true);
    expect(result.data.renderedFiles).toContain(claudeSkillPath("grill-me"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("grilling"));

    // "grilling" is DEFAULT-tier in this fixture (already effective without any delta) — the
    // closure adds no delta for a dependency that was already on by tier default (see
    // `test/skill-selection.test.ts`'s "a default-tier dependency already on needs no delta").
    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.skillSelection.included).toEqual(["grill-me"]);
  });

  it("--exclude-skills of a dependency still required by an enabled dependent -> invalid-input exit 1, naming the dependent", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "grill-me",
      excludeSkills: "grilling",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/cannot exclude "grilling": still required by grill-me/);
  });

  it("doctor stays healthy after installing a dependency-closed selection — a locked dep is never 'missing'", () => {
    buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "improve-codebase-architecture",
    });

    const doctor = buildDoctorResult({ targetDir, packsRoot, packageVersion: "1.0.0" });
    expect(doctor.ok).toBe(true);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.data.healthy).toBe(true);
    expect(doctor.data.counts.missing).toBe(0);
    expect(doctor.data.counts.unknown).toBe(0);
  });

  it("upgrade recomputes the SAME dependency-closed effective set from stored deltas — closure survives a version bump", () => {
    buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "grill-me",
    });

    const upgrade = buildUpgradeResult({ targetDir, packsRoot, packageVersion: "2.0.0" });
    expect(upgrade.ok).toBe(true);
    expect(upgrade.exitCode).toBe(0);
    const rendered = [...upgrade.data.restored, ...upgrade.data.refreshed];
    expect(rendered).toContain(claudeSkillPath("grill-me"));
    expect(rendered).toContain(claudeSkillPath("grilling"));

    const doctor = buildDoctorResult({ targetDir, packsRoot, packageVersion: "2.0.0" });
    expect(doctor.data.healthy).toBe(true);
  });
});

describe("skill dependencies e2e (decisions.md D21) — generic linear/diamond/cycle fixtures via install", () => {
  let packsRoot: string;
  let targetDir: string;

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("linear chain a->b->c: including 'a' renders the whole chain", () => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-linear-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-linear-target-"));
    writePack(packsRoot, "common", "Common", ["required-a", "a", "b", "c"]);
    writeSkill(packsRoot, "common", "required-a", "required");
    writeSkill(packsRoot, "common", "a", "optional", { requires: ["b"] });
    writeSkill(packsRoot, "common", "b", "optional", { requires: ["c"] });
    writeSkill(packsRoot, "common", "c", "optional");
    writePack(packsRoot, "next", "Next.js", ["placeholder"]);
    writePack(packsRoot, "razor", "Razor Principles", ["placeholder-razor-skill"]);

    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "a",
    });
    expect(result.ok).toBe(true);
    expect(result.data.renderedFiles).toContain(claudeSkillPath("a"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("b"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("c"));
  });

  it("cycle guard: a<->b requires each other -> render failure surfaces as invalid input, never hangs", () => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-cycle-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-deps-cycle-target-"));
    writePack(packsRoot, "common", "Common", ["required-a", "a", "b"]);
    writeSkill(packsRoot, "common", "required-a", "required");
    writeSkill(packsRoot, "common", "a", "default", { requires: ["b"] });
    writeSkill(packsRoot, "common", "b", "default", { requires: ["a"] });
    writePack(packsRoot, "next", "Next.js", ["placeholder"]);
    writePack(packsRoot, "razor", "Razor Principles", ["placeholder-razor-skill"]);

    const result = buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packsRoot, packageVersion: "1.0.0" });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/dependency cycle detected/);
  });
});
