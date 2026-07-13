import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallResult } from "../src/commands/install.js";
import { buildDoctorResult } from "../src/commands/doctor.js";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const PACKAGE_VERSION = "9.9.9-test";

describe("doctor classification (spec §7.4, §10.3)", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-doctor-"));
    buildInstallResult({
      type: "next",
      adapters: "claude",
      yes: true,
      targetDir,
      packageVersion: PACKAGE_VERSION,
    });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  it("reports missing profile as exit 1, suggestedAction install", () => {
    const empty = mkdtempSync(join(tmpdir(), "inject-nockta-skills-doctor-empty-"));
    try {
      const result = buildDoctorResult({ targetDir: empty, packageVersion: PACKAGE_VERSION });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.data.profileStatus).toBe("missing");
      expect(result.data.suggestedAction).toBe("install");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("reports an invalid/unparsable profile as exit 1", () => {
    mkdirSync(join(targetDir, ".nockta"), { recursive: true });
    writeFileSync(join(targetDir, ".nockta", "skills-profile.json"), "{ not json", "utf8");
    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(1);
    expect(result.data.profileStatus).toBe("invalid");
  });

  it("reports a malformed monorepo profile (isMonorepo:true but not a real monorepo shape) as invalid (M5: real monorepo support replaces the M4 guard)", () => {
    // This profile has isMonorepo:true but is missing the monorepo-only fields (targetsFile,
    // etc.) — still a single-project profile object underneath. M4 reported this as
    // "monorepo-unsupported"; M5's profile-guard now runs it through the real monorepo shape
    // validator and correctly reports it as "invalid" (schema-invalid), not a distinct
    // unsupported bucket that no longer exists.
    const profilePath = join(targetDir, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.isMonorepo = true;
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");
    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(1);
    expect(result.data.profileStatus).toBe("invalid");
  });

  it("reports healthy (all intact) right after install — exit 0", () => {
    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.healthy).toBe(true);
    expect(result.data.suggestedAction).toBe("no-op");
    expect(result.data.counts.intact).toBeGreaterThan(0);
    expect(result.data.counts.missing).toBe(0);
    expect(result.data.counts.modified).toBe(0);
    expect(result.data.counts.stale).toBe(0);
  });

  it("classifies a deleted generated file as missing", () => {
    const target = join(targetDir, ".claude", "skills", "paper-trail", "SKILL.md");
    rmSync(target);

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(4);
    expect(result.data.counts.missing).toBe(1);
    expect(result.data.suggestedAction).toBe("repair");
    const entry = result.data.files.find((f) => f.path.endsWith("paper-trail/SKILL.md"));
    expect(entry?.classification).toBe("missing");
  });

  it("classifies an appended-to generated file as modified", () => {
    const target = join(targetDir, ".claude", "skills", "proof-of-done", "SKILL.md");
    appendFileSync(target, "\n<!-- user note -->\n");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    expect(result.data.counts.modified).toBe(1);
    const entry = result.data.files.find((f) => f.path.endsWith("proof-of-done/SKILL.md"));
    expect(entry?.classification).toBe("modified");
  });

  it("classifies a manifest generatorVersion edit as stale", () => {
    const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const file of manifest.files) file.generatorVersion = "0.0.1-old";
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    expect(result.data.counts.stale).toBe(manifest.files.length);
    expect(result.data.suggestedAction).toBe("repair"); // profile.source.version still matches running version
    for (const f of result.data.files) expect(f.classification).toBe("stale");
  });

  it("suggests upgrade when the profile's own source.version differs from the running package version", () => {
    const profilePath = join(targetDir, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    profile.version = "0.0.1-old";
    profile.source.version = "0.0.1-old";
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.exitCode).toBe(4);
    expect(result.data.suggestedAction).toBe("upgrade");
  });

  it("classifies an untracked file dropped into .claude/skills/ as unknown, without breaking health", () => {
    const untracked = join(targetDir, ".claude", "skills", "paper-trail", "NOTES.md");
    writeFileSync(untracked, "not part of any pack", "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    // Unknown files are informational — they do not block "healthy".
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.counts.unknown).toBe(1);
    expect(result.data.unknownFiles).toEqual([".claude/skills/paper-trail/NOTES.md"]);
  });

  it("classifies an untracked file dropped into .claude/agents/ as unknown too", () => {
    const untracked = join(targetDir, ".claude", "agents", "rogue-agent.md");
    writeFileSync(untracked, "not part of any pack", "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.data.counts.unknown).toBe(1);
    expect(result.data.unknownFiles).toContain(".claude/agents/rogue-agent.md");
  });

  it("never scans outside .claude/skills/ and .claude/agents/ for unknown files", () => {
    // A file dropped directly under .claude/ (not under skills/ or agents/) must NOT be reported.
    writeFileSync(join(targetDir, ".claude", "settings.json"), "{}", "utf8");
    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.data.unknownFiles).toEqual([]);
  });

  it("independently recomputes hashes rather than trusting the manifest blindly", () => {
    // Manifest claims a hash that does not match the real on-disk bytes —
    // doctor must detect this by RE-hashing the file, not by reading the
    // manifest's own (now-false) outputHash field.
    const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const record = manifest.files.find((f: { path: string }) => f.path.endsWith("paper-trail/SKILL.md"));
    const realHash = sha256(join(targetDir, record.path));
    expect(record.outputHash).toBe(realHash); // sanity: matches right after install
    record.outputHash = "0".repeat(64); // lie in the manifest
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    const entry = result.data.files.find((f) => f.path.endsWith("paper-trail/SKILL.md"));
    // The real file content is untouched and still matches its own true
    // hash, but the manifest record now disagrees — doctor must flag this
    // as "modified" (record says the file's hash should be all-zeros; the
    // real file doesn't have that hash) rather than trusting outputHash==
    // outputHash trivially or silently agreeing with a corrupted record.
    expect(entry?.classification).toBe("modified");
  });

  it("D22 read-shim: a legacy profile with a singular repoType (no repoTypes) reads back healthy, normalized to a one-element repoTypes", () => {
    const profilePath = join(targetDir, ".nockta", "skills-profile.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    expect(profile.repoTypes).toEqual(["next"]); // sanity: current install already writes the new shape
    delete profile.repoTypes;
    profile.repoType = "next"; // simulate a pre-D22 profile on disk
    writeFileSync(profilePath, JSON.stringify(profile), "utf8");

    const result = buildDoctorResult({ targetDir, packageVersion: PACKAGE_VERSION });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.data.profileStatus).toBe("ok");
    expect(result.data.healthy).toBe(true);
  });
});
