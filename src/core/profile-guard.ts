import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSkillsProfile } from "./read-profile.js";
import { isRepoType } from "../types/repo-type.js";
import type { NocktaMonorepoSkillsProfile, NocktaSkillsProfile } from "../types/profile.js";

/**
 * Discriminated read result for `.nockta/skills-profile.json`, shared by
 * doctor/repair/upgrade/sync. Distinguishes "no file at all" from
 * "file present but unparsable/invalid" from "valid single-project profile"
 * from "valid monorepo profile" — each needs different command behavior.
 *
 * M5, new: monorepo profiles are now a REAL, supported status
 * (`"ok-monorepo"`) rather than the M4 `"monorepo-unsupported"` guard this
 * replaces — doctor/repair/upgrade/sync all branch on it to run the
 * monorepo-aware path (spec §9.5, this milestone's brief).
 */
export type ProfileGuardResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "ok"; profile: NocktaSkillsProfile }
  | { status: "ok-monorepo"; profile: NocktaMonorepoSkillsProfile };

/**
 * D22 read-shim: a raw parsed profile may carry the pre-D22 singular `repoType: string` instead
 * of `repoTypes: string[]` — this normalizes it to the current shape BEFORE validation, in place,
 * so every downstream consumer of a `NocktaSkillsProfile` only ever sees `repoTypes`. No published
 * versions carry the old shape (decisions.md D22's own "Why"), but the shim costs nothing.
 */
function normalizeLegacyRepoType(p: Record<string, unknown>): void {
  if (p.repoTypes === undefined && typeof p.repoType === "string") {
    p.repoTypes = [p.repoType];
  }
}

function isValidSingleProjectProfile(value: unknown): value is NocktaSkillsProfile {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.tool === "inject-nockta-skills" &&
    typeof p.version === "string" &&
    p.isMonorepo === false &&
    Array.isArray(p.repoTypes) &&
    p.repoTypes.length > 0 &&
    p.repoTypes.every((t) => typeof t === "string" && isRepoType(t)) &&
    Array.isArray(p.installedPacks) &&
    Array.isArray(p.installedAdapters) &&
    typeof p.source === "object" &&
    p.source !== null &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string"
  );
}

function isValidMonorepoProfile(value: unknown): value is NocktaMonorepoSkillsProfile {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.tool === "inject-nockta-skills" &&
    typeof p.version === "string" &&
    p.isMonorepo === true &&
    Array.isArray(p.installedPacks) &&
    Array.isArray(p.installedAdapters) &&
    p.targetsFile === ".nockta/targets.json" &&
    typeof p.source === "object" &&
    p.source !== null &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string"
  );
}

/**
 * Reads and validates `.nockta/skills-profile.json` for the maintenance
 * commands (doctor/repair/upgrade/sync). Never throws.
 */
export function readProfileForMaintenance(targetDir: string): ProfileGuardResult {
  const profilePath = join(targetDir, ".nockta", "skills-profile.json");
  if (!existsSync(profilePath)) return { status: "missing" };

  const raw = readSkillsProfile(targetDir);
  if (raw === undefined) return { status: "invalid" };

  if ((raw as { isMonorepo?: unknown }).isMonorepo === true) {
    if (!isValidMonorepoProfile(raw)) return { status: "invalid" };
    return { status: "ok-monorepo", profile: raw };
  }

  // D22 read-shim: normalize a legacy singular `repoType` to `repoTypes` BEFORE validating.
  normalizeLegacyRepoType(raw as unknown as Record<string, unknown>);

  if (!isValidSingleProjectProfile(raw)) return { status: "invalid" };
  return { status: "ok", profile: raw };
}
