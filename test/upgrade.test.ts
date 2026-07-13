import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildUpgradeResult } from "../src/commands/upgrade.js";
import { buildDoctorResult } from "../src/commands/doctor.js";

const OLD_VERSION = "0.0.1-old";
const NEW_VERSION = "9.9.9-test";
const PROOF_OF_DONE = join(".claude", "skills", "proof-of-done", "SKILL.md");

/** Simulates "the package got upgraded": temp-edits the recorded profile/manifest versions. */
function simulateOldVersion(targetDir: string): void {
  const profilePath = join(targetDir, ".nockta", "skills-profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.version = OLD_VERSION;
  profile.source.version = OLD_VERSION;
  writeFileSync(profilePath, JSON.stringify(profile), "utf8");

  const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const file of manifest.files) file.generatorVersion = OLD_VERSION;
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
}

describe("upgrade (spec §7.6, §13.4)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-upgrade-"));
    buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packageVersion: OLD_VERSION });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("fails cleanly (exit 1) with no profile", () => {
    const empty = mkdtempSync(join(tmpdir(), "inject-nockta-skills-upgrade-empty-"));
    try {
      const result = buildUpgradeResult({ targetDir: empty, packageVersion: NEW_VERSION });
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("re-renders all output and reports the old->new version delta", () => {
    const result = buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.previousVersion).toBe(OLD_VERSION);
    expect(result.data.newVersion).toBe(NEW_VERSION);
    expect(result.data.refreshed.length).toBeGreaterThan(0);
  });

  it("updates the profile's version, source.version, and updatedAt (preserving createdAt)", () => {
    const profilePath = join(targetDir, ".nockta", "skills-profile.json");
    const before = JSON.parse(readFileSync(profilePath, "utf8"));

    buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });

    const after = JSON.parse(readFileSync(profilePath, "utf8"));
    expect(after.version).toBe(NEW_VERSION);
    expect(after.source.version).toBe(NEW_VERSION);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it("bumps every manifest record's generatorVersion to the running version", () => {
    buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });
    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const record of manifest.files) expect(record.generatorVersion).toBe(NEW_VERSION);
  });

  it("leaves the repo healthy at the new version afterward", () => {
    buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });
    const doctor = buildDoctorResult({ targetDir, packageVersion: NEW_VERSION });
    expect(doctor.ok).toBe(true);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.data.healthy).toBe(true);
  });

  describe("modified-file protection (simulated stale-version repo)", () => {
    beforeEach(() => {
      simulateOldVersion(targetDir);
    });

    it("still refuses to clobber a user-modified file without --force", () => {
      const absPath = join(targetDir, PROOF_OF_DONE);
      appendFileSync(absPath, "\n<!-- user edit -->\n");

      const result = buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION, force: false });
      expect(result.data.skippedModified).toContain(".claude/skills/proof-of-done/SKILL.md");
      expect(readFileSync(absPath, "utf8")).toContain("<!-- user edit -->");

      // Version bump still happens for everything else; the whole repo is
      // not "healthy" afterward because one file remains modified.
      const doctor = buildDoctorResult({ targetDir, packageVersion: NEW_VERSION });
      expect(doctor.data.healthy).toBe(false);
      expect(doctor.data.counts.modified).toBe(1);
    });

    it("--force overwrites even a modified file during upgrade", () => {
      const absPath = join(targetDir, PROOF_OF_DONE);
      appendFileSync(absPath, "\n<!-- user edit -->\n");

      const result = buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION, force: true });
      expect(result.data.forcedOverwrites).toContain(".claude/skills/proof-of-done/SKILL.md");

      const doctor = buildDoctorResult({ targetDir, packageVersion: NEW_VERSION });
      expect(doctor.data.healthy).toBe(true);
    });
  });
});

/**
 * RED-1 disclosure (packs-redistribution-audit.md) — `upgrade` surfaces the same one-line
 * Shopify-telemetry notice as `install`/`repair`, exactly when the run actually writes content
 * from a `shopify-*` pack (upgrade mode always re-renders every tracked file, so any shopify
 * pack installed means the notice fires every upgrade run). See `core/shopify-telemetry-notice.ts`.
 */
describe("upgrade — RED-1 Shopify telemetry disclosure notice", () => {
  it("upgrading a shopify-app install surfaces the notice", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-upgrade-red1-shopify-"));
    try {
      buildInstallResult({ type: "shopify-app", adapters: "claude", yes: true, targetDir, packageVersion: OLD_VERSION });
      const result = buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });
      expect(result.ok).toBe(true);
      expect(result.data.refreshed.length).toBeGreaterThan(0);
      expect(result.data.notices).toHaveLength(1);
      expect(result.data.notices[0]).toMatch(/OPT_OUT_INSTRUMENTATION=true/);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("upgrading a next-only install (no shopify pack) never carries the notice", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-upgrade-red1-next-"));
    try {
      buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packageVersion: OLD_VERSION });
      const result = buildUpgradeResult({ targetDir, packageVersion: NEW_VERSION });
      expect(result.ok).toBe(true);
      expect(result.data.refreshed.length).toBeGreaterThan(0);
      expect(result.data.notices).toEqual([]);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
