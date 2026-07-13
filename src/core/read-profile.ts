import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NocktaMonorepoSkillsProfile, NocktaSkillsProfile } from "../types/profile.js";

/**
 * Reads `.nockta/skills-profile.json` from a target dir, if present and
 * parseable. Returns `undefined` rather than throwing on any problem
 * (missing file, invalid JSON) — callers (currently just `write-profile.ts`,
 * to preserve `createdAt` across re-installs) treat "no readable profile"
 * and "first install" identically.
 */
export function readSkillsProfile(
  targetDir: string,
): NocktaSkillsProfile | NocktaMonorepoSkillsProfile | undefined {
  const profilePath = join(targetDir, ".nockta", "skills-profile.json");
  if (!existsSync(profilePath)) return undefined;

  try {
    return JSON.parse(readFileSync(profilePath, "utf8")) as NocktaSkillsProfile | NocktaMonorepoSkillsProfile;
  } catch {
    return undefined;
  }
}
