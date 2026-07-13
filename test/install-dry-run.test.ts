import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";

/**
 * `install --dry-run` (spec §7.3, brief item 8): resolves + reports the FULL plan and writes
 * NOTHING. This is the surface `create-nockta-repo`'s wizard preview consumes via
 * `install --dry-run --json` (decisions.md D18).
 */
describe("install --dry-run (spec §7.3, decisions.md D18)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-dry-run-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("single-project: writes nothing at all, reports the resolved plan, exit 0", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude,cursor,copilot", dryRun: true, targetDir, packageVersion: "9.9.9-test" });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.dryRun).toBe(true);
    // Tree check — literally nothing written (not even .nockta/).
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
    expect(existsSync(join(targetDir, ".cursor"))).toBe(false);
    expect(existsSync(join(targetDir, ".github"))).toBe(false);
    expect(existsSync(join(targetDir, ".nockta"))).toBe(false);

    const plan = result.data.plan;
    expect(plan).not.toBeNull();
    // Post-content-import (decisions.md D26): next is now installable too, not just common.
    // razor is always-resolved alongside common and installable once imported (61 optional skills).
    expect(plan?.installedPacks).toEqual(["common", "next", "razor"]);
    expect(plan?.files.length).toBeGreaterThan(0);
    expect(plan?.files.every((f) => f.startsWith(".claude/") || f.startsWith(".cursor/") || f.startsWith(".github/"))).toBe(true);

    // Per-skill selection with tiers (brief item 8), now also carrying its D26 description
    // (bonus item 8: dry-run plan surfaces each skill's description; no `overlaps` since
    // paper-trail declares no `clashesWith`).
    const paperTrail = plan?.skills.find((s) => s.skill === "paper-trail");
    expect(paperTrail?.description).toMatch(/Where finished knowledge lives/);
    expect(paperTrail?.overlaps).toBeUndefined();
    expect(paperTrail).toEqual({
      pack: "common",
      skill: "paper-trail",
      enablement: "required",
      selected: true,
      requiredBy: [],
      description: paperTrail?.description,
    });

    expect(result.data.version).toBe("9.9.9-test");
  });

  it("bypasses --yes entirely — dry-run works without it", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude", dryRun: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("--json produces exactly one JSON-parseable line and writes nothing (process-boundary shape assertion at the pure-function level)", () => {
    const result = buildInstallResult({ type: "next", adapters: "claude", dryRun: true, targetDir, packageVersion: "9.9.9-test" });
    const line = JSON.stringify(result);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("still validates --type/--adapters — invalid --type still fails (exit 1), even in dry-run", () => {
    const result = buildInstallResult({ type: "not-a-real-type", adapters: "claude", dryRun: true, targetDir, packageVersion: "9.9.9-test" });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
  });

  it("invalid skill selection (unknown name) fails dry-run too, exit 1, files empty", () => {
    const result = buildInstallResult({
      type: "next",
      adapters: "claude",
      dryRun: true,
      excludeSkills: "does-not-exist",
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.data.plan?.files).toEqual([]);
  });

  it("monorepo: writes nothing, reports the union plan across targets, exit 0", () => {
    writeFileSync(join(targetDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
    mkdirSync(join(targetDir, "apps", "web"), { recursive: true });
    mkdirSync(join(targetDir, "apps", "api"), { recursive: true });

    const result = buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      dryRun: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.isMonorepo).toBe(true);
    expect(existsSync(join(targetDir, ".nockta"))).toBe(false);
    expect(existsSync(join(targetDir, ".claude"))).toBe(false);
    // Post-content-import (decisions.md D26): monorepo, nest, next are all installable too now;
    // razor is always-resolved alongside common and installable once imported.
    expect(result.data.plan?.installedPacks).toEqual(["common", "monorepo", "nest", "next", "razor"]);
  });

  it("monorepo dry-run still validates target paths (nonexistent target -> exit 1)", () => {
    const result = buildInstallResult({
      targets: ["apps/does-not-exist:next"],
      adapters: "claude",
      dryRun: true,
      targetDir,
      packageVersion: "9.9.9-test",
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors?.[0]).toMatch(/does not exist/);
  });
});
