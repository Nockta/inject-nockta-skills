import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePacks } from "../src/packs/resolve-packs.js";

function writePack(
  root: string,
  name: string,
  manifest: Record<string, unknown>,
  skillsWithContent: string[] = [],
): void {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pack.json"), JSON.stringify(manifest), "utf8");
  for (const skill of skillsWithContent) {
    const skillDir = join(dir, "skills", skill);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `# ${skill}\n`, "utf8");
  }
}

function baseManifest(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    description: `${name} pack`,
    requires: [],
    skills: ["placeholder-skill"],
    adapters: ["claude"],
    ...overrides,
  };
}

function allNames(result: { installable: { name: string }[]; planned: { name: string }[] }): string[] {
  return [...result.installable, ...result.planned].map((p) => p.name).sort();
}

describe("resolvePacks", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-resolve-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("always includes common, even with no requested packs and no monorepo mode", () => {
    writePack(root, "common", baseManifest("common"));

    const result = resolvePacks({ packsRoot: root });

    expect(allNames(result)).toContain("common");
  });

  describe("D26: razor is always-resolved alongside common", () => {
    it("razor resolves with no requested packs and no monorepo mode, same as common (fixture packsRoot)", () => {
      writePack(root, "common", baseManifest("common"));
      writePack(root, "razor", baseManifest("razor"));

      const result = resolvePacks({ packsRoot: root });

      expect(allNames(result)).toEqual(["common", "razor"]);
    });

    it("razor resolves alongside a requested stack pack too (fixture packsRoot)", () => {
      writePack(root, "common", baseManifest("common"));
      writePack(root, "razor", baseManifest("razor"));
      writePack(root, "next", baseManifest("next", { requires: ["common"] }));

      const result = resolvePacks({ requestedPacks: ["next"], packsRoot: root });

      expect(allNames(result)).toEqual(["common", "next", "razor"]);
    });

    it("razor missing from disk is reported in `missing`, exactly like a missing common would be — resolver never throws", () => {
      writePack(root, "common", baseManifest("common"));
      // No razor pack.json written.

      const result = resolvePacks({ packsRoot: root });

      expect(result.missing).toContain("razor");
      expect(allNames(result)).not.toContain("razor");
    });

    it("razor is installable when its skills all have real content, even though every skill is optional-tier (nothing auto-installs)", () => {
      writePack(root, "common", baseManifest("common"));
      writePack(root, "razor", baseManifest("razor", { skills: ["trace-before-touch"] }), ["trace-before-touch"]);

      const result = resolvePacks({ packsRoot: root });

      const razor = result.installable.find((p) => p.name === "razor");
      expect(razor).toBeDefined();
      expect(razor?.installable).toBe(true);
    });

    it("razor is always-resolved against the REAL bundled packs too, and installable (61 imported skills, decisions.md D26)", () => {
      const result = resolvePacks({ requestedPacks: ["next"] });

      const razor = result.installable.find((p) => p.name === "razor");
      expect(razor).toBeDefined();
      expect(razor?.installable).toBe(true);
      expect(razor?.skills).toHaveLength(61);
    });
  });

  it("follows requires chains transitively (a -> b -> common)", () => {
    writePack(root, "common", baseManifest("common"));
    writePack(root, "b", baseManifest("b", { requires: ["common"] }));
    writePack(root, "a", baseManifest("a", { requires: ["b"] }));

    const result = resolvePacks({ requestedPacks: ["a"], packsRoot: root });

    expect(allNames(result)).toEqual(["a", "b", "common"]);
  });

  it("includes the monorepo pack only when monorepo mode is requested", () => {
    writePack(root, "common", baseManifest("common"));
    writePack(root, "monorepo", baseManifest("monorepo", { requires: ["common"] }));

    const withoutMonorepo = resolvePacks({ packsRoot: root });
    expect(allNames(withoutMonorepo)).not.toContain("monorepo");

    const withMonorepo = resolvePacks({ monorepo: true, packsRoot: root });
    expect(allNames(withMonorepo)).toContain("monorepo");
  });

  it("D6 gate: a pack with SKILL.md for every declared skill is installable", () => {
    writePack(root, "common", baseManifest("common", { skills: ["paper-trail"] })); // no content -> planned
    writePack(
      root,
      "next",
      baseManifest("next", { requires: ["common"], skills: ["app-router-architect"] }),
      ["app-router-architect"], // has content -> installable
    );

    const result = resolvePacks({ requestedPacks: ["next"], packsRoot: root });

    const common = result.planned.find((p) => p.name === "common");
    expect(common).toBeDefined();
    expect(common?.installable).toBe(false);
    expect(common?.skills).toEqual([{ name: "paper-trail", hasContent: false }]);

    const next = result.installable.find((p) => p.name === "next");
    expect(next).toBeDefined();
    expect(next?.installable).toBe(true);
    expect(next?.skills).toEqual([{ name: "app-router-architect", hasContent: true }]);
  });

  it("D6 gate: a pack is NOT installable if only some declared skills have content", () => {
    writePack(
      root,
      "common",
      baseManifest("common", { skills: ["paper-trail", "proof-of-done"] }),
      ["paper-trail"], // only one of two skills has content
    );

    const result = resolvePacks({ packsRoot: root });

    const common = result.planned.find((p) => p.name === "common");
    expect(common).toBeDefined();
    expect(common?.installable).toBe(false);
  });

  it("reports unresolvable requested/required pack names as missing, without throwing", () => {
    writePack(root, "common", baseManifest("common"));

    const result = resolvePacks({ requestedPacks: ["does-not-exist"], packsRoot: root });

    expect(result.missing).toContain("does-not-exist");
    expect(allNames(result)).toContain("common");
  });

  describe("D22 multi-type union resolution", () => {
    it("a target naming two types resolves the UNION of both stack packs, common installed exactly once", () => {
      writePack(root, "common", baseManifest("common", { skills: ["paper-trail"] }), ["paper-trail"]);
      writePack(
        root,
        "next",
        baseManifest("next", { requires: ["common"], skills: ["app-router-architect"] }),
        ["app-router-architect"],
      );
      writePack(
        root,
        "vite-react-ts",
        baseManifest("vite-react-ts", { requires: ["common"], skills: ["react-component-author"] }),
        ["react-component-author"],
      );

      const result = resolvePacks({ requestedPacks: ["next", "vite-react-ts"], packsRoot: root });

      const names = allNames(result);
      // common appears exactly once (Set-based resolution, not duplicated per requesting type).
      expect(names.filter((n) => n === "common")).toEqual(["common"]);
      expect(names).toEqual(["common", "next", "vite-react-ts"]);

      const next = result.installable.find((p) => p.name === "next");
      const vite = result.installable.find((p) => p.name === "vite-react-ts");
      expect(next?.skills.map((s) => s.name)).toEqual(["app-router-architect"]);
      expect(vite?.skills.map((s) => s.name)).toEqual(["react-component-author"]);
    });

    it("requesting the same type twice (dedup) still resolves it once", () => {
      writePack(root, "common", baseManifest("common"));
      writePack(root, "next", baseManifest("next", { requires: ["common"], skills: ["a"] }), ["a"]);

      const result = resolvePacks({ requestedPacks: ["next", "next"], packsRoot: root });

      expect(allNames(result).filter((n) => n === "next")).toEqual(["next"]);
    });

    it("an unmapped/unknown type among requestedPacks contributes nothing beyond common — reported missing, never throws", () => {
      writePack(root, "common", baseManifest("common"));
      writePack(root, "next", baseManifest("next", { requires: ["common"], skills: ["a"] }), ["a"]);

      const result = resolvePacks({ requestedPacks: ["next", "vite-vanilla-ts"], packsRoot: root });

      expect(result.missing).toContain("vite-vanilla-ts");
      expect(allNames(result)).toEqual(["common", "next"]);
    });
  });

  describe("D25: expo pack requires react-native pack (real bundled packs, no packsRoot override)", () => {
    it("resolving expo pulls in react-native + common via the requires chain (razor always-resolved too, decisions.md D26)", () => {
      const result = resolvePacks({ requestedPacks: ["expo"] });

      expect(allNames(result)).toEqual(["common", "expo", "razor", "react-native"]);
    });

    it("expo/react-native are both installable (decisions.md D26 curation-aware content import)", () => {
      const result = resolvePacks({ requestedPacks: ["expo"] });

      const expo = result.installable.find((p) => p.name === "expo");
      const rn = result.installable.find((p) => p.name === "react-native");
      expect(expo).toBeDefined();
      expect(expo?.installable).toBe(true);
      expect(rn).toBeDefined();
      expect(rn?.installable).toBe(true);
      expect(result.planned).toEqual([]);

      const common = [...result.installable, ...result.planned].find((p) => p.name === "common");
      expect(common?.installable).toBe(true);
    });

    it("resolving react-native alone does NOT pull in expo (the requires edge is one-directional)", () => {
      const result = resolvePacks({ requestedPacks: ["react-native"] });

      expect(allNames(result)).toEqual(["common", "razor", "react-native"]);
      expect(allNames(result)).not.toContain("expo");
    });
  });
});
