import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderCursorAdapter } from "../src/adapters/cursor/render.js";
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
    manifest: { name, displayName: `${name} display`, description: `${name} pack`, requires: [], skills, adapters: ["claude", "cursor", "copilot"] },
    installable: true,
    skills: skills.map((s) => ({ name: s, hasContent: true })),
  };
}

describe("renderCursorAdapter (spec §8.3, decisions.md D1/D19)", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-cursor-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-cursor-target-"));
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

  it("renders one .cursor/rules/nockta-<pack>.mdc per pack, with description/globs/alwaysApply frontmatter (decisions.md D20)", () => {
    writeSkill("testpack", "skill-a", "# Skill A body");
    const packs = [makePackEntry(packsRoot, "testpack", ["skill-a"])];

    const result = renderCursorAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a"]) });

    expect(result.skipped).toEqual([]);
    const outputPath = join(targetDir, ".cursor", "rules", "nockta-testpack.mdc");
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf8");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toMatch(/^description:/m);
    expect(content).toMatch(/^globs:\s*$/m);
    expect(content).toMatch(/^alwaysApply: true$/m);
    expect(content).toMatch(/# Skill A body/);
    // D34: references the single-source standing-mode contract in AGENTS.md (does not restate it).
    expect(content).toMatch(/working mode is defined in `AGENTS\.md`/);

    const record = result.written[0];
    expect(record?.relativePath).toBe(".cursor/rules/nockta-testpack.mdc");
    expect(record?.adapter).toBe("cursor");
    expect(record?.pack).toBe("testpack");
    expect(record?.kind).toBe("rule");
    expect(record?.overridden).toBe(false);
    expect(record?.content).toBeInstanceOf(Buffer);
    expect(typeof record?.sourceContentHash).toBe("string");
  });

  it("adapter-restriction: a claude-only skill is excluded from the cursor .mdc, reported skipped", () => {
    writeSkill("testpack", "claude-only-skill", "# Claude Only", ["claude"]);
    const packs = [makePackEntry(packsRoot, "testpack", ["claude-only-skill"])];

    const result = renderCursorAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["claude-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(existsSync(join(targetDir, ".cursor"))).toBe(false);
    expect(result.skipped).toEqual([
      { pack: "testpack", skill: "claude-only-skill", reason: 'adapter-restricted: supportedAdapters=[claude] (no "cursor")' },
    ]);
  });

  it("D19 selection: a skill not in effectiveSkills is excluded and reported skipped", () => {
    writeSkill("testpack", "excluded-skill", "# Excluded");
    writeSkill("testpack", "included-skill", "# Included");
    const packs = [makePackEntry(packsRoot, "testpack", ["excluded-skill", "included-skill"])];

    const result = renderCursorAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["included-skill"]) });

    expect(result.skipped).toContainEqual({
      pack: "testpack",
      skill: "excluded-skill",
      reason: "excluded by skill selection (not in the effective set, decisions.md D19)",
    });
    const content = readFileSync(join(targetDir, ".cursor", "rules", "nockta-testpack.mdc"), "utf8");
    expect(content).toMatch(/# Included/);
    expect(content).not.toMatch(/# Excluded/);
  });

  it("D1 override rule: packs/<pack>/adapters/cursor/<pack>.mdc wins wholesale over the mechanical concatenation", () => {
    writeSkill("testpack", "skill-a", "# Base content (should NOT appear)");
    const packs = [makePackEntry(packsRoot, "testpack", ["skill-a"])];
    const overridePath = join(packsRoot, "testpack", "adapters", "cursor", "testpack.mdc");
    writeFile(overridePath, "---\ndescription: hand-authored\nglobs:\nalwaysApply: true\n---\n\nHand-authored cursor content.");

    const result = renderCursorAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a"]) });

    const outputPath = join(targetDir, ".cursor", "rules", "nockta-testpack.mdc");
    const content = readFileSync(outputPath, "utf8");
    expect(content).toBe("---\ndescription: hand-authored\nglobs:\nalwaysApply: true\n---\n\nHand-authored cursor content.");
    expect(content).not.toMatch(/Base content/);
    expect(result.written[0]?.overridden).toBe(true);
    expect(result.written[0]?.sourcePath).toBe(overridePath);
  });

  it("a pack with zero rendering skills and no override produces no .mdc file at all", () => {
    writeSkill("testpack", "claude-only-skill", "# Claude Only", ["claude"]);
    const packs = [makePackEntry(packsRoot, "testpack", ["claude-only-skill"])];

    const result = renderCursorAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["claude-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(existsSync(join(targetDir, ".cursor"))).toBe(false);
  });
});
