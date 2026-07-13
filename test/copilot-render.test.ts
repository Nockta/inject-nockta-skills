import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderCopilotAdapter, COPILOT_INSTRUCTIONS_RELATIVE_PATH } from "../src/adapters/copilot/render.js";
import type { ResolvedPackEntry } from "../src/packs/resolve-packs.js";

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function makePackEntry(packsRoot: string, name: string, skills: string[]): ResolvedPackEntry {
  const path = join(packsRoot, name);
  return {
    name,
    path,
    manifest: { name, displayName: `${name} display`, description: `${name} description`, requires: [], skills, adapters: ["claude", "cursor", "copilot"] },
    installable: true,
    skills: skills.map((s) => ({ name: s, hasContent: true })),
  };
}

describe("renderCopilotAdapter (spec §8.4, decisions.md D1/D19)", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-copilot-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-copilot-target-"));
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  function writeSkill(pack: string, skill: string, content: string, supportedAdapters = ["claude", "cursor", "copilot"]): void {
    const skillDir = join(packsRoot, pack, "skills", skill);
    writeFile(join(skillDir, "SKILL.md"), content);
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: skill,
        supportedAdapters,
        outputs: {
          claude: { skills: true },
          cursor: supportedAdapters.includes("cursor") ? { skills: true } : false,
          copilot: supportedAdapters.includes("copilot") ? { skills: true } : false,
        },
      }),
    );
  }

  it("renders exactly ONE .github/instructions/nockta.instructions.md with applyTo frontmatter, sections per pack", () => {
    writeSkill("pack-a", "skill-a", "# Skill A body");
    writeSkill("pack-b", "skill-b", "# Skill B body");
    const packs = [makePackEntry(packsRoot, "pack-a", ["skill-a"]), makePackEntry(packsRoot, "pack-b", ["skill-b"])];

    const result = renderCopilotAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a", "skill-b"]) });

    expect(result.written.length).toBe(1);
    const outputPath = join(targetDir, ".github", "instructions", "nockta.instructions.md");
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf8");
    expect(content.startsWith('---\napplyTo: "**"\n---\n')).toBe(true);
    expect(content).toMatch(/# Skill A body/);
    expect(content).toMatch(/# Skill B body/);
    expect(content).toMatch(/pack-a display/);
    expect(content).toMatch(/pack-b display/);
    // D34: references the single-source standing-mode contract in AGENTS.md (does not restate it).
    expect(content).toMatch(/working mode is defined in `AGENTS\.md`/);

    const record = result.written[0];
    expect(record?.relativePath).toBe(COPILOT_INSTRUCTIONS_RELATIVE_PATH);
    expect(record?.adapter).toBe("copilot");
    expect(record?.pack).toBe("pack-a,pack-b");
    expect(record?.skill).toBeUndefined();
    expect(record?.kind).toBe("instructions");

    // Never touches .github/copilot-instructions.md (spec §8.4).
    expect(existsSync(join(targetDir, ".github", "copilot-instructions.md"))).toBe(false);
  });

  it("adapter-restriction: a claude-only skill is excluded from the combined file, reported skipped", () => {
    writeSkill("pack-a", "claude-only-skill", "# Claude Only", ["claude"]);
    const packs = [makePackEntry(packsRoot, "pack-a", ["claude-only-skill"])];

    const result = renderCopilotAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["claude-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(existsSync(join(targetDir, ".github"))).toBe(false);
    expect(result.skipped).toEqual([
      { pack: "pack-a", skill: "claude-only-skill", reason: 'adapter-restricted: supportedAdapters=[claude] (no "copilot")' },
    ]);
  });

  it("D19 selection: a deselected skill is excluded from the combined file, reported skipped", () => {
    writeSkill("pack-a", "excluded-skill", "# Excluded");
    writeSkill("pack-a", "included-skill", "# Included");
    const packs = [makePackEntry(packsRoot, "pack-a", ["excluded-skill", "included-skill"])];

    const result = renderCopilotAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["included-skill"]) });

    expect(result.skipped).toContainEqual({
      pack: "pack-a",
      skill: "excluded-skill",
      reason: "excluded by skill selection (not in the effective set, decisions.md D19)",
    });
    const content = readFileSync(join(targetDir, ".github", "instructions", "nockta.instructions.md"), "utf8");
    expect(content).toMatch(/# Included/);
    expect(content).not.toMatch(/# Excluded/);
  });

  it("D1 override rule: packs/<pack>/adapters/copilot/<pack>.md wins wholesale for that pack's section", () => {
    writeSkill("pack-a", "skill-a", "# Base content (should NOT appear)");
    const packs = [makePackEntry(packsRoot, "pack-a", ["skill-a"])];
    const overridePath = join(packsRoot, "pack-a", "adapters", "copilot", "pack-a.md");
    writeFile(overridePath, "Hand-authored copilot section.");

    const result = renderCopilotAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a"]) });

    const content = readFileSync(join(targetDir, ".github", "instructions", "nockta.instructions.md"), "utf8");
    expect(content).toMatch(/Hand-authored copilot section\./);
    expect(content).not.toMatch(/Base content/);
    expect(result.written[0]?.overridden).toBe(true);
  });

  it("zero rendering skills across every pack produces no file at all", () => {
    writeSkill("pack-a", "claude-only-skill", "# Claude Only", ["claude"]);
    const packs = [makePackEntry(packsRoot, "pack-a", ["claude-only-skill"])];

    const result = renderCopilotAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["claude-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(existsSync(join(targetDir, ".github"))).toBe(false);
  });
});
