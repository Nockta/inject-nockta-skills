import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractDescriptionFromSkillMd, importPackByCuration, importRazorPack, importSkill } from "../scripts/import-skill.js";

/**
 * Exercises the dev-time importer's stripping rules (spec §12 "Import
 * hygiene", decisions.md D8) against synthetic gathered-skill fixtures, plus
 * (for the razor layer) a round-trip against this package's OWN bundled
 * `packs/razor/skills/` content — never against the sibling `planned
 * skills/` workspace directory (outside the package, dev-machine-only, not
 * part of the published npm tree; see the "packages-OWN bundled razor
 * content" describe block below for why). See test/install-e2e.test.ts for
 * the common-pack real-content install path.
 */
describe("importSkill", () => {
  let root: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-import-"));
    sourceDir = join(root, "source", "my-skill");
    destDir = join(root, "dest", "skills", "my-skill");
    mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSource(relPath: string, content = "content"): void {
    const full = join(sourceDir, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }

  it("copies everything except the blocklisted clutter (D8 revised: blocklist, not allowlist)", () => {
    // Content — must survive, including companions the old allowlist used to drop.
    writeSource("SKILL.md", "# My Skill");
    writeSource("worker.md", "worker doc");
    writeSource("references.md", "refs");
    writeSource("agents/reviewer.md", "agent doc");
    writeSource("examples/basic.md", "example");
    writeSource("examples/nested/deep.md", "nested example");
    writeSource("DEEPENING.md", "a loose top-level companion .md"); // e.g. codebase-design
    writeSource("scripts/validate.mjs", "// validator script"); // e.g. heavy Shopify skills
    writeSource("assets/types/foo.d.ts", "vendored type tree");
    writeSource("assets/types/foo.d.ts.gz", "gzipped sibling");
    writeSource("references/deep/topic.md", "a references/ directory, not references.md");
    // Known clutter — must be stripped.
    writeSource("manifest.json", "{}");
    writeSource("README-PORTABLE.md", "portable readme");
    writeSource("AGENTS-SNIPPET.md", "snippet");
    writeSource("PROVENANCE.md", "provenance");
    writeSource("VALIDATION.json", "{}");
    writeSource("dist/build.sh", "#!/bin/sh");
    writeSource("dist/portable/.claude/skills/my-skill/SKILL.md", "stale build output");
    writeSource("research/notes.md", "research notes");
    writeSource("notes/scratch.md", "authoring notes");
    writeSource(".DS_Store", "macos cruft");
    writeSource("my-skill-portable.zip", "not really a zip");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill" });

    expect(existsSync(join(destDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(destDir, "worker.md"))).toBe(true);
    expect(existsSync(join(destDir, "references.md"))).toBe(true);
    expect(existsSync(join(destDir, "agents", "reviewer.md"))).toBe(true);
    expect(existsSync(join(destDir, "examples", "basic.md"))).toBe(true);
    expect(existsSync(join(destDir, "examples", "nested", "deep.md"))).toBe(true);
    expect(existsSync(join(destDir, "DEEPENING.md"))).toBe(true);
    expect(existsSync(join(destDir, "scripts", "validate.mjs"))).toBe(true);
    expect(existsSync(join(destDir, "assets", "types", "foo.d.ts"))).toBe(true);
    expect(existsSync(join(destDir, "assets", "types", "foo.d.ts.gz"))).toBe(true);
    expect(existsSync(join(destDir, "references", "deep", "topic.md"))).toBe(true);

    expect(existsSync(join(destDir, "manifest.json"))).toBe(false);
    expect(existsSync(join(destDir, "README-PORTABLE.md"))).toBe(false);
    expect(existsSync(join(destDir, "AGENTS-SNIPPET.md"))).toBe(false);
    expect(existsSync(join(destDir, "PROVENANCE.md"))).toBe(false);
    expect(existsSync(join(destDir, "VALIDATION.json"))).toBe(false);
    expect(existsSync(join(destDir, "dist"))).toBe(false);
    expect(existsSync(join(destDir, "research"))).toBe(false);
    expect(existsSync(join(destDir, "notes"))).toBe(false);
    expect(existsSync(join(destDir, ".DS_Store"))).toBe(false);
    expect(existsSync(join(destDir, "my-skill-portable.zip"))).toBe(false);

    expect(result.strippedTopLevel).toEqual(
      [
        "AGENTS-SNIPPET.md",
        "PROVENANCE.md",
        "README-PORTABLE.md",
        "VALIDATION.json",
        ".DS_Store",
        "dist",
        "manifest.json",
        "my-skill-portable.zip",
        "notes",
        "research",
      ].sort(),
    );
  });

  it("NEVER strips license-bearing files (LICENSE*/NOTICE*/COPYING*) — RED-2 attribution guard, even at top level", () => {
    writeSource("SKILL.md", "# My Skill");
    writeSource("LICENSE.txt", "Apache License 2.0 ...");
    writeSource("LICENSE", "MIT License ...");
    writeSource("LICENSE.md", "MIT License ...");
    writeSource("LICENCE", "British spelling ...");
    writeSource("NOTICE", "Attribution notice ...");
    writeSource("COPYING", "GPL-style copying ...");
    // A blocklisted clutter file alongside — proves the guard is selective, not a blanket keep.
    writeSource("PROVENANCE.md", "provenance");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill" });

    expect(existsSync(join(destDir, "LICENSE.txt"))).toBe(true);
    expect(existsSync(join(destDir, "LICENSE"))).toBe(true);
    expect(existsSync(join(destDir, "LICENSE.md"))).toBe(true);
    expect(existsSync(join(destDir, "LICENCE"))).toBe(true);
    expect(existsSync(join(destDir, "NOTICE"))).toBe(true);
    expect(existsSync(join(destDir, "COPYING"))).toBe(true);
    // Clutter still stripped; no license file appears in strippedTopLevel.
    expect(existsSync(join(destDir, "PROVENANCE.md"))).toBe(false);
    expect(result.strippedTopLevel).toEqual(["PROVENANCE.md"]);
  });

  it("does not strip a NESTED file/dir merely sharing a blocklisted name — only root-level clutter is blocked", () => {
    writeSource("SKILL.md", "# My Skill");
    // A companion example legitimately nested under examples/ named like blocklisted clutter.
    writeSource("examples/manifest.json", '{"note":"this is example content, not authoring scratch"}');
    writeSource("examples/dist/output.txt", "example content, not the skill's own build output");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill" });

    expect(existsSync(join(destDir, "examples", "manifest.json"))).toBe(true);
    expect(existsSync(join(destDir, "examples", "dist", "output.txt"))).toBe(true);
    expect(result.strippedTopLevel).toEqual([]);
  });

  it("a non-.md file under agents/ is copied as a companion but does NOT set outputs.claude.agents (real-world bug: agents/openai.yaml collisions across react-native/expo)", () => {
    writeSource("SKILL.md", "# My Skill");
    writeSource("agents/openai.yaml", "interface:\n  display_name: Not a Claude subagent\n");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill" });

    // Companion survives (it's real skill content, just not a Claude subagent artifact).
    expect(existsSync(join(destDir, "agents", "openai.yaml"))).toBe(true);
    const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));
    expect(skillJson.outputs.claude).toEqual({ skills: true }); // no `agents: true`
  });

  it("a .md file under agents/ (not via workerAsAgent) DOES set outputs.claude.agents", () => {
    writeSource("SKILL.md", "# My Skill");
    writeSource("agents/reviewer.md", "a real Claude subagent definition");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill" });

    expect(existsSync(join(destDir, "agents", "reviewer.md"))).toBe(true);
    const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));
    expect(skillJson.outputs.claude).toEqual({ skills: true, agents: true });
  });

  it("throws when the source has no SKILL.md", () => {
    writeSource("worker.md", "worker doc");
    expect(() => importSkill({ sourceDir, destDir, skillName: "my-skill" })).toThrow(/SKILL\.md/);
  });

  it("is idempotent: re-running wipes stale destination content", () => {
    writeSource("SKILL.md", "# v1");
    importSkill({ sourceDir, destDir, skillName: "my-skill" });
    // Simulate leftover cruft from a previous, differently-shaped import.
    writeFileSync(join(destDir, "stale-leftover.md"), "should not survive", "utf8");

    writeSource("SKILL.md", "# v2");
    importSkill({ sourceDir, destDir, skillName: "my-skill" });

    expect(existsSync(join(destDir, "stale-leftover.md"))).toBe(false);
    expect(readFileSync(join(destDir, "SKILL.md"), "utf8")).toBe("# v2");
  });

  it("authors skill.json with D8 shape: name, supportedAdapters, outputs", () => {
    writeSource("SKILL.md", "# My Skill");

    const result = importSkill({ sourceDir, destDir, skillName: "my-skill", supportedAdapters: ["claude"] });
    const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));

    expect(skillJson).toEqual({
      name: "my-skill",
      supportedAdapters: ["claude"],
      outputs: {
        claude: { skills: true },
        cursor: false,
        copilot: false,
        agent: false,
        antigravity: false,
      },
      enablement: "default",
    });
  });

  it('D8 special mapping: workerAsAgent moves root worker.md to agents/<name>.md and sets outputs.claude.agents', () => {
    writeSource("SKILL.md", "# Subagent Delegation");
    writeSource("worker.md", "You are a worker...");

    const result = importSkill({
      sourceDir,
      destDir,
      skillName: "subagent-delegation",
      workerAsAgent: "worker",
    });

    expect(existsSync(join(destDir, "worker.md"))).toBe(false); // NOT a top-level worker.md
    expect(existsSync(join(destDir, "agents", "worker.md"))).toBe(true);
    expect(readFileSync(join(destDir, "agents", "worker.md"), "utf8")).toBe("You are a worker...");

    const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));
    expect(skillJson.outputs.claude).toEqual({ skills: true, agents: true });
  });
});

