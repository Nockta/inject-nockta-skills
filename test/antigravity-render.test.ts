import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAntigravityAdapter } from "../src/adapters/antigravity/render.js";
import type { ResolvedPackEntry } from "../src/packs/resolve-packs.js";

/**
 * Unit coverage for the antigravity adapter (decisions.md D35) — the FULL-injection peer of the
 * claude adapter. Mirrors `test/claude-render.test.ts` exactly, but outputs land under
 * `.agents/skills/<skill>/` (Antigravity workspace-skill convention) instead of `.claude/skills/`,
 * and skill-local `agents/*.md` are NEVER emitted (Antigravity has no agents-dir concept).
 */
function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function makePackEntry(packsRoot: string, name: string, skills: string[]): ResolvedPackEntry {
  const path = join(packsRoot, name);
  return {
    name,
    path,
    manifest: {
      name,
      displayName: name,
      description: `${name} pack`,
      requires: [],
      skills,
      adapters: ["antigravity"],
    },
    installable: true,
    skills: skills.map((s) => ({ name: s, hasContent: true })),
  };
}

describe("renderAntigravityAdapter", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-antigravity-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-antigravity-target-"));
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("renders the full skill dir into .agents/skills/<skill>/ for an antigravity-supported skill", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "skill-a");
    writeFile(join(skillDir, "SKILL.md"), "# Skill A");
    writeFile(join(skillDir, "references.md"), "refs");
    writeFile(join(skillDir, "examples", "one.md"), "example one");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: "skill-a", supportedAdapters: ["antigravity"], outputs: { antigravity: { skills: true } } }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["skill-a"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a"]) });

    expect(result.skipped).toEqual([]);
    expect(existsSync(join(targetDir, ".agents", "skills", "skill-a", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".agents", "skills", "skill-a", "references.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".agents", "skills", "skill-a", "examples", "one.md"))).toBe(true);
    expect(readFileSync(join(targetDir, ".agents", "skills", "skill-a", "SKILL.md"), "utf8")).toBe("# Skill A");
    // Never emits under .claude/.
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);

    const skillMdRecord = result.written.find((f) => f.relativePath.endsWith("SKILL.md"));
    expect(skillMdRecord?.relativePath).toBe(".agents/skills/skill-a/SKILL.md");
    expect(skillMdRecord?.adapter).toBe("antigravity");
    expect(skillMdRecord?.pack).toBe("testpack");
    expect(skillMdRecord?.skill).toBe("skill-a");
    expect(skillMdRecord?.kind).toBe("skill");
    expect(skillMdRecord?.overridden).toBe(false);
  });

  it("Part A completeness (D8/D26/D35): blocklist copy ships companion docs, scripts/, assets/ — never skill.json or .DS_Store", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "heavy-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Heavy Skill");
    writeFile(join(skillDir, "COMPANION.md"), "companion doc content");
    writeFile(join(skillDir, "scripts", "validate.mjs"), "#!/usr/bin/env node\nconsole.log('validated');");
    writeFile(join(skillDir, "assets", "types", "index.json"), "{}");
    writeFile(join(skillDir, ".DS_Store"), "clutter");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: "heavy-skill", supportedAdapters: ["antigravity"], outputs: { antigravity: { skills: true } } }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["heavy-skill"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["heavy-skill"]) });

    const outDir = join(targetDir, ".agents", "skills", "heavy-skill");
    expect(existsSync(join(outDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(outDir, "COMPANION.md"))).toBe(true);
    expect(existsSync(join(outDir, "scripts", "validate.mjs"))).toBe(true);
    expect(readFileSync(join(outDir, "scripts", "validate.mjs"), "utf8")).toContain("validated");
    expect(existsSync(join(outDir, "assets", "types", "index.json"))).toBe(true);

    expect(existsSync(join(outDir, "skill.json"))).toBe(false);
    expect(existsSync(join(outDir, ".DS_Store"))).toBe(false);
    expect(result.written.some((f) => f.relativePath.endsWith("skill.json"))).toBe(false);
    expect(result.written.some((f) => f.relativePath.endsWith(".DS_Store"))).toBe(false);
    // 4 real files copied (SKILL.md, COMPANION.md, validate.mjs, index.json); skill.json/.DS_Store excluded.
    expect(result.written.length).toBe(4);
  });

  it("D35: a skill-local agents/*.md is NEVER emitted (Antigravity has no agents-dir concept)", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "skill-with-agent");
    writeFile(join(skillDir, "SKILL.md"), "# Has Agent");
    writeFile(join(skillDir, "agents", "worker.md"), "You are a worker...");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "skill-with-agent",
        supportedAdapters: ["antigravity"],
        // Even with agents:true declared, antigravity never registers agents.
        outputs: { antigravity: { skills: true, agents: true } },
      }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["skill-with-agent"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-with-agent"]) });

    // The agents/*.md file DOES copy as an ordinary skill-dir companion file (full-dir injection),
    // but ONLY inside the skill dir — never promoted to a top-level `.agents/agents/` registry.
    expect(existsSync(join(targetDir, ".agents", "skills", "skill-with-agent", "agents", "worker.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".agents", "agents"))).toBe(false);
    // No RenderedFile is ever emitted with kind "agent".
    expect(result.written.some((f) => f.kind === "agent")).toBe(false);
    expect(result.written.every((f) => f.kind === "skill")).toBe(true);
  });

  it("adapter-restriction: a claude-only skill does not render for antigravity", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "claude-only-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Claude Only");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "claude-only-skill",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true }, antigravity: false },
      }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["claude-only-skill"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["claude-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([
      {
        pack: "testpack",
        skill: "claude-only-skill",
        reason: 'adapter-restricted: supportedAdapters=[claude] (no "antigravity")',
      },
    ]);
    expect(existsSync(join(targetDir, ".agents"))).toBe(false);
  });

  it("outputs.antigravity false/undeclared -> skipped, never an error", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "no-output-skill");
    writeFile(join(skillDir, "SKILL.md"), "# No Output");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "no-output-skill",
        supportedAdapters: ["antigravity"],
        outputs: { antigravity: false },
      }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["no-output-skill"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["no-output-skill"]) });

    expect(result.written).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/outputs\.antigravity is false/);
    expect(existsSync(join(targetDir, ".agents"))).toBe(false);
  });

  it("D1 override rule: packs/<pack>/adapters/antigravity/skills/ content wins over the base transform", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "overridden-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Base content (should NOT appear in output)");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "overridden-skill",
        supportedAdapters: ["antigravity"],
        outputs: { antigravity: { skills: true } },
      }),
    );
    const overridePath = join(
      packsRoot,
      "testpack",
      "adapters",
      "antigravity",
      "skills",
      "overridden-skill",
      "SKILL.md",
    );
    writeFile(overridePath, "# Hand-authored Antigravity override (SHOULD appear in output)");

    const packs = [makePackEntry(packsRoot, "testpack", ["overridden-skill"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["overridden-skill"]) });

    const outputPath = join(targetDir, ".agents", "skills", "overridden-skill", "SKILL.md");
    expect(readFileSync(outputPath, "utf8")).toBe("# Hand-authored Antigravity override (SHOULD appear in output)");

    const record = result.written.find((f) => f.relativePath.endsWith("SKILL.md"));
    expect(record?.overridden).toBe(true);
    expect(record?.sourcePath).toBe(overridePath);
  });

  it("a skill excluded by the effective set is skipped (D19), not rendered", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "unselected-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Unselected");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: "unselected-skill", supportedAdapters: ["antigravity"], outputs: { antigravity: { skills: true } } }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["unselected-skill"])];
    const result = renderAntigravityAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set() });

    expect(result.written).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/excluded by skill selection/);
  });
});
