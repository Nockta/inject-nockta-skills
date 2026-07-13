import { existsSync } from "node:fs";
import { join } from "node:path";
import { computeRenderPlan } from "./render-plan.js";
import { classifyManifestRecords } from "./classify-manifest.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { readProfileForMaintenance } from "./profile-guard.js";
import { runMonorepoDoctorChecks } from "./monorepo-doctor-checks.js";
import { emptyCounts } from "../types/doctor.js";
import type { DoctorReport } from "../types/doctor.js";

export interface DoctorCheckOptions {
  targetDir: string;
  packsRoot?: string;
  /** Defaults to the currently running package's own version. */
  packageVersion: string;
}

/**
 * Classifies every file tracked in `.nockta/generated-manifest.json` as
 * intact/missing/modified/stale (spec §10.3), plus scans the managed
 * adapter output dirs for files present-but-untracked ("unknown").
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §7.4, §10.3, §13.2.
 *
 * M5, new: dispatches to `monorepo-doctor-checks.ts` when the profile is a valid monorepo
 * profile (`profile-guard.ts`'s `"ok-monorepo"` status) — the M4 `"monorepo-unsupported"` guard
 * this replaced is gone. Single-project logic below (guard status `"ok"`) is UNCHANGED from M4
 * except for delegating its classification loop to the shared `classify-manifest.ts` helper.
 */
export function runDoctorChecks(options: DoctorCheckOptions): DoctorReport {
  const guard = readProfileForMaintenance(options.targetDir);

  if (guard.status === "ok-monorepo") {
    return runMonorepoDoctorChecks({
      targetDir: options.targetDir,
      packsRoot: options.packsRoot,
      packageVersion: options.packageVersion,
      profile: guard.profile,
    });
  }

  if (guard.status !== "ok") {
    return {
      targetDir: options.targetDir,
      profileStatus: guard.status,
      isMonorepo: false,
      profile: null,
      manifestFound: false,
      manifestValid: false,
      healthy: false,
      counts: emptyCounts(),
      files: [],
      unknownFiles: [],
      suggestedAction: "install",
      packageVersion: options.packageVersion,
      targetsStatus: "n/a",
      targets: [],
    };
  }

  const profile = guard.profile;
  const manifest = readGeneratedManifest(options.targetDir);
  const manifestFound = existsSync(join(options.targetDir, ".nockta", "generated-manifest.json"));
  const manifestValid = manifest !== undefined;

  const canonicalPlan = computeRenderPlan({
    repoTypes: profile.repoTypes,
    adapters: profile.installedAdapters,
    packsRoot: options.packsRoot,
    skillSelection: profile.skillSelection,
  });

  const { counts, files, unknownFiles } = classifyManifestRecords({
    targetDir: options.targetDir,
    manifest,
    canonicalPlan,
    packageVersion: options.packageVersion,
  });

  // "Healthy" folds in profile-level currency too (spec §7.7/§13.5/§18:
  // "no-op when everything is healthy AND current") — not just per-file
  // classification. This matters even when every file happens to still be
  // byte-identical to what an old version generated: if the profile's own
  // recorded `source.version` no longer matches the running package, that
  // alone is an actionable "you should upgrade" finding, so doctor must not
  // report exit 0 / no-op for it (belt-and-suspenders alongside the
  // per-file `stale` classification, which normally also fires together
  // with a version bump since profile + manifest are always written in the
  // same pass — see write-profile.ts/write-manifest.ts).
  const current = profile.source.version === options.packageVersion;
  const healthy =
    manifestValid && current && counts.missing === 0 && counts.modified === 0 && counts.stale === 0;

  let suggestedAction: DoctorReport["suggestedAction"];
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
    profileStatus: "ok",
    isMonorepo: false,
    profile,
    manifestFound,
    manifestValid,
    healthy,
    counts,
    files,
    unknownFiles,
    suggestedAction,
    packageVersion: options.packageVersion,
    targetsStatus: "n/a",
    targets: [],
  };
}
