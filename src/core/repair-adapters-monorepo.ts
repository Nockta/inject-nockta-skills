import { join } from "node:path";
import { applyRenderPlan } from "./apply-render-plan.js";
import { computeRenderPlan } from "./render-plan.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { applyStandingMode } from "./standing-mode.js";
import type { ApplyRenderPlanResult } from "./apply-render-plan.js";
import type { NocktaMonorepoSkillsProfile } from "../types/profile.js";
import type { TargetsFile } from "../types/target.js";

export interface RepairMonorepoAdaptersOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  force: boolean;
  /** Caller (`commands/repair.ts`) is responsible for the profile-guard check (spec §7.5). */
  profile: NocktaMonorepoSkillsProfile;
  targets: TargetsFile;
}

export type RepairMonorepoAdaptersResult = ApplyRenderPlanResult & { manifestPath: string };

/**
 * Monorepo `repair` core (spec §7.5, §9.5, brief item 4: "repair/upgrade operate on the
 * root-rendered outputs exactly as single-project mode does, using the monorepo profile").
 * Identical engine to `repair-adapters.ts` — the only difference is the canonical plan is
 * computed from the UNION of every target's `repoTypes` (`targets.targets`, D22 multi-type,
 * flattened) instead of a single-project profile's `repoTypes`. Does NOT touch
 * `.nockta/targets.json` or `.nockta/skills-profile.json` —
 * repair never adds/removes targets or packs, same scope boundary as single-project repair.
 */
export function repairMonorepoAdapters(options: RepairMonorepoAdaptersOptions): RepairMonorepoAdaptersResult {
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
    mode: "repair",
  });

  writeGeneratedManifest(options.targetDir, applied.records);

  // Standing-mode contract (decisions.md D34) at the monorepo root — same idempotent side effects
  // as single-project repair (see `repair-adapters.ts`).
  applyStandingMode({ targetDir: options.targetDir, adapters: options.profile.installedAdapters });

  return { ...applied, manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json") };
}