describe("extractDescriptionFromSkillMd (decisions.md D26)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-extract-desc-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSkillMd(frontmatter: string, body = "# Body\n"): string {
    const path = join(dir, "SKILL.md");
    writeFileSync(path, `---\n${frontmatter}\n---\n\n${body}`, "utf8");
    return path;
  }

  it("scrapes a folded block scalar (description: >-) across multiple indented lines", () => {
    const path = writeSkillMd(
      ["name: paper-trail", "description: >-", "  Where finished knowledge lives", "  and what to consult before deciding."].join("\n"),
    );
    expect(extractDescriptionFromSkillMd(path)).toBe("Where finished knowledge lives and what to consult before deciding.");
  });

  it("scrapes a quoted inline scalar", () => {
    const path = writeSkillMd('name: brainstorming\ndescription: "You MUST use this before any creative work."');
    expect(extractDescriptionFromSkillMd(path)).toBe("You MUST use this before any creative work.");
  });

  it("scrapes a plain (unquoted) inline scalar", () => {
    const path = writeSkillMd("name: grill-me\ndescription: A relentless interview to sharpen a plan or design.");
    expect(extractDescriptionFromSkillMd(path)).toBe("A relentless interview to sharpen a plan or design.");
  });

  it("returns undefined when the file has no frontmatter at all", () => {
    const path = join(dir, "SKILL.md");
    writeFileSync(path, "# No frontmatter here\n", "utf8");
    expect(extractDescriptionFromSkillMd(path)).toBeUndefined();
  });

  it("returns undefined when frontmatter has no description key", () => {
    const path = writeSkillMd("name: x\ndisable-model-invocation: true");
    expect(extractDescriptionFromSkillMd(path)).toBeUndefined();
  });
});

