import { join } from "node:path";
import { applyRenderPlan } from "./apply-render-plan.js";
import { computeRenderPlan } from "./render-plan.js";
import { readGeneratedManifest } from "./read-manifest.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { applyStandingMode } from "./standing-mode.js";
import type { ApplyRenderPlanResult } from "./apply-render-plan.js";
import type { NocktaSkillsProfile } from "../types/profile.js";

export interface RepairAdaptersOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  force: boolean;
  /** Caller (`commands/repair.ts`) is responsible for the profile-guard check (spec §7.5). */
  profile: NocktaSkillsProfile;
}

export type RepairAdaptersResult = ApplyRenderPlanResult & { manifestPath: string };

/**
 * `repair` core (spec §7.5, §13.3, decisions.md D3): recreates missing
 * generated files, safely refreshes stale-by-source files, warns on (never
 * overwrites) user-modified files unless `--force`, never touches unknown
 * files, and rewrites the manifest so a following `doctor` is clean. Does
 * NOT touch `.nockta/skills-profile.json` — repair never changes the
 * recorded package/source version (that is `upgrade`'s job, spec §7.6).
 */
export function repairAdapters(options: RepairAdaptersOptions): RepairAdaptersResult {
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
    mode: "repair",
  });

  writeGeneratedManifest(options.targetDir, applied.records);

  // Standing-mode contract (decisions.md D34): restore/refresh root AGENTS.md (agent adapter not
  // selected) + CLAUDE.md @import (claude selected), idempotently. When the agent adapter IS
  // selected, AGENTS.md is a tracked file already restored by `applyRenderPlan` above.
  applyStandingMode({ targetDir: options.targetDir, adapters: options.profile.installedAdapters });

  return { ...applied, manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json") };
}
