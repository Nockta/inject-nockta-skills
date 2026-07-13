import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillManifestError, readSkillManifest } from "../src/packs/read-skill-manifest.js";

describe("readSkillManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-skill-manifest-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeSkillJson(content: unknown): void {
    const body = typeof content === "string" ? content : JSON.stringify(content);
    writeFileSync(join(dir, "skill.json"), body, "utf8");
  }

  it("parses a valid skill.json (D8 shape)", () => {
    writeSkillJson({
      name: "subagent-delegation",
      supportedAdapters: ["claude"],
      outputs: { claude: { skills: true, agents: true }, cursor: false, copilot: false },
    });

    const manifest = readSkillManifest(dir, "subagent-delegation", ["claude"]);

    expect(manifest.name).toBe("subagent-delegation");
    expect(manifest.supportedAdapters).toEqual(["claude"]);
    expect(manifest.outputs.claude).toEqual({ skills: true, agents: true });
    expect(manifest.outputs.cursor).toBe(false);
  });

  it("falls back to a permissive default when skill.json is absent", () => {
    const manifest = readSkillManifest(dir, "some-skill", ["claude", "cursor"]);
    expect(manifest.name).toBe("some-skill");
    expect(manifest.supportedAdapters).toEqual(["claude", "cursor"]);
    expect(manifest.outputs.claude).toEqual({ skills: true });
  });

  it("throws SkillManifestError on invalid JSON", () => {
    writeSkillJson("{ not json");
    expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
  });

  it("throws SkillManifestError when supportedAdapters is missing/empty", () => {
    writeSkillJson({ name: "x", supportedAdapters: [], outputs: {} });
    expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
  });

  it("throws SkillManifestError on an unknown adapter key in outputs", () => {
    writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: { windsurf: { skills: true } } });
    expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
  });

  describe("requires (decisions.md D21)", () => {
    it("parses a valid requires array", () => {
      writeSkillJson({
        name: "grill-me",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
        requires: ["grilling"],
      });
      const manifest = readSkillManifest(dir, "grill-me", ["claude"]);
      expect(manifest.requires).toEqual(["grilling"]);
    });

    it("requires is undefined (not []) when absent — every pre-D21 skill.json needs zero migration", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: { claude: { skills: true } } });
      const manifest = readSkillManifest(dir, "x", ["claude"]);
      expect(manifest.requires).toBeUndefined();
    });

    it("no-skill.json fallback never sets requires", () => {
      const manifest = readSkillManifest(dir, "some-skill", ["claude"]);
      expect(manifest.requires).toBeUndefined();
    });

    it("throws SkillManifestError when requires is not an array of strings", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, requires: "grilling" });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when requires contains an empty string", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, requires: [""] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when requires contains a non-string element", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, requires: ["grilling", 5] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });
  });

  describe("description + clashesWith (decisions.md D26)", () => {
    it("parses a valid description and clashesWith", () => {
      writeSkillJson({
        name: "grill-me",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
        description: "A relentless interview to sharpen a plan or design.",
        clashesWith: ["razor:constraints-are-code"],
      });
      const manifest = readSkillManifest(dir, "grill-me", ["claude"]);
      expect(manifest.description).toBe("A relentless interview to sharpen a plan or design.");
      expect(manifest.clashesWith).toEqual(["razor:constraints-are-code"]);
    });

    it("both are undefined (not '' / []) when absent — every pre-D26 skill.json needs zero migration", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: { claude: { skills: true } } });
      const manifest = readSkillManifest(dir, "x", ["claude"]);
      expect(manifest.description).toBeUndefined();
      expect(manifest.clashesWith).toBeUndefined();
    });

    it("no-skill.json fallback never sets description/clashesWith", () => {
      const manifest = readSkillManifest(dir, "some-skill", ["claude"]);
      expect(manifest.description).toBeUndefined();
      expect(manifest.clashesWith).toBeUndefined();
    });

    it("throws SkillManifestError when description is not a string", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, description: 5 });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when clashesWith is not an array of strings", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, clashesWith: "brainstorming" });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when clashesWith contains an empty string", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, clashesWith: [""] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when clashesWith contains a non-string element", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, clashesWith: ["brainstorming", 5] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });
  });

  describe("applicability (decisions.md D26, razor layer)", () => {
    it("parses a valid applicability array of RepoType values", () => {
      writeSkillJson({
        name: "modules-follow-authority",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
        enablement: "optional",
        applicability: ["nest"],
      });
      const manifest = readSkillManifest(dir, "modules-follow-authority", ["claude"]);
      expect(manifest.applicability).toEqual(["nest"]);
    });

    it("parses a multi-entry applicability array (e.g. the React-family table)", () => {
      writeSkillJson({
        name: "state-has-an-owner",
        supportedAdapters: ["claude"],
        outputs: { claude: { skills: true } },
        applicability: ["next", "vite-react-ts", "shopify-theme", "shopify-headless", "react-native", "expo"],
      });
      const manifest = readSkillManifest(dir, "state-has-an-owner", ["claude"]);
      expect(manifest.applicability).toEqual(["next", "vite-react-ts", "shopify-theme", "shopify-headless", "react-native", "expo"]);
    });

    it("is undefined when absent — every pre-razor skill.json needs zero migration", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: { claude: { skills: true } } });
      const manifest = readSkillManifest(dir, "x", ["claude"]);
      expect(manifest.applicability).toBeUndefined();
    });

    it("no-skill.json fallback never sets applicability", () => {
      const manifest = readSkillManifest(dir, "some-skill", ["claude"]);
      expect(manifest.applicability).toBeUndefined();
    });

    it("throws SkillManifestError when applicability is not an array", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, applicability: "nest" });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when applicability contains an invalid RepoType string", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, applicability: ["nest", "sveltekit"] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });

    it("throws SkillManifestError when applicability contains a non-string element", () => {
      writeSkillJson({ name: "x", supportedAdapters: ["claude"], outputs: {}, applicability: ["nest", 5] });
      expect(() => readSkillManifest(dir, "x", ["claude"])).toThrow(SkillManifestError);
    });
  });
});
