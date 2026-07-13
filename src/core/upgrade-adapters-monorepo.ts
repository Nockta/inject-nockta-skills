import { join } from "node:path";
import { applyRenderPlan } from "./apply-render-plan.js";
import { computeRenderPlan } from "./render-plan.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { writeMonorepoSkillsProfile } from "./write-profile.js";
import { applyStandingMode } from "./standing-mode.js";
import type { ApplyRenderPlanResult } from "./apply-render-plan.js";
import type { NocktaMonorepoSkillsProfile } from "../types/profile.js";
import type { TargetsFile } from "../types/target.js";

export interface UpgradeMonorepoAdaptersOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  force: boolean;
  /** Caller (`commands/upgrade.ts`) is responsible for the profile-guard check (spec §7.6). */
  profile: NocktaMonorepoSkillsProfile;
  targets: TargetsFile;
}

export type UpgradeMonorepoAdaptersResult = ApplyRenderPlanResult & {
  manifestPath: string;
  profilePath: string;
  previousVersion: string;
  newVersion: string;
};

/**
 * Monorepo `upgrade` core (spec §7.6, §9.5, brief item 4). Same shape as
 * `upgrade-adapters.ts` — mode `"upgrade"` (refreshes intact-and-current files too, not just
 * stale/missing) — but the canonical plan is the UNION across every target's `repoType`
 * (`targets.targets`), and the profile write goes through `writeMonorepoSkillsProfile()`
 * (preserves `installedPacks`/`installedAdapters`/`createdAt`/`targetsFile`, bumps
 * `version`/`source.version`/`updatedAt`). Does NOT touch `.nockta/targets.json` — upgrade
 * re-renders content, it does not add/remove targets (mirrors the single-project scope note in
 * `upgrade-adapters.ts`).
 */
export function upgradeMonorepoAdapters(
  options: UpgradeMonorepoAdaptersOptions,
): UpgradeMonorepoAdaptersResult {
  const previousVersion = options.profile.source.version;

  const distinctRepoTypes = [...new Set(options.targets.targets.flatMap((t) => t.repoTypes))];

  const canonicalPlan = computeRenderPlan({
    repoTypes: distinctRepoTypes,
    adapters: options.profile.installedAdapters,
    monorepo: true,
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

  writeMonorepoSkillsProfile({
    targetDir: options.targetDir,
    installedPacks: options.profile.installedPacks,
    installedAdapters: options.profile.installedAdapters,
    packageVersion: options.packageVersion,
    // Toggles preserved verbatim — see the single-project note in `upgrade-adapters.ts`.
    skillSelection: options.profile.skillSelection,
  });

  // Standing-mode contract (decisions.md D34) at the monorepo root — same idempotent side effects
  // as single-project upgrade (see `upgrade-adapters.ts`).
  applyStandingMode({ targetDir: options.targetDir, adapters: options.profile.installedAdapters });

  return {
    ...applied,
    manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json"),
    profilePath: join(options.targetDir, ".nockta", "skills-profile.json"),
    previousVersion,
    newVersion: options.packageVersion,
  };
}
