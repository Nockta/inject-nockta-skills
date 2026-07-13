import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectMonorepo } from "../src/core/detect-monorepo.js";

describe("detectMonorepo (spec §9.1)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-detect-monorepo-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports not-a-monorepo when no signal is present", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x" }), "utf8");
    const result = detectMonorepo(root);
    expect(result.isMonorepo).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("detects pnpm-workspace.yaml", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    const result = detectMonorepo(root);
    expect(result.isMonorepo).toBe(true);
    expect(result.signals).toContain("pnpm-workspace.yaml");
  });

  it("detects turbo.json", () => {
    writeFileSync(join(root, "turbo.json"), "{}", "utf8");
    expect(detectMonorepo(root).signals).toContain("turbo.json");
  });

  it("detects nx.json", () => {
    writeFileSync(join(root, "nx.json"), "{}", "utf8");
    expect(detectMonorepo(root).signals).toContain("nx.json");
  });

  it("detects lerna.json", () => {
    writeFileSync(join(root, "lerna.json"), "{}", "utf8");
    expect(detectMonorepo(root).signals).toContain("lerna.json");
  });

  it("detects rush.json", () => {
    writeFileSync(join(root, "rush.json"), "{}", "utf8");
    expect(detectMonorepo(root).signals).toContain("rush.json");
  });

  it("detects package.json workspaces as an array", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", workspaces: ["apps/*"] }), "utf8");
    const result = detectMonorepo(root);
    expect(result.isMonorepo).toBe(true);
    expect(result.signals).toContain("package.json:workspaces");
  });

  it("detects package.json workspaces as an object with packages[]", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "x", workspaces: { packages: ["apps/*"] } }),
      "utf8",
    );
    expect(detectMonorepo(root).signals).toContain("package.json:workspaces");
  });

  it("does not treat an empty workspaces array as a signal", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", workspaces: [] }), "utf8");
    expect(detectMonorepo(root).isMonorepo).toBe(false);
  });

  it("accumulates multiple signals at once", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    writeFileSync(join(root, "turbo.json"), "{}", "utf8");
    const result = detectMonorepo(root);
    expect(result.signals).toEqual(expect.arrayContaining(["pnpm-workspace.yaml", "turbo.json"]));
    expect(result.signals.length).toBe(2);
  });

  it("never throws on a missing package.json / missing root", () => {
    const missing = join(root, "does-not-exist");
    expect(() => detectMonorepo(missing)).not.toThrow();
    expect(detectMonorepo(missing).isMonorepo).toBe(false);
  });

  it("never throws on an unparsable package.json", () => {
    writeFileSync(join(root, "package.json"), "{ not json", "utf8");
    expect(() => detectMonorepo(root)).not.toThrow();
    expect(detectMonorepo(root).isMonorepo).toBe(false);
  });

  it("ignores a nested pnpm-workspace.yaml (only checks the given root)", () => {
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "pnpm-workspace.yaml"), "packages: []\n", "utf8");
    expect(detectMonorepo(root).isMonorepo).toBe(false);
  });
});
