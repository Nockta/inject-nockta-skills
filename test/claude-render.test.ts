import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderClaudeAdapter } from "../src/adapters/claude/render.js";
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
    manifest: {
      name,
      displayName: name,
      description: `${name} pack`,
      requires: [],
      skills,
      adapters: ["claude"],
    },
    installable: true,
    skills: skills.map((s) => ({ name: s, hasContent: true })),
  };
}

describe("renderClaudeAdapter", () => {
  let packsRoot: string;
  let targetDir: string;

  beforeEach(() => {
    packsRoot = mkdtempSync(join(tmpdir(), "inject-nockta-skills-render-packs-"));
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-render-target-"));
  });

  afterEach(() => {
    rmSync(packsRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("renders SKILL.md/worker.md/references.md/examples for a claude-supported skill", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "skill-a");
    writeFile(join(skillDir, "SKILL.md"), "# Skill A");
    writeFile(join(skillDir, "worker.md"), "worker doc");
    writeFile(join(skillDir, "references.md"), "refs");
    writeFile(join(skillDir, "examples", "one.md"), "example one");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: "skill-a", supportedAdapters: ["claude"], outputs: { claude: { skills: true } } }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["skill-a"])];
    const result = renderClaudeAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-a"]) });

    expect(result.skipped).toEqual([]);
    expect(existsSync(join(targetDir, ".claude", "skills", "skill-a", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "skill-a", "worker.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "skill-a", "references.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".claude", "skills", "skill-a", "examples", "one.md"))).toBe(true);
    expect(readFileSync(join(targetDir, ".claude", "skills", "skill-a", "SKILL.md"), "utf8")).toBe("# Skill A");

    const skillMdRecord = result.written.find((f) => f.relativePath.endsWith("SKILL.md"));
    expect(skillMdRecord?.adapter).toBe("claude");
    expect(skillMdRecord?.pack).toBe("testpack");
    expect(skillMdRecord?.skill).toBe("skill-a");
    expect(skillMdRecord?.overridden).toBe(false);
  });

  it("Part A completeness (decisions.md D8/D26): blocklist copy ships companion docs, scripts/, and assets/ verbatim, but never skill.json or .DS_Store", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "heavy-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Heavy Skill");
    writeFile(join(skillDir, "COMPANION.md"), "companion doc content");
    writeFile(join(skillDir, "scripts", "validate.mjs"), "#!/usr/bin/env node\nconsole.log('validated');");
    writeFile(join(skillDir, "assets", "types", "index.json"), "{}");
    writeFile(join(skillDir, "assets", "types", "nested", "pkg.d.ts.gz"), "not-really-gzipped-but-a-binary-stand-in");
    writeFile(join(skillDir, ".DS_Store"), "clutter");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({ name: "heavy-skill", supportedAdapters: ["claude"], outputs: { claude: { skills: true } } }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["heavy-skill"])];
    const result = renderClaudeAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["heavy-skill"]) });

    const outDir = join(targetDir, ".claude", "skills", "heavy-skill");
    expect(existsSync(join(outDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(outDir, "COMPANION.md"))).toBe(true);
    expect(existsSync(join(outDir, "scripts", "validate.mjs"))).toBe(true);
    expect(readFileSync(join(outDir, "scripts", "validate.mjs"), "utf8")).toContain("validated");
    expect(existsSync(join(outDir, "assets", "types", "index.json"))).toBe(true);
    expect(existsSync(join(outDir, "assets", "types", "nested", "pkg.d.ts.gz"))).toBe(true);

    // Blocklist: skill.json (Nockta-internal) and .DS_Store (OS clutter) never ship.
    expect(existsSync(join(outDir, "skill.json"))).toBe(false);
    expect(existsSync(join(outDir, ".DS_Store"))).toBe(false);
    expect(result.written.some((f) => f.relativePath.endsWith("skill.json"))).toBe(false);
    expect(result.written.some((f) => f.relativePath.endsWith(".DS_Store"))).toBe(false);

    // Every copied file is a tracked RenderedFile (manifest coverage) — 5 real files copied
    // (SKILL.md, COMPANION.md, validate.mjs, index.json, pkg.d.ts.gz), skill.json/.DS_Store excluded.
    expect(result.written.length).toBe(5);
  });

  it("renders a skill-local agents/*.md file into .claude/agents/ (flat)", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "skill-with-agent");
    writeFile(join(skillDir, "SKILL.md"), "# Has Agent");
    writeFile(join(skillDir, "agents", "worker.md"), "You are a worker...");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "skill-with-agent",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true, agents: true } },
      }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["skill-with-agent"])];
    const result = renderClaudeAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["skill-with-agent"]) });

    const agentPath = join(targetDir, ".claude", "agents", "worker.md");
    expect(existsSync(agentPath)).toBe(true);
    expect(readFileSync(agentPath, "utf8")).toBe("You are a worker...");

    const agentRecord = result.written.find((f) => f.kind === "agent");
    expect(agentRecord?.relativePath).toBe(".claude/agents/worker.md");
  });

  it("adapter-restriction: a cursor-only skill does not render for claude", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "cursor-only-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Cursor Only");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "cursor-only-skill",
        supportedAdapters: ["cursor"],
        outputs: { cursor: { skills: true }, claude: false },
      }),
    );

    const packs = [makePackEntry(packsRoot, "testpack", ["cursor-only-skill"])];
    const result = renderClaudeAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["cursor-only-skill"]) });

    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([
      {
        pack: "testpack",
        skill: "cursor-only-skill",
        reason: 'adapter-restricted: supportedAdapters=[cursor] (no "claude")',
      },
    ]);
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("D1 override rule: packs/<pack>/adapters/claude/ content wins over the base skill transform", () => {
    const skillDir = join(packsRoot, "testpack", "skills", "overridden-skill");
    writeFile(join(skillDir, "SKILL.md"), "# Base content (should NOT appear in output)");
    writeFile(
      join(skillDir, "skill.json"),
      JSON.stringify({
        name: "overridden-skill",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
      }),
    );
    const overridePath = join(
      packsRoot,
      "testpack",
      "adapters",
      "claude",
      "skills",
      "overridden-skill",
      "SKILL.md",
    );
    writeFile(overridePath, "# Hand-authored Claude override (SHOULD appear in output)");

    const packs = [makePackEntry(packsRoot, "testpack", ["overridden-skill"])];
    const result = renderClaudeAdapter({ targetDir, packs, packsRoot, effectiveSkills: new Set(["overridden-skill"]) });

    const outputPath = join(targetDir, ".claude", "skills", "overridden-skill", "SKILL.md");
    expect(readFileSync(outputPath, "utf8")).toBe("# Hand-authored Claude override (SHOULD appear in output)");

    const record = result.written.find((f) => f.relativePath.endsWith("SKILL.md"));
    expect(record?.overridden).toBe(true);
    expect(record?.sourcePath).toBe(overridePath);
  });
});
