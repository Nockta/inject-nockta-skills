import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackManifestError, readPackManifest } from "../src/packs/read-pack-manifest.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("readPackManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-pack-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writePackJson(content: unknown): void {
    const body = typeof content === "string" ? content : JSON.stringify(content);
    writeFileSync(join(dir, "pack.json"), body, "utf8");
  }

  it("parses a valid pack.json into a PackManifest", () => {
    writePackJson({
      name: "next",
      displayName: "Next.js",
      description: "Nockta AI skills for Next.js App Router projects.",
      requires: ["common"],
      skills: ["app-router-architect"],
      adapters: ["claude", "cursor", "copilot"],
    });

    const manifest = readPackManifest(dir);

    expect(manifest).toEqual({
      name: "next",
      displayName: "Next.js",
      description: "Nockta AI skills for Next.js App Router projects.",
      requires: ["common"],
      skills: ["app-router-architect"],
      adapters: ["claude", "cursor", "copilot"],
    });
  });

  it("accepts an empty requires array (e.g. the common pack)", () => {
    writePackJson({
      name: "common",
      displayName: "Common",
      description: "d",
      requires: [],
      skills: ["paper-trail"],
      adapters: ["claude"],
    });
    expect(readPackManifest(dir).requires).toEqual([]);
  });

  it("throws PackManifestError when pack.json is missing", () => {
    expect(() => readPackManifest(dir)).toThrow(PackManifestError);
  });

  it("throws PackManifestError on invalid JSON", () => {
    writePackJson("{ this is not json");
    expect(() => readPackManifest(dir)).toThrow(PackManifestError);
  });

  it("throws PackManifestError when required fields are missing", () => {
    writePackJson({ name: "x", displayName: "X" });
    try {
      readPackManifest(dir);
      expect.unreachable("expected readPackManifest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PackManifestError);
      const issues = (error as PackManifestError).issues;
      expect(issues.some((i) => i.includes('"description"'))).toBe(true);
      expect(issues.some((i) => i.includes('"skills"'))).toBe(true);
      expect(issues.some((i) => i.includes('"adapters"'))).toBe(true);
    }
  });

  it("throws PackManifestError on an unknown adapter value", () => {
    writePackJson({
      name: "x",
      displayName: "X",
      description: "d",
      requires: [],
      skills: ["a"],
      adapters: ["claude", "windsurf"],
    });
    expect(() => readPackManifest(dir)).toThrow(PackManifestError);
  });

  it("throws PackManifestError on an empty skills array", () => {
    writePackJson({
      name: "x",
      displayName: "X",
      description: "d",
      requires: [],
      skills: [],
      adapters: ["claude"],
    });
    expect(() => readPackManifest(dir)).toThrow(PackManifestError);
  });

  it("throws PackManifestError when pack.json is a JSON array, not an object", () => {
    writePackJson(["not", "an", "object"]);
    expect(() => readPackManifest(dir)).toThrow(PackManifestError);
  });

  it("parses the real bundled packs/react-native/pack.json (D25) — requires:[common], agent adapter included, 14 curated skills (decisions.md D26)", () => {
    const manifest = readPackManifest(join(PACKAGE_ROOT, "packs", "react-native"));
    expect(manifest.name).toBe("react-native");
    expect(manifest.requires).toEqual(["common"]);
    expect(manifest.skills).toEqual([
      "swm-react-native-best-practices",
      "react-native-skills",
      "callstack-react-native-best-practices",
      "callstack-assess-react-native-migration",
      "callstack-create-react-native-library",
      "callstack-react-native-brownfield-migration",
      "callstack-react-native-tv-best-practices",
      "callstack-upgrading-react-native",
      "callstack-github-actions",
      "callstack-react-navigation",
      "swm-radon-mcp",
      "swm-rnrepo",
      "wshobson-react-native-architecture",
      "wshobson-react-native-design",
    ]);
    // The 2 license-blocked react-navigation-migrate/upgrade skills must never appear (D26/e).
    expect(manifest.skills).not.toContain("react-navigation-migrate-to-static-config");
    expect(manifest.skills).not.toContain("react-navigation-upgrade-react-navigation");
    expect(manifest.adapters).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });

  it("parses the real bundled packs/expo/pack.json (D25) — requires:[react-native], not common directly, 19 curated skills (decisions.md D26)", () => {
    const manifest = readPackManifest(join(PACKAGE_ROOT, "packs", "expo"));
    expect(manifest.name).toBe("expo");
    expect(manifest.requires).toEqual(["react-native"]);
    expect(manifest.skills).toEqual([
      "expo-router",
      "expo-ui",
      "expo-native-ui",
      "expo-data-fetching",
      "expo-tailwind-setup",
      "expo-module",
      "expo-dom",
      "expo-dev-client",
      "expo-examples",
      "expo-app-clip",
      "expo-brownfield",
      "expo-upgrade",
      "expo-web-to-native",
      "eas-app-stores",
      "eas-hosting",
      "eas-observe",
      "eas-simulator",
      "eas-update-insights",
      "eas-workflows",
    ]);
    expect(manifest.adapters).toEqual(["claude", "cursor", "copilot", "agent", "antigravity"]);
  });
});
