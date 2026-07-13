import { join } from "node:path";
import { applyRenderPlan } from "./apply-render-plan.js";
import { computeRenderPlan } from "./render-plan.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { writeSkillsProfile } from "./write-profile.js";
import { applyStandingMode } from "./standing-mode.js";
import type { ApplyRenderPlanResult } from "./apply-render-plan.js";
import type { NocktaSkillsProfile } from "../types/profile.js";

export interface UpgradeAdaptersOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  force: boolean;
  /** Caller (`commands/upgrade.ts`) is responsible for the profile-guard check (spec §7.6). */
  profile: NocktaSkillsProfile;
}

export type UpgradeAdaptersResult = ApplyRenderPlanResult & {
  manifestPath: string;
  profilePath: string;
  previousVersion: string;
  newVersion: string;
};

/**
 * `upgrade` core (spec §7.6, §13.4): re-renders ALL generated output using
 * the currently running package version — unlike `repair`, this refreshes
 * already-intact-and-current files too, guaranteeing the whole tree
 * reflects the running version — while still refusing to clobber
 * user-modified files without `--force` (same `applyRenderPlan` policy as
 * repair, mode `"upgrade"`). Updates
 * `.nockta/skills-profile.json`'s `version`/`source.version`/`updatedAt`
 * (preserving `createdAt`, `repoType`, `installedPacks`,
 * `installedAdapters` — M4 upgrade re-renders content, it does not add or
 * remove packs; see src/CONTEXT.md for that recorded scope boundary).
 */
export function upgradeAdapters(options: UpgradeAdaptersOptions): UpgradeAdaptersResult {
  const previousVersion = options.profile.source.version;

  const canonicalPlan = computeRenderPlan({
    repoTypes: options.profile.repoTypes,
    adapters: options.profile.installedAdapters,
    packsRoot: options.packsRoot,
    skillSelection: options.profile.skillSelection,
  });

  const existingRecords = readGeneratedManifest(options.targetDir)?.files ?? [];

  const applied = applyRenderPlan({
    targetDir: options.targetDir,
    canonicalPlan,
    existingRecords,
    force: options.force,
    packageVersion: options.packageVersion,
    mode: "upgrade",
  });

  writeGeneratedManifest(options.targetDir, applied.records);

  writeSkillsProfile({
    targetDir: options.targetDir,
    repoTypes: options.profile.repoTypes,
    installedPacks: options.profile.installedPacks,
    installedAdapters: options.profile.installedAdapters,
    packageVersion: options.packageVersion,
    // Toggles preserved verbatim (decisions.md D19, brief item 6) — upgrade re-renders content,
    // it does not recompute or reset the user's selection deltas. New default/optional skills in
    // a newer pack version are picked up automatically NEXT TIME `computeRenderPlan()` resolves
    // this SAME delta against the (now newer) catalog — nothing about the delta itself changes.
    skillSelection: options.profile.skillSelection,
  });

  // Standing-mode contract (decisions.md D34): refresh root AGENTS.md (agent adapter not selected)
  // + CLAUDE.md @import (claude selected), idempotently — picks up any block-text change in the new
  // version. When the agent adapter IS selected, AGENTS.md is a tracked file refreshed by
  // `applyRenderPlan` above (upgrade re-renders it).
  applyStandingMode({ targetDir: options.targetDir, adapters: options.profile.installedAdapters });

  return {
    ...applied,
    manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json"),
    profilePath: join(options.targetDir, ".nockta", "skills-profile.json"),
    previousVersion,
    newVersion: options.packageVersion,
  };
}
