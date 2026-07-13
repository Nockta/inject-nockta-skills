import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildRepairResult } from "../src/commands/repair.js";
import { buildDoctorResult } from "../src/commands/doctor.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const PACKAGE_VERSION = "9.9.9-test";
const PAPER_TRAIL = join(".claude", "skills", "paper-trail", "SKILL.md");
const PROOF_OF_DONE = join(".claude", "skills", "proof-of-done", "SKILL.md");

describe("repair (spec §7.5, §13.3, decisions.md D3)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-repair-"));
    buildInstallResult({ type: "next", adapters: "claude", yes: true, targetDir, packageVersion: PACKAGE_VERSION });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("fails cleanly (exit 1) with no profile", () => {
    const empty = mkdtempSync(join(tmpdir(), "inject-nockta-skills-repair-empty-"));
    try {
      const result = buildRepairResult({ targetDir: empty, packageVersion: PACKAGE_VERSION });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("restores a missing file with independently-verifiable content", () => {
    const absPath = join(targetDir, PAPER_TRAIL);
    rmSync(absPath);

    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.restored).toContain(".claude/skills/paper-trail/SKILL.md");

    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    const record = manifest.files.find((f: { path: string }) => f.path.endsWith("paper-trail/SKILL.md"));
    expect(record).toBeDefined();

    // Recompute independently — do not trust the manifest's own claim.
    const recomputed = sha256(absPath);
    expect(recomputed).toBe(record.outputHash);

    // A following doctor is clean.
    const doctor = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(doctor.data.healthy).toBe(true);
  });

  it("skips a user-modified file without --force, and leaves its bytes untouched", () => {
    const absPath = join(targetDir, PROOF_OF_DONE);
    const originalBytes = readFileSync(absPath);
    appendFileSync(absPath, "\n<!-- user edit -->\n");

    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION, force: false });
    expect(result.ok).toBe(true); // a correct, successful repair that warned — not a failure (see repair.ts)
    expect(result.data.skippedModified).toContain(".claude/skills/proof-of-done/SKILL.md");
    expect(result.data.restored).toEqual([]);
    expect(result.data.forcedOverwrites).toEqual([]);

    const afterBytes = readFileSync(absPath);
    expect(afterBytes.equals(originalBytes)).toBe(false); // still has the user's edit
    expect(afterBytes.toString("utf8")).toContain("<!-- user edit -->");
  });

  it("overwrites a user-modified file with --force", () => {
    const absPath = join(targetDir, PROOF_OF_DONE);
    appendFileSync(absPath, "\n<!-- user edit -->\n");

    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION, force: true });
    expect(result.data.forcedOverwrites).toContain(".claude/skills/proof-of-done/SKILL.md");
    expect(result.data.skippedModified).toEqual([]);

    const afterBytes = readFileSync(absPath, "utf8");
    expect(afterBytes).not.toContain("<!-- user edit -->");

    const doctor = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(doctor.data.healthy).toBe(true);
  });

  it("re-renders a stale-by-generatorVersion file (safe — content untouched by user)", () => {
    const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const file of manifest.files) file.generatorVersion = "0.0.1-old";
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.data.refreshed.length).toBe(manifest.files.length);

    const newManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const record of newManifest.files) expect(record.generatorVersion).toBe(PACKAGE_VERSION);

    const doctor = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(doctor.data.healthy).toBe(true);
  });

  it("never touches an unknown (untracked) file", () => {
    const untracked = join(targetDir, ".claude", "skills", "paper-trail", "NOTES.md");
    writeFileSync(untracked, "not part of any pack", "utf8");

    buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION, force: true });

    expect(readFileSync(untracked, "utf8")).toBe("not part of any pack");
    const manifest = JSON.parse(readFileSync(join(targetDir, ".nockta", "generated-manifest.json"), "utf8"));
    expect(manifest.files.some((f: { path: string }) => f.path.endsWith("NOTES.md"))).toBe(false);
  });

  it("rewrites the manifest so a following doctor is clean after a mixed repair", () => {
    rmSync(join(targetDir, PAPER_TRAIL));
    appendFileSync(join(targetDir, PROOF_OF_DONE), "\nedit\n");

    const repaired = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION, force: true });
    expect(repaired.data.restored).toContain(".claude/skills/paper-trail/SKILL.md");
    expect(repaired.data.forcedOverwrites).toContain(".claude/skills/proof-of-done/SKILL.md");

    const doctor = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(doctor.ok).toBe(true);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.data.counts).toEqual({ intact: doctor.data.counts.intact, missing: 0, modified: 0, stale: 0, unknown: 0 });
  });

  it("a next-only install (no shopify pack) never carries the RED-1 telemetry notice, even after a full restore", () => {
    rmSync(join(targetDir, ".claude"), { recursive: true, force: true });
    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.data.restored.length).toBeGreaterThan(0);
    expect(result.data.notices).toEqual([]);
  });
});

/**
 * RED-1 disclosure (packs-redistribution-audit.md) — `repair` surfaces the same one-line
 * Shopify-telemetry notice as `install`, exactly when it actually WRITES (restores/refreshes/
 * force-overwrites) content from a `shopify-*` pack. See `core/shopify-telemetry-notice.ts`.
 */
describe("repair — RED-1 Shopify telemetry disclosure notice", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-repair-red1-"));
    buildInstallResult({ type: "shopify-app", adapters: "claude", yes: true, targetDir, packageVersion: PACKAGE_VERSION });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("restoring a missing shopify skill file surfaces the notice", () => {
    const shopifyFile = join(targetDir, ".claude", "skills", "shopify-admin", "SKILL.md");
    rmSync(shopifyFile);

    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.data.restored).toContain(".claude/skills/shopify-admin/SKILL.md");
    expect(result.data.notices).toHaveLength(1);
    expect(result.data.notices[0]).toMatch(/OPT_OUT_INSTRUMENTATION=true/);
  });

  it("a no-op repair (everything already intact) does NOT re-surface the notice — nothing was actually written", () => {
    const result = buildRepairResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.data.restored).toEqual([]);
    expect(result.data.refreshed).toEqual([]);
    expect(result.data.forcedOverwrites).toEqual([]);
    expect(result.data.notices).toEqual([]);
  });
});
