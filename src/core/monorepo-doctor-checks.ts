import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeRenderPlan } from "./render-plan.js";
import { classifyManifestRecords } from "./classify-manifest.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { readTargetsFile } from "./read-targets.js";
import { emptyCounts } from "../types/doctor.js";
import type { DoctorReport, SuggestedAction, TargetCheckResult } from "../types/doctor.js";
import type { NocktaMonorepoSkillsProfile } from "../types/profile.js";
import type { TargetRecord } from "../types/target.js";

export interface MonorepoDoctorCheckOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  profile: NocktaMonorepoSkillsProfile;
}

/**
 * Basic plausibility check ONLY — existence plus a `package.json` present in the target dir.
 * Deliberately shallow (brief item 4: "existence + basic plausibility only — deep re-detection
 * heuristics are NOT this milestone"). A real "does this still look like a Next.js app" check
 * would need to run the same framework-signal heuristics `create-nockta-repo` uses at scaffold
 * time — out of scope here; documented as a known gap, not silently skipped.
 */
function checkTarget(targetDir: string, record: TargetRecord): TargetCheckResult {
  const abs = join(targetDir, record.path);
  const issues: string[] = [];

  let exists = false;
  try {
    exists = existsSync(abs) && statSync(abs).isDirectory();
  } catch {
    exists = false;
  }

  if (!exists) {
    issues.push("target directory does not exist");
    return { name: record.name, path: record.path, repoTypes: record.repoTypes, exists: false, plausible: false, issues };
  }

  const plausible = existsSync(join(abs, "package.json"));
  if (!plausible) {
    issues.push(
      "no package.json found in target directory — recorded repoTypes may no longer be plausible " +
        "(shallow check only)",
    );
  }

  return { name: record.name, path: record.path, repoTypes: record.repoTypes, exists, plausible, issues };
}

function emptyMonorepoReport(
  options: MonorepoDoctorCheckOptions,
  targetsStatus: "missing" | "invalid",
): DoctorReport {
  return {
    targetDir: options.targetDir,
    profileStatus: "ok-monorepo",
    isMonorepo: true,
    profile: options.profile,
    manifestFound: false,
    manifestValid: false,
    healthy: false,
    counts: emptyCounts(),
    files: [],
    unknownFiles: [],
    // targets.json missing/invalid can't be fixed by repair/upgrade (neither rewrites it,
    // per this milestone's brief item 4: "repair/upgrade operate on the root-rendered outputs
    // ... exactly as single-project mode does") — re-running install is what recreates it.
    suggestedAction: "install",
    packageVersion: options.packageVersion,
    targetsStatus,
    targets: [],
  };
}

/**
 * Monorepo doctor (spec §9.5, M5, new — replaces the M4 `"monorepo-unsupported"` guard).
 * Validates: `.nockta/targets.json` exists and is schema-valid; every recorded target directory
 * exists and passes the shallow plausibility check (see `checkTarget`); and — reusing the SAME
 * `classify-manifest.ts` engine single-project doctor uses — every root-rendered file tracked
 * in `.nockta/generated-manifest.json` is intact/missing/modified/stale against the UNION
 * canonical render plan across every distinct target `repoType` (spec §9.4: one root
 * `.claude/` covers every installed pack).
 */
export function runMonorepoDoctorChecks(options: MonorepoDoctorCheckOptions): DoctorReport {
  const targetsFileExists = existsSync(join(options.targetDir, ".nockta", "targets.json"));
  if (!targetsFileExists) {
    return emptyMonorepoReport(options, "missing");
  }

  const targetsFile = readTargetsFile(options.targetDir);
  if (!targetsFile) {
    return emptyMonorepoReport(options, "invalid");
  }

  const targetChecks = targetsFile.targets.map((t) => checkTarget(options.targetDir, t));
  const targetsHealthy = targetChecks.every((t) => t.exists && t.plausible);

  const distinctRepoTypes = [...new Set(targetsFile.targets.flatMap((t) => t.repoTypes))];
  const canonicalPlan = computeRenderPlan({
    repoTypes: distinctRepoTypes,
    adapters: options.profile.installedAdapters,
    monorepo: true,
    packsRoot: options.packsRoot,
    skillSelection: options.profile.skillSelection,
  });

  const manifest = readGeneratedManifest(options.targetDir);
  const manifestFound = existsSync(join(options.targetDir, ".nockta", "generated-manifest.json"));
  const manifestValid = manifest !== undefined;

  const { counts, files, unknownFiles } = classifyManifestRecords({
    targetDir: options.targetDir,
    manifest,
    canonicalPlan,
    packageVersion: options.packageVersion,
  });

  const current = options.profile.source.version === options.packageVersion;
  const filesHealthy = manifestValid && current && counts.missing === 0 && counts.modified === 0 && counts.stale === 0;
  const healthy = filesHealthy && targetsHealthy;

  // suggestedAction is driven by FILE-level health only, same vocabulary as single-project
  // doctor — target-dir issues are surfaced via `targetsStatus`/`targets[].issues` instead of
  // overloading "repair" with a fix it cannot perform (repair/upgrade never touch target app
  // directories, only root-rendered adapter output, per this milestone's scope).
  let suggestedAction: SuggestedAction;
  if (!manifestFound || !manifestValid) {
    suggestedAction = "repair";
  } else if (!current) {
    suggestedAction = "upgrade";
  } else if (counts.missing > 0 || counts.modified > 0 || counts.stale > 0) {
    suggestedAction = "repair";
  } else {
    suggestedAction = "no-op";
  }

  return {
    targetDir: options.targetDir,
    profileStatus: "ok-monorepo",
    isMonorepo: true,
    profile: options.profile,
    manifestFound,
    manifestValid,
    healthy,
    counts,
    files,
    unknownFiles,
    suggestedAction,
    packageVersion: options.packageVersion,
    targetsStatus: "ok",
    targets: targetChecks,
  };
}
