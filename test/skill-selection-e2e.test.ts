import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { buildUpgradeResult } from "../src/commands/upgrade.js";

/**
 * End-to-end skill-selection tests (decisions.md D19) against a SYNTHETIC fixture `packsRoot`
 * (`mkdtemp`) — the real bundled `packs/common` has zero default/optional-tier skills (all 3 are
 * "required"), so exercising exclude/include and the doctor/upgrade merge policy needs a fixture
 * with all three tiers present, same "fixture pack tree" convention `test/claude-render.test.ts`/
 * `test/cursor-render.test.ts` already use.
 */

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function writeSkill(packsRoot: string, pack: string, skill: string, enablement: "required" | "default" | "optional"): void {
  const skillDir = join(packsRoot, pack, "skills", skill);
  writeFile(join(skillDir, "SKILL.md"), `# ${skill}\n\n${enablement}-tier skill.`);
  writeFile(
    join(skillDir, "skill.json"),
    JSON.stringify({
      name: skill,
      supportedAdapters: ["claude"],
      outputs: { claude: { skills: true } },
      enablement,
    }),
  );
}

function writePack(packsRoot: string, name: string, displayName: string, skills: string[]): void {
  writeFile(
    join(packsRoot, name, "pack.json"),
    JSON.stringify({ name, displayName, description: `${displayName} pack`, requires: [], skills, adapters: ["claude"] }),
  );
}

/** v1 fixture: common has 1 required + 2 default + 1 optional skill; `next` is a harmless planned pack (no real content — resolvePacks() requires SOME pack dir to exist for --type next, even if not installable). */
function buildFixtureV1(packsRoot: string): void {
  writePack(packsRoot, "common", "Common", ["required-a", "default-a", "default-b", "optional-a"]);
  writeSkill(packsRoot, "common", "required-a", "required");
  writeSkill(packsRoot, "common", "default-a", "default");
  writeSkill(packsRoot, "common", "default-b", "default");
  writeSkill(packsRoot, "common", "optional-a", "optional");
  writePack(packsRoot, "next", "Next.js", ["placeholder"]); // declared, no SKILL.md -> stays "planned"
  // razor is now always-resolved alongside common (decisions.md D26) — declared only, so
  // resolvePacks() doesn't report it "missing" (which would hard-error install); stays "planned".
  writePack(packsRoot, "razor", "Razor Principles", ["placeholder-razor-skill"]);
}

/** v2 fixture: same as v1, PLUS a new default skill (default-c) and a new optional skill (optional-b) — simulates "a newer pack version" for the upgrade merge-policy test. */
function buildFixtureV2(packsRoot: string): void {
  buildFixtureV1(packsRoot);
  writePack(packsRoot, "common", "Common", ["required-a", "default-a", "default-b", "default-c", "optional-a", "optional-b"]);
  writeSkill(packsRoot, "common", "default-c", "default");
  writeSkill(packsRoot, "common", "optional-b", "optional");
}

function claudeSkillPath(skill: string): string {
  return join(".claude", "skills", skill, "SKILL.md");
}

describe("skill selection e2e (decisions.md D19) — fixture packsRoot with all 3 tiers", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-selection-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-selection-target-"));
    buildFixtureV1(packsRoot);
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("no deltas: required+default render, optional stays off", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packsRoot, packageVersion: "1.0.0" });
    expect(result.ok).toBe(true);
    expect(result.data.renderedFiles).toContain(claudeSkillPath("required-a"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("default-a"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("default-b"));
    expect(result.data.renderedFiles).not.toContain(claudeSkillPath("optional-a"));
    expect(result.data.skillSelection).toEqual({ excluded: [], included: [] });
  });

  it("--exclude-skills / --include-skills round-trip into the written profile verbatim", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      excludeSkills: "default-a",
      includeSkills: "optional-a",
    });
    expect(result.ok).toBe(true);
    expect(result.data.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
    expect(result.data.renderedFiles).not.toContain(claudeSkillPath("default-a"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("default-b"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("optional-a"));
    expect(result.data.renderedFiles).toContain(claudeSkillPath("required-a"));

    const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
    expect(profile.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });
  });

  it("excluding a required skill -> invalid-input exit code (1), nothing written", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      excludeSkills: "required-a",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/cannot exclude required skill/);
  });

  it("unknown skill name in --exclude-skills -> invalid-input exit code (1)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      excludeSkills: "does-not-exist",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/unknown skill name/);
  });

  it("unknown skill name in --include-skills -> invalid-input exit code (1)", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      includeSkills: "does-not-exist",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("doctor reports healthy (excluded skill is NOT misclassified as missing)", () => {
    buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packsRoot,
      packageVersion: "1.0.0",
      excludeSkills: "default-a",
    });

    const doctor = buildDoctorResult({ targetDir, packsRoot, packageVersion: "1.0.0" });
    expect(doctor.ok).toBe(true);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.data.healthy).toBe(true);
    expect(doctor.data.counts.missing).toBe(0);
    expect(doctor.data.skillSelection).toEqual({ excluded: ["default-a"], included: [] });
  });

  describe("upgrade merge policy (brief item 6): CURRENT pack contents + STORED deltas", () => {
    it("a new default skill in a newer pack version joins automatically; a new optional stays off; toggles preserved", () => {
      buildInstallResult({
        type: "next",
        adapters: "claude",
        yes: true,
        targetDir,
        packsRoot,
        packageVersion: "1.0.0",
        excludeSkills: "default-a",
        includeSkills: "optional-a",
      });

      // Simulate a pack upgrade: the SAME packsRoot dir gains a new default + new optional skill.
      buildFixtureV2(packsRoot);

      const upgrade = buildUpgradeResult({ targetDir, packsRoot, packageVersion: "2.0.0" });
      expect(upgrade.ok).toBe(true);
      expect(upgrade.exitCode).toBe(0);

      const rendered = [...upgrade.data.restored, ...upgrade.data.refreshed];
      expect(rendered).toContain(claudeSkillPath("default-c")); // new default -> joins automatically
      expect(rendered).not.toContain(claudeSkillPath("optional-b")); // new optional -> stays off
      expect(rendered).not.toContain(claudeSkillPath("default-a")); // exclusion toggle preserved
      expect(rendered).toContain(claudeSkillPath("optional-a")); // inclusion toggle preserved

      const profile = JSON.parse(readFileSync(join(targetDir, ".nockta", "skills-profile.json"), "utf8"));
      expect(profile.skillSelection).toEqual({ excluded: ["default-a"], included: ["optional-a"] });

      const doctor = buildDoctorResult({ targetDir, packsRoot, packageVersion: "2.0.0" });
      expect(doctor.data.healthy).toBe(true);
    });
  });
});
