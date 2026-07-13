/**
 * Skill-selection deltas (decisions.md D19) — shared vocabulary between `types/profile.ts` (what
 * gets written to `.nockta/skills-profile.json`) and `core/skill-selection.ts` (the resolution
 * engine). Split into its own file, same convention as `types/doctor.ts`/
 * `types/generated-manifest.ts`: a `types/*.ts` file must stay a leaf (no `core/`/`commands/`
 * imports), so the shape lives here and `core/skill-selection.ts` imports + re-exports it rather
 * than `types/profile.ts` reaching into `core/`.
 */
export interface SkillSelectionDeltas {
  /** Default-tier skill names the user turned OFF. */
  excluded: string[];
  /** Optional-tier skill names the user turned ON. */
  included: string[];
}

export const EMPTY_SKILL_SELECTION: SkillSelectionDeltas = { excluded: [], included: [] };
