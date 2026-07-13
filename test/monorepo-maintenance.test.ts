import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";
import { buildRepairResult } from "../src/commands/repair.js";
import { buildUpgradeResult } from "../src/commands/upgrade.js";
import { buildSyncResult } from "../src/commands/sync.js";

const OLD_VERSION = "0.0.1-old";
const PACKAGE_VERSION = "9.9.9-test";
const PAPER_TRAIL = join(".claude", "skills", "paper-trail", "SKILL.md");

function makeFixtureMonorepo(root: string): void {
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");
  mkdirSync(join(root, "apps", "api"), { recursive: true });
  writeFileSync(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "api" }), "utf8");
}

describe("monorepo repair (spec §7.5, §9.5, brief item 4)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-repair-"));
    makeFixtureMonorepo(root);
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: PACKAGE_VERSION,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("restores a missing root-rendered file, leaves it healthy again", () => {
    rmSync(join(root, PAPER_TRAIL));

    const result = buildRepairResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.restored).toContain(".claude/skills/paper-trail/SKILL.md");

    const doctor = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(doctor.data.healthy).toBe(true);
  });

  it("warns on (never overwrites) a user-modified file without --force", () => {
    const absPath = join(root, PAPER_TRAIL);
    appendFileSync(absPath, "\n<!-- user edit -->\n");

    const result = buildRepairResult({ targetDir: root, packageVersion: PACKAGE_VERSION, force: false });
    expect(result.data.skippedModified).toContain(".claude/skills/paper-trail/SKILL.md");
    expect(readFileSync(absPath, "utf8")).toContain("<!-- user edit -->");
  });

  it("does NOT touch .nockta/targets.json (only root-rendered adapter output + manifest)", () => {
    const before = readFileSync(join(root, ".nockta", "targets.json"), "utf8");
    rmSync(join(root, PAPER_TRAIL));
    buildRepairResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(readFileSync(join(root, ".nockta", "targets.json"), "utf8")).toBe(before);
  });

  it("fails cleanly with exit 1 when targets.json is missing", () => {
    rmSync(join(root, ".nockta", "targets.json"));
    const result = buildRepairResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});

describe("monorepo upgrade (spec §7.6, §9.5, brief item 4)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-upgrade-"));
    makeFixtureMonorepo(root);
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: OLD_VERSION,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("re-renders and bumps the monorepo profile's version, preserving installedPacks/targetsFile/createdAt", () => {
    const profilePath = join(root, ".nockta", "skills-profile.json");
    const before = JSON.parse(readFileSync(profilePath, "utf8"));

    const result = buildUpgradeResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.previousVersion).toBe(OLD_VERSION);
    expect(result.data.newVersion).toBe(PACKAGE_VERSION);

    const after = JSON.parse(readFileSync(profilePath, "utf8"));
    expect(after.isMonorepo).toBe(true);
    expect(after.targetsFile).toBe(".nockta/targets.json");
    expect(after.installedPacks).toEqual(before.installedPacks);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.version).toBe(PACKAGE_VERSION);
  });

  it("leaves the monorepo healthy at the new version afterward", () => {
    buildUpgradeResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    const doctor = buildDoctorResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(doctor.ok).toBe(true);
    expect(doctor.exitCode).toBe(0);
  });

  it("does NOT touch .nockta/targets.json", () => {
    const before = readFileSync(join(root, ".nockta", "targets.json"), "utf8");
    buildUpgradeResult({ targetDir: root, packageVersion: PACKAGE_VERSION });
    expect(readFileSync(join(root, ".nockta", "targets.json"), "utf8")).toBe(before);
  });
});

describe("monorepo sync (spec §7.7, D10)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "inject-nockta-skills-monorepo-sync-"));
    makeFixtureMonorepo(root);
    buildInstallResult({
      targets: ["apps/web:next", "apps/api:nest"],
      adapters: "claude",
      yes: true,
      targetDir: root,
      packageVersion: PACKAGE_VERSION,
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("no-ops when healthy, exit 0", async () => {
    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.mode).toBe("no-op");
  });

  it("--dry-run: plan only, exit 4, writes nothing", async () => {
    rmSync(join(root, PAPER_TRAIL));
    const manifestBefore = readFileSync(join(root, ".nockta", "generated-manifest.json"), "utf8");

    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false, dryRun: true, yes: true });
    expect(result.exitCode).toBe(4);
    expect(result.data.mode).toBe("dry-run");
    expect(readFileSync(join(root, ".nockta", "generated-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  it("non-interactive without --yes: plan-only, exit 4, writes nothing", async () => {
    rmSync(join(root, PAPER_TRAIL));
    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false });
    expect(result.exitCode).toBe(4);
    expect(result.data.mode).toBe("plan-only");
    expect(result.data.plan.needsRepair).toBe(true);
  });

  it("--yes: auto-applies repair, ends healthy, exit 0", async () => {
    rmSync(join(root, PAPER_TRAIL));

    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.mode).toBe("auto-apply");
    expect(result.data.doctorAfter.healthy).toBe(true);
    expect(result.data.repair?.restored).toContain(".claude/skills/paper-trail/SKILL.md");
  });

  it("applies upgrade (not repair) when a version delta is the dominant issue", async () => {
    const profilePath = join(root, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.version = OLD_VERSION;
    profile.source.version = OLD_VERSION;
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");
    const manifestPath = join(root, ".nockta", "generated-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const f of manifest.files) f.generatorVersion = OLD_VERSION;
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    expect(result.data.plan.needsUpgrade).toBe(true);
    expect(result.data.upgrade?.previousVersion).toBe(OLD_VERSION);
    expect(result.data.upgrade?.newVersion).toBe(PACKAGE_VERSION);
    expect(result.exitCode).toBe(0);
  });

  it("targets.json missing: sync guides to install (needsInstall), exit 1, does not attempt repair", async () => {
    rmSync(join(root, ".nockta", "targets.json"));
    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    expect(result.exitCode).toBe(1);
    expect(result.data.applied).toBe(false);
    expect(result.data.plan.needsInstall).toBe(true);
  });

  it("a missing target directory alone (files still intact) cannot be fixed by sync — reports honestly instead of crashing or lying", async () => {
    rmSync(join(root, "apps", "api"), { recursive: true, force: true });
    const result = await buildSyncResult({ targetDir: root, packageVersion: PACKAGE_VERSION, isTTY: false, yes: true });
    // Root-rendered files are all still intact/current, so plan.needsRepair/needsUpgrade are
    // both false — sync has NOTHING it can apply for a missing target dir (repair/upgrade never
    // touch target app directories, only root-rendered adapter output). `mode` still comes out
    // "auto-apply" (doctor.healthy is false because target plausibility folds into it) and
    // `applied` is `true` (sync did run its apply step), but neither repair nor upgrade fired —
    // a known, documented limitation of the 3-flag SyncPlan vocabulary (see
    // sync-orchestrator.ts's `buildSyncPlan`). The important behavior asserted here: sync never
    // throws, and correctly reports `ok: false` / exit 4 rather than falsely claiming success.
    expect(result.data.doctorBefore.healthy).toBe(false);
    expect(result.data.mode).toBe("auto-apply");
    expect(result.data.applied).toBe(true);
    expect(result.data.repair).toBeUndefined();
    expect(result.data.upgrade).toBeUndefined();
    expect(result.data.doctorAfter.healthy).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
  });
});
