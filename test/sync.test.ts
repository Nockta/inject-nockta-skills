import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildSyncResult } from "../src/commands/sync.js";
import { decideSyncMode } from "../src/core/sync-orchestrator.js";

const PACKAGE_VERSION = "9.9.9-test";

describe("decideSyncMode — pure decision tree (spec §7.7, decisions.md D10)", () => {
  it("healthy always wins, regardless of dryRun/isTTY/yes", () => {
    expect(decideSyncMode({ healthy: true, isTTY: false, yes: false, dryRun: false })).toBe("no-op");
    expect(decideSyncMode({ healthy: true, isTTY: false, yes: false, dryRun: true })).toBe("no-op");
    expect(decideSyncMode({ healthy: true, isTTY: true, yes: true, dryRun: false })).toBe("no-op");
  });

  it("--dry-run always plans only when unhealthy, regardless of isTTY/yes", () => {
    expect(decideSyncMode({ healthy: false, isTTY: false, yes: false, dryRun: true })).toBe("dry-run");
    expect(decideSyncMode({ healthy: false, isTTY: true, yes: true, dryRun: true })).toBe("dry-run");
  });

  it("interactive TTY (not dry-run) asks for confirmation, regardless of --yes", () => {
    expect(decideSyncMode({ healthy: false, isTTY: true, yes: false, dryRun: false })).toBe("interactive");
    expect(decideSyncMode({ healthy: false, isTTY: true, yes: true, dryRun: false })).toBe("interactive");
  });

  it("non-interactive + --yes applies automatically", () => {
    expect(decideSyncMode({ healthy: false, isTTY: false, yes: true, dryRun: false })).toBe("auto-apply");
  });

  it("non-interactive without --yes plans only (D10: never silently rewrites)", () => {
    expect(decideSyncMode({ healthy: false, isTTY: false, yes: false, dryRun: false })).toBe("plan-only");
  });
});

describe("sync orchestration (in-process, injected isTTY/confirmFn — spec §7.7)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-sync-"));
    buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packageVersion: PACKAGE_VERSION });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("no-op when healthy — exit 0, writes nothing, even without --yes", async () => {
    const before = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");
    const result = await buildSyncResult({ targetDir, packageVersion: PACKAGE_VERSION, isTTY: false });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.mode).toBe("no-op");
    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(before);
  });

  it("non-interactive without --yes: plan-only, exit 4, writes nothing", async () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const manifestBefore = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");

    const result = await buildSyncResult({ targetDir, packageVersion: PACKAGE_VERSION, isTTY: false });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
    expect(result.data.mode).toBe("plan-only");
    expect(result.data.plan.needsRepair).toBe(true);
    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("--dry-run: plan only, exit 4, writes nothing, even with --yes", async () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const manifestBefore = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");

    const result = await buildSyncResult({ targetDir, packageVersion: PACKAGE_VERSION, isTTY: false, dryRun: true, yes: true });
    expect(result.exitCode).toBe(4);
    expect(result.data.mode).toBe("dry-run");
    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("non-interactive + --yes: auto-applies repair, ends healthy, exit 0", async () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));

    const result = await buildSyncResult({ targetDir, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.mode).toBe("auto-apply");
    expect(result.data.applied).toBe(true);
    expect(result.data.doctorAfter.healthy).toBe(true);
    expect(result.data.repair?.restored).toContain(".claude/skills/paper-trail/SKILL.md");
  });

  it("interactive + confirmFn(true): applies, exit 0", async () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));

    const result = await buildSyncResult({
      targetDir,
      packageVersion: PACKAGE_VERSION,
      isTTY: true,
      confirmFn: async () => true,
    });
    expect(result.data.mode).toBe("interactive");
    expect(result.data.declined).toBe(false);
    expect(result.data.applied).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("interactive + confirmFn(false): declines, writes nothing, exit 4", async () => {
    rmSync(join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md"));
    const manifestBefore = readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8");

    const result = await buildSyncResult({
      targetDir,
      packageVersion: PACKAGE_VERSION,
      isTTY: true,
      confirmFn: async () => false,
    });
    expect(result.data.mode).toBe("interactive");
    expect(result.data.declined).toBe(true);
    expect(result.data.applied).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
    expect(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("applies upgrade (not repair) when a version delta is the dominant issue, bumping the profile", async () => {
    const profilePath = join(targetDir, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.version = "0.0.1-old";
    profile.source.version = "0.0.1-old";
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");
    const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const f of manifest.files) f.generatorVersion = "0.0.1-old";
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = await buildSyncResult({ targetDir, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    expect(result.data.plan.needsUpgrade).toBe(true);
    expect(result.data.upgrade?.previousVersion).toBe("0.0.1-old");
    expect(result.data.upgrade?.newVersion).toBe(PACKAGE_VERSION);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    const newProfile = JSON.parse(readFileSync(profilePath, "utf8"));
    expect(newProfile.version).toBe(PACKAGE_VERSION);
  });

  it("reports missing profile as exit 1 without attempting to act", async () => {
    const empty = mkdtempSync(join(tmpdir(), "inject-nockta-skills-sync-empty-"));
    try {
      const result = await buildSyncResult({ targetDir: empty, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
      expect(result.exitCode).toBe(1);
      expect(result.data.applied).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
