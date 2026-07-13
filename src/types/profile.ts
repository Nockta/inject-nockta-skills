import type { AdapterType } from "./adapter.js";
import type { RepoType } from "./repo-type.js";
import type { SkillSelectionDeltas } from "./skill-selection.js";

/**
 * `.nockta/skills-profile.json` shape for a single (non-monorepo) project.
 * Spec: startup docs/inject-nockta-skills.updated.md §10.1.
 *
 * `skillSelection` (M7, decisions.md D19): the spec §10.1 PROSE explicitly requires "the profile
 * records skill selection deltas (excluded defaults, included optionals)" but the spec's own
 * TS sample directly under that prose does not list the field — a spec-internal inconsistency,
 * not something introduced here (documented in `src/core/CONTEXT.md`). This field follows the
 * PROSE (the brief this milestone was built from names it explicitly:
 * `skillSelection: { excluded: string[], included: string[] }`). Optional on the TYPE so an
 * old (pre-M7) profile on disk still satisfies `NocktaSkillsProfile` structurally
 * (`profile-guard.ts` never required exact-shape matching); ALWAYS written going forward
 * (`write-profile.ts`) — reader code treats an absent field as `EMPTY_SKILL_SELECTION`.
 *
 * `repoTypes` (decisions.md D22, replaces the pre-D22 singular `repoType`): a target may span
 * multiple repo-type domains — the union of every named type's skill pack is installed. A
 * single-type project still records a one-element array. `profile-guard.ts`'s
 * `readProfileForMaintenance()` READS a legacy singular `repoType` on an old profile as a
 * one-element `repoTypes` (back-compat read-shim; no published versions carry the old shape).
 * Every WRITE always uses the new `repoTypes` form (`core/write-profile.ts`).
 */
export interface NocktaSkillsProfile {
  tool: "inject-nockta-skills";
  version: string;
  isMonorepo: false;
  repoTypes: RepoType[];
  installedPacks: string[];
  installedAdapters: AdapterType[];
  source: {
    type: "bundled";
    package: "inject-nockta-skills";
    version: string;
  };
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  createdAt: string;
  updatedAt: string;
  skillSelection?: SkillSelectionDeltas;
}

/**
 * `.nockta/skills-profile.json` shape for a monorepo install.
 * Spec: startup docs/inject-nockta-skills.updated.md §10.2.
 *
 * Not yet written by any command (monorepo `--target` install is out of
 * scope for Milestone 3 — see src/CONTEXT.md). Declared now so the type
 * surface matches spec §11's `src/types/profile.ts` ahead of that work.
 */
export interface NocktaMonorepoSkillsProfile {
  tool: "inject-nockta-skills";
  version: string;
  isMonorepo: true;
  installedPacks: string[];
  installedAdapters: AdapterType[];
  targetsFile: ".nockta/targets.json";
  source: {
    type: "bundled";
    package: "inject-nockta-skills";
    version: string;
  };
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  createdAt: string;
  updatedAt: string;
  /** M7, decisions.md D19 — see `NocktaSkillsProfile.skillSelection`'s doc comment. Root-scoped: one set of deltas for the whole monorepo (matches how `installedAdapters` is a single root-rendered set, spec §9.4). */
  skillSelection?: SkillSelectionDeltas;
}
