import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectPackageManager } from "./package-manager.js";
import { readSkillsProfile } from "./read-profile.js";
import type { AdapterType } from "../types/adapter.js";
import type { NocktaMonorepoSkillsProfile, NocktaSkillsProfile } from "../types/profile.js";
import type { RepoType } from "../types/repo-type.js";
import { EMPTY_SKILL_SELECTION } from "../types/skill-selection.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";

export interface WriteSkillsProfileOptions {
  targetDir: string;
  /** decisions.md D22 — one or more repo types; a single-type install still passes a one-element array. */
  repoTypes: RepoType[];
  installedPacks: string[];
  installedAdapters: AdapterType[];
  packageVersion: string;
  /** D19 — defaults to `EMPTY_SKILL_SELECTION` (no deltas) when omitted. */
  skillSelection?: SkillSelectionDeltas;
}

/**
 * Writes `<targetDir>/.nockta/skills-profile.json` (single-project shape,
 * spec §10.1). Safety rule (spec §14): only ever writes under `.nockta/`.
 *
 * Preserves `createdAt` across re-installs (reads any existing profile
 * first); `updatedAt` always reflects this run.
 */
export function writeSkillsProfile(options: WriteSkillsProfileOptions): NocktaSkillsProfile {
  const existing = readSkillsProfile(options.targetDir);
  const now = new Date().toISOString();

  const profile: NocktaSkillsProfile = {
    tool: "inject-nockta-skills",
    version: options.packageVersion,
    isMonorepo: false,
    repoTypes: [...options.repoTypes],
    installedPacks: [...options.installedPacks].sort(),
    installedAdapters: options.installedAdapters,
    source: {
      type: "bundled",
      package: "inject-nockta-skills",
      version: options.packageVersion,
    },
    packageManager: detectPackageManager(options.targetDir),
    createdAt: existing && !existing.isMonorepo ? existing.createdAt : now,
    updatedAt: now,
    skillSelection: options.skillSelection ?? EMPTY_SKILL_SELECTION,
  };

  const nocktaDir = join(options.targetDir, ".nockta");
  mkdirSync(nocktaDir, { recursive: true });
  writeFileSync(join(nocktaDir, "skills-profile.json"), `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  return profile;
}

export interface WriteMonorepoSkillsProfileOptions {
  targetDir: string;
  installedPacks: string[];
  installedAdapters: AdapterType[];
  packageVersion: string;
  /** D19 — defaults to `EMPTY_SKILL_SELECTION` (no deltas) when omitted. */
  skillSelection?: SkillSelectionDeltas;
}

/**
 * Writes `<targetDir>/.nockta/skills-profile.json` (monorepo shape, spec §10.2, M5 new).
 * Same `createdAt`-preservation / `updatedAt`-always-fresh convention as
 * `writeSkillsProfile()` above, keyed off `existing.isMonorepo` this time.
 */
export function writeMonorepoSkillsProfile(
  options: WriteMonorepoSkillsProfileOptions,
): NocktaMonorepoSkillsProfile {
  const existing = readSkillsProfile(options.targetDir);
  const now = new Date().toISOString();

  const profile: NocktaMonorepoSkillsProfile = {
    tool: "inject-nockta-skills",
    version: options.packageVersion,
    isMonorepo: true,
    installedPacks: [...options.installedPacks].sort(),
    installedAdapters: options.installedAdapters,
    targetsFile: ".nockta/targets.json",
    source: {
      type: "bundled",
      package: "inject-nockta-skills",
      version: options.packageVersion,
    },
    packageManager: detectPackageManager(options.targetDir),
    createdAt: existing && existing.isMonorepo ? existing.createdAt : now,
    updatedAt: now,
    skillSelection: options.skillSelection ?? EMPTY_SKILL_SELECTION,
  };

  const nocktaDir = join(options.targetDir, ".nockta");
  mkdirSync(nocktaDir, { recursive: true });
  writeFileSync(join(nocktaDir, "skills-profile.json"), `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  return profile;
}
