import type { NocktaMonorepoSkillsProfile, NocktaSkillsProfile } from "./profile.js";
import type { RepoType } from "./repo-type.js";

/**
 * Shared classification vocabulary for doctor/repair/upgrade/sync
 * (spec §10.3, §7.4-§7.7, §13.2-§13.5). Kept as its own type file, same
 * convention as `generated-manifest.ts` — not itemized by name in spec §11's
 * `src/types/` list, added because M4's maintenance commands need this shape
 * typed somewhere shared rather than duplicated per command.
 */
export type FileClassification = "intact" | "missing" | "modified" | "stale" | "unknown";

export interface ClassifiedFile {
  /** Path relative to the target repo root, e.g. ".claude/skills/paper-trail/SKILL.md". */
  path: string;
  classification: FileClassification;
  adapter?: string;
  pack?: string;
  skill?: string;
  /** Human-readable explanation, e.g. "generatorVersion 0.1.0 (recorded) != 0.2.0 (running)". */
  detail?: string;
}

export type ClassificationCounts = Record<FileClassification, number>;

export function emptyCounts(): ClassificationCounts {
  return { intact: 0, missing: 0, modified: 0, stale: 0, unknown: 0 };
}

/** Doctor's per-repo suggested next command (spec §7.4, §18). */
export type SuggestedAction = "install" | "repair" | "upgrade" | "no-op";

/**
 * Per-target check result for monorepo doctor (spec §9.5, M5, new). "Plausible" is a
 * DELIBERATELY SHALLOW check (existence + a `package.json` present in the target dir) — deep
 * framework re-detection (actually confirming the directory still looks like a Next.js app,
 * say) is explicitly NOT this milestone's job (see `monorepo-doctor-checks.ts`).
 */
export interface TargetCheckResult {
  name: string;
  path: string;
  /** decisions.md D22 — one or more repo types; a single-type target still has a one-element array. */
  repoTypes: RepoType[];
  /** Target directory exists on disk under the monorepo root. */
  exists: boolean;
  /** Shallow plausibility only — see the doc comment above. False whenever `exists` is false. */
  plausible: boolean;
  issues: string[];
}

/**
 * Unified doctor report shape (M5, new) — covers BOTH single-project and monorepo profiles so
 * `sync-orchestrator.ts` can consume one report shape regardless of mode. `targetsStatus`/
 * `targets` are monorepo-only; single-project reports always set `targetsStatus: "n/a"` and
 * `targets: []`.
 */
export interface DoctorReport {
  targetDir: string;
  profileStatus: "missing" | "invalid" | "ok" | "ok-monorepo";
  isMonorepo: boolean;
  profile: NocktaSkillsProfile | NocktaMonorepoSkillsProfile | null;
  manifestFound: boolean;
  manifestValid: boolean;
  /** No missing/modified/stale tracked files, current package version, AND (monorepo only) every target plausible. */
  healthy: boolean;
  counts: ClassificationCounts;
  files: ClassifiedFile[];
  unknownFiles: string[];
  suggestedAction: SuggestedAction;
  packageVersion: string;
  targetsStatus: "missing" | "invalid" | "ok" | "n/a";
  targets: TargetCheckResult[];
}