describe("importPackByCuration (decisions.md D19/D21/D26 curation-aware batch import)", () => {
  let root: string;
  let sourceRoot: string;
  let destRoot: string;
  let curationPath: string;
  let clashMapPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-import-curation-"));
    sourceRoot = join(root, "planned-skills", "common");
    destRoot = join(root, "packs", "common", "skills");
    curationPath = join(root, "curation-decisions.json");
    clashMapPath = join(root, "clash-map.json");
    mkdirSync(sourceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeSourceSkill(name: string, description: string, extraFiles: Record<string, string> = {}): void {
    const dir = join(sourceRoot, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/SKILL.md", `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
    for (const [relPath, content] of Object.entries(extraFiles)) {
      const full = join(dir, relPath);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
  }

  function writeCuration(packs: Record<string, Record<string, { tier: string; requiredBy?: string[] }>>): void {
    writeFileSync(curationPath, JSON.stringify({ packs }), "utf8");
  }

  function writeClashMap(map: Record<string, { clashesWith: string[] }>): void {
    writeFileSync(clashMapPath, JSON.stringify(map), "utf8");
  }

  it("imports only non-drop tiers, mapping tier -> enablement 1:1", () => {
    writeSourceSkill("paper-trail", "Where finished knowledge lives.");
    writeSourceSkill("grill-me", "A relentless interview.");
    writeSourceSkill("codebase-design", "Shared vocabulary for deep modules.");
    writeSourceSkill("systematic-debugging", "Should never be imported.");
    writeCuration({
      common: {
        "paper-trail": { tier: "required" },
        "grill-me": { tier: "default" },
        "codebase-design": { tier: "optional" },
        "systematic-debugging": { tier: "drop" },
      },
    });
    writeClashMap({});

    const results = importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    expect(results.map((r) => r.skillName).sort()).toEqual(["codebase-design", "grill-me", "paper-trail"]);
    expect(existsSync(join(destRoot, "systematic-debugging"))).toBe(false);

    const enablementOf = (name: string) => JSON.parse(readFileSync(join(destRoot, name, "skill.json"), "utf8")).enablement;
    expect(enablementOf("paper-trail")).toBe("required");
    expect(enablementOf("grill-me")).toBe("default");
    expect(enablementOf("codebase-design")).toBe("optional");
  });

  it("pulls description verbatim from each skill's SKILL.md frontmatter", () => {
    writeSourceSkill("grill-me", "A relentless interview to sharpen a plan or design.");
    writeCuration({ common: { "grill-me": { tier: "default" } } });
    writeClashMap({});

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "grill-me", "skill.json"), "utf8"));
    expect(skillJson.description).toBe("A relentless interview to sharpen a plan or design.");
  });

  it("populates clashesWith from clash-map.json by bare skill id, keeping razor: -prefixed refs as-is", () => {
    writeSourceSkill("brainstorming", "Explore before building.");
    writeCuration({ common: { brainstorming: { tier: "default" } } });
    writeClashMap({ brainstorming: { clashesWith: ["razor:constraints-are-code"] } });

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "brainstorming", "skill.json"), "utf8"));
    expect(skillJson.clashesWith).toEqual(["razor:constraints-are-code"]);
  });

  it("omits clashesWith entirely when clash-map.json has no entry for the skill", () => {
    writeSourceSkill("paper-trail", "Where finished knowledge lives.");
    writeCuration({ common: { "paper-trail": { tier: "required" } } });
    writeClashMap({});

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "paper-trail", "skill.json"), "utf8"));
    expect(skillJson.clashesWith).toBeUndefined();
  });

  it("derives requires by inverting requiredBy (decisions.md D21) — the grilling/grill-me + improve-codebase-architecture edges", () => {
    writeSourceSkill("grilling", "Grill relentlessly.");
    writeSourceSkill("grill-me", "A relentless interview.");
    writeSourceSkill("codebase-design", "Shared vocabulary.");
    writeSourceSkill("domain-modeling", "Domain model.");
    writeSourceSkill("improve-codebase-architecture", "Scan for deepening opportunities.");
    writeCuration({
      common: {
        grilling: { tier: "optional", requiredBy: ["improve-codebase-architecture", "grill-me"] },
        "grill-me": { tier: "default" },
        "codebase-design": { tier: "optional", requiredBy: ["improve-codebase-architecture"] },
        "domain-modeling": { tier: "optional", requiredBy: ["improve-codebase-architecture"] },
        "improve-codebase-architecture": { tier: "optional" },
      },
    });
    writeClashMap({});

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    const requiresOf = (name: string) => JSON.parse(readFileSync(join(destRoot, name, "skill.json"), "utf8")).requires;
    expect(requiresOf("grill-me")).toEqual(["grilling"]);
    expect(requiresOf("improve-codebase-architecture").sort()).toEqual(["codebase-design", "domain-modeling", "grilling"].sort());
    expect(requiresOf("grilling")).toBeUndefined(); // grilling itself has no requires — it's the dependency, not the dependent
  });

  it("improve-codebase-architecture is restricted to claude-only supportedAdapters (decisions.md D21); other skills default to all four", () => {
    writeSourceSkill("improve-codebase-architecture", "Scan for deepening opportunities.");
    writeSourceSkill("grill-me", "A relentless interview.");
    writeCuration({
      common: {
        "improve-codebase-architecture": { tier: "optional" },
        "grill-me": { tier: "default" },
      },
    });
    writeClashMap({});

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    const architectureJson = JSON.parse(readFileSync(join(destRoot, "improve-codebase-architecture", "skill.json"), "utf8"));
    // D35: antigravity is the full-injection peer of claude, so this HTML-report/subagent skill —
    // Claude-only for the text adapters — is ALSO offered to antigravity (its full per-skill dir
    // injection carries the machinery). Still off cursor/copilot/agent (no portable prose form).
    expect(architectureJson.supportedAdapters).toEqual(["claude", "antigravity"]);
    expect(architectureJson.outputs).toEqual({ claude: { skills: true }, cursor: false, copilot: false, agent: false, antigravity: { skills: true } });

    const grillMeJson = JSON.parse(readFileSync(join(destRoot, "grill-me", "skill.json"), "utf8"));
    expect(grillMeJson.supportedAdapters).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });

  it("still applies D8 blocklist stripping within curation mode (clutter dropped, companions/scripts kept)", () => {
    writeSourceSkill("grill-me", "A relentless interview.", {
      "PROVENANCE.md": "provenance",
      "scripts/helper.sh": "#!/bin/sh",
    });
    writeCuration({ common: { "grill-me": { tier: "default" } } });
    writeClashMap({});

    const [result] = importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    expect(result?.copied).toEqual(["SKILL.md", "scripts/helper.sh"]);
    expect(result?.strippedTopLevel).toEqual(["PROVENANCE.md"]);
    expect(existsSync(join(destRoot, "grill-me", "PROVENANCE.md"))).toBe(false);
    expect(existsSync(join(destRoot, "grill-me", "scripts", "helper.sh"))).toBe(true);
  });

  it("subagent-delegation's root worker.md still maps to agents/worker.md under curation mode (D8 special mapping)", () => {
    writeSourceSkill("subagent-delegation", "Invoke at the start of any task that requires real work.", {
      "worker.md": "You are a worker...",
    });
    writeCuration({ common: { "subagent-delegation": { tier: "required" } } });
    writeClashMap({});

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    expect(existsSync(join(destRoot, "subagent-delegation", "worker.md"))).toBe(false);
    expect(existsSync(join(destRoot, "subagent-delegation", "agents", "worker.md"))).toBe(true);
    const skillJson = JSON.parse(readFileSync(join(destRoot, "subagent-delegation", "skill.json"), "utf8"));
    expect(skillJson.outputs.claude).toEqual({ skills: true, agents: true });
  });

  it("is idempotent: re-running the curated import does not duplicate or corrupt output", () => {
    writeSourceSkill("grill-me", "A relentless interview.");
    writeCuration({ common: { "grill-me": { tier: "default" } } });
    writeClashMap({ "grill-me": { clashesWith: ["razor:constraints-are-code"] } });

    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });
    writeFileSync(join(destRoot, "grill-me", "stale-leftover.md"), "should not survive", "utf8");
    importPackByCuration("common", { curationPath, clashMapPath, sourceRoot, destRoot });

    expect(existsSync(join(destRoot, "grill-me", "stale-leftover.md"))).toBe(false);
    const skillJson = JSON.parse(readFileSync(join(destRoot, "grill-me", "skill.json"), "utf8"));
    expect(skillJson.clashesWith).toEqual(["razor:constraints-are-code"]);
  });

  it("throws when packs[<pack>] is missing from curation-decisions.json", () => {
    writeCuration({ common: {} });
    writeClashMap({});
    expect(() => importPackByCuration("nonexistent-pack", { curationPath, clashMapPath, sourceRoot, destRoot })).toThrow(
      /no packs\["nonexistent-pack"\]/,
    );
  });
});

describe("importRazorPack (decisions.md D26 Part B — razor principles layer, synthetic fixture)", () => {
  let root: string;
  let sourceRoot: string;
  let destRoot: string;
  let curationPath: string;
  let clashMapPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-import-razor-"));
    // CATEGORIZED source layout: skills/<category>/<name>/SKILL.md — distinct from
    // importPackByCuration's flat planned-skills/<pack>/<name>/ layout.
    sourceRoot = join(root, "planned-skills", "razor", "packs", "razor-principles", "skills");
    destRoot = join(root, "packs", "razor", "skills");
    curationPath = join(root, "curation-decisions.json");
    clashMapPath = join(root, "clash-map.json");
    mkdirSync(sourceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeRazorSourceSkill(category: string, name: string, description: string): void {
    const dir = join(sourceRoot, category, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
  }

  function writeRazorCuration(razor: Record<string, { category: string; applicability: string[] }>): void {
    writeFileSync(
      curationPath,
      JSON.stringify({ razor: Object.fromEntries(Object.entries(razor).map(([k, v]) => [k, { tier: "optional", ...v }])) }),
      "utf8",
    );
  }

  function writeClashMap(map: Record<string, { clashesWith: string[] }>): void {
    writeFileSync(clashMapPath, JSON.stringify(map), "utf8");
  }

  it("imports from the CATEGORIZED source layout into a FLAT destination (category is not a dest dir level)", () => {
    writeRazorSourceSkill("nestjs", "modules-follow-authority", "Structure NestJS modules around domain authority.");
    writeRazorCuration({ "modules-follow-authority": { category: "nestjs", applicability: ["nest"] } });
    writeClashMap({});

    importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    expect(existsSync(join(destRoot, "modules-follow-authority", "SKILL.md"))).toBe(true);
    // No "nestjs" directory level survives into the destination.
    expect(existsSync(join(destRoot, "nestjs"))).toBe(false);
  });

  it("every imported skill is enablement:'optional' — nothing in the razor layer auto-installs", () => {
    writeRazorSourceSkill("core", "trace-before-touch", "Read before you write.");
    writeRazorSourceSkill("nestjs", "modules-follow-authority", "Structure NestJS modules around domain authority.");
    writeRazorCuration({
      "trace-before-touch": { category: "core", applicability: ["next", "nest"] },
      "modules-follow-authority": { category: "nestjs", applicability: ["nest"] },
    });
    writeClashMap({});

    const results = importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    expect(results).toHaveLength(2);
    for (const result of results) {
      const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));
      expect(skillJson.enablement).toBe("optional");
    }
  });

  it("authors skill.json with the full D26 razor shape: name, enablement, description, applicability, clashesWith, category, supportedAdapters", () => {
    writeRazorSourceSkill("nestjs", "modules-follow-authority", "Structure NestJS modules around domain authority.");
    writeRazorCuration({ "modules-follow-authority": { category: "nestjs", applicability: ["nest"] } });
    writeClashMap({ "razor:modules-follow-authority": { clashesWith: ["nestjs-best-practices", "nestjs-expert"] } });

    importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "modules-follow-authority", "skill.json"), "utf8"));
    expect(skillJson).toEqual({
      name: "modules-follow-authority",
      supportedAdapters: ["claude", "cursor", "copilot", "agent", "antigravity"],
      outputs: {
        claude: { skills: true },
        cursor: { skills: true },
        copilot: { skills: true },
        agent: { skills: true, agents: false },
        antigravity: { skills: true },
      },
      enablement: "optional",
      description: "Structure NestJS modules around domain authority.",
      clashesWith: ["nestjs-best-practices", "nestjs-expert"],
      applicability: ["nest"],
      category: "nestjs",
    });
  });

  it("clashesWith is looked up by the razor:<name> id in clash-map.json, but written out bare (external ids as-is)", () => {
    writeRazorSourceSkill("react", "state-has-an-owner", "Assign every React state value one clear owner.");
    writeRazorCuration({
      "state-has-an-owner": {
        category: "react",
        applicability: ["next", "vite-react-ts", "shopify-theme", "shopify-headless", "react-native", "expo"],
      },
    });
    writeClashMap({
      "razor:state-has-an-owner": {
        clashesWith: ["react-best-practices", "react-native-skills", "swm-react-native-best-practices", "wshobson-react-native-design"],
      },
    });

    importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "state-has-an-owner", "skill.json"), "utf8"));
    expect(skillJson.clashesWith).toEqual([
      "react-best-practices",
      "react-native-skills",
      "swm-react-native-best-practices",
      "wshobson-react-native-design",
    ]);
    expect(skillJson.applicability).toEqual(["next", "vite-react-ts", "shopify-theme", "shopify-headless", "react-native", "expo"]);
  });

  it("omits clashesWith entirely when clash-map.json has no razor:<name> entry", () => {
    writeRazorSourceSkill("core", "trace-before-touch", "Read before you write.");
    writeRazorCuration({ "trace-before-touch": { category: "core", applicability: ["next"] } });
    writeClashMap({});

    importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    const skillJson = JSON.parse(readFileSync(join(destRoot, "trace-before-touch", "skill.json"), "utf8"));
    expect(skillJson.clashesWith).toBeUndefined();
  });

  it("imports EVERY entry in the razor curation object — no drop-tier filtering (the razor layer has no drops)", () => {
    writeRazorSourceSkill("core", "a", "Skill A.");
    writeRazorSourceSkill("core", "b", "Skill B.");
    writeRazorSourceSkill("architecture", "c", "Skill C.");
    writeRazorCuration({
      a: { category: "core", applicability: ["next"] },
      b: { category: "core", applicability: ["nest"] },
      c: { category: "architecture", applicability: ["next", "nest"] },
    });
    writeClashMap({});

    const results = importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    expect(results.map((r) => r.skillName).sort()).toEqual(["a", "b", "c"]);
    expect(readdirSync(destRoot).sort()).toEqual(["a", "b", "c"]);
  });

  it("throws when the curation JSON has no top-level 'razor' object", () => {
    writeFileSync(curationPath, JSON.stringify({ packs: {} }), "utf8");
    writeClashMap({});
    expect(() => importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot })).toThrow(/no "razor" object/);
  });

  it("still applies D8 blocklist stripping (clutter dropped) within razor import", () => {
    writeRazorSourceSkill("core", "trace-before-touch", "Read before you write.");
    writeFileSync(join(sourceRoot, "core", "trace-before-touch", "PROVENANCE.md"), "provenance", "utf8");
    writeRazorCuration({ "trace-before-touch": { category: "core", applicability: ["next"] } });
    writeClashMap({});

    const [result] = importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

    expect(result?.copied).toEqual(["SKILL.md"]);
    expect(result?.strippedTopLevel).toEqual(["PROVENANCE.md"]);
  });

  describe("against packages-OWN bundled razor content (packs/razor/skills/ — no `../planned skills/` sibling dependency)", () => {
    // Decoupling note: this suite used to read the real gathered source from the sibling
    // `planned skills/` workspace directory (outside this package, dev-machine-only, not part of
    // the published npm tree). That broke the suite — and `prepublishOnly`, and any future CI
    // publish — anywhere that sibling doesn't exist (batch-verifier ENOENT). `packs/razor/skills/`
    // is this package's OWN bundled duplicate of that same content post-import (already shipped in
    // `files`), so re-deriving the categorized pre-import shape from it and round-tripping through
    // `importRazorPack()` exercises the exact same transformation logic against the exact same real
    // content, self-contained. Per-skill stripping-of-clutter (PROVENANCE.md/research/etc, since
    // `packs/razor` is already-stripped output) and the license-guard matrix are separately covered
    // by the synthetic fixtures above (the "D8 blocklist stripping" and "NEVER strips
    // license-bearing files" tests) — coverage is equal or better, not weakened.
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const realRazorSkillsRoot = join(packageRoot, "packs", "razor", "skills");
    const realSkillNames = readdirSync(realRazorSkillsRoot)
      .filter((name) => statSync(join(realRazorSkillsRoot, name)).isDirectory())
      .sort();

    it("has bundled razor skills to test against (sanity guard against an empty/misconfigured packs/razor)", () => {
      expect(realSkillNames.length).toBeGreaterThan(0);
    });

    it("round-trips every packs/razor/skills/<name>/skill.json byte-identically through importRazorPack (real-content transformation parity, no external sibling dependency)", () => {
      const root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-import-razor-parity-"));
      try {
        const sourceRoot = join(root, "source-categorized");
        const curationPath = join(root, "curation-decisions.json");
        const clashMapPath = join(root, "clash-map.json");
        const destRoot = join(root, "dest");

        const razorCuration: Record<string, { tier: "optional"; category: string; applicability: string[] }> = {};
        const clashMap: Record<string, { clashesWith: string[] }> = {};

        for (const name of realSkillNames) {
          const original = JSON.parse(readFileSync(join(realRazorSkillsRoot, name, "skill.json"), "utf8"));
          razorCuration[name] = { tier: "optional", category: original.category, applicability: original.applicability };
          if (original.clashesWith) clashMap[`razor:${name}`] = { clashesWith: original.clashesWith };

          // Reconstruct the categorized pre-import layout (skills/<category>/<name>/SKILL.md) from
          // the flat post-import destination — the real SKILL.md content, byte-for-byte.
          const srcSkillDir = join(sourceRoot, original.category, name);
          mkdirSync(srcSkillDir, { recursive: true });
          copyFileSync(join(realRazorSkillsRoot, name, "SKILL.md"), join(srcSkillDir, "SKILL.md"));
        }

        writeFileSync(curationPath, JSON.stringify({ razor: razorCuration }), "utf8");
        writeFileSync(clashMapPath, JSON.stringify(clashMap), "utf8");

        const results = importRazorPack({ curationPath, clashMapPath, sourceRoot, destRoot });

        expect(results).toHaveLength(realSkillNames.length);
        for (const result of results) {
          const skillJson = JSON.parse(readFileSync(result.skillJsonPath, "utf8"));
          expect(skillJson.enablement).toBe("optional");
          expect(skillJson.applicability.length).toBeGreaterThan(0);
          expect(typeof skillJson.category).toBe("string");
        }

        for (const name of realSkillNames) {
          const original = readFileSync(join(realRazorSkillsRoot, name, "skill.json"), "utf8");
          const roundTripped = readFileSync(join(destRoot, name, "skill.json"), "utf8");
          expect(roundTripped).toBe(original);
        }

        const modulesFollowAuthority = JSON.parse(readFileSync(join(destRoot, "modules-follow-authority", "skill.json"), "utf8"));
        expect(modulesFollowAuthority.applicability).toEqual(["nest"]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
