import { join } from "node:path";
import { readSkillManifest } from "./read-skill-manifest.js";
import type { ResolvedPackEntry } from "./resolve-packs.js";
import type { AdapterType } from "../types/adapter.js";
import type { SkillEnablement } from "../types/pack.js";
import type { RepoType } from "../types/repo-type.js";

/**
 * One entry in the flat, tier-tagged catalog of every skill a set of resolved packs declares
 * (decisions.md D19, spec §12). Built by reading each skill's `skill.json` the exact same way
 * the Claude/Cursor/Copilot renderers already do (`readSkillManifest()`) — this is deliberately
 * NOT a second parallel read of the pack tree, just a reuse of the existing manifest reader for
 * a different purpose (selection resolution instead of rendering).
 *
 * `supportedAdapters` + `requires` (both M8, decisions.md D21) are carried through verbatim from
 * the skill's own `SkillManifest` — `core/skill-selection.ts` needs BOTH to compute adapter-gated
 * selectability and the `requires` dependency closure; nothing here computes or validates either,
 * this module stays pure pack/skill knowledge (see this directory's `CONTEXT.md`).
 *
 * `description`/`clashesWith`/`applicability` (D26) are carried through verbatim too — the
 * wizard's skill-selection step (`wizard/steps/select-skills.ts`) reads all three to label each
 * choice (description text, the clash disclaimer, and the razor-layer repo-type offer filter);
 * `core/skill-selection.ts` reads `applicability` to enforce the same filter non-interactively
 * for `--include-skills`.
 */
export interface SkillCatalogEntry {
  pack: string;
  skill: string;
  enablement: SkillEnablement;
  supportedAdapters: AdapterType[];
  /** Always an array (defaults to `[]` when the skill declares no `requires`) — never `undefined`, so every consumer can iterate without a null check. */
  requires: string[];
  /** D26 — verbatim from `skill.json`'s `description`, sourced from the skill's own SKILL.md frontmatter at import time. Absent for skills authored before this field existed. */
  description?: string;
  /** D26 — verbatim from `skill.json`'s `clashesWith` (advisory same-ground-overlap refs, ids may be bare or `razor:<name>`). Absent means no known clash. */
  clashesWith?: string[];
  /** D26 — verbatim from `skill.json`'s `applicability`. Absent means "all repo types" (every pre-razor skill's convention); populated today only by the `razor` pack's 61 skills. */
  applicability?: RepoType[];
  /** Verbatim from `skill.json`'s `category` — the razor principle category (`wizard/core/build-schema.ts`'s `buildRazorStep` sections on this, NOT `pack`). Absent for every non-razor skill. */
  category?: string;
}

/**
 * Builds the full skill catalog for a set of INSTALLABLE packs (the D6 content gate is
 * `resolve-packs.ts`'s job — this module trusts that filtering, same convention as
 * `src/adapters/*`). Used by `core/skill-selection.ts` (CLI-level `--exclude-skills`/
 * `--include-skills` validation and effective-set resolution) and the wizard's step 5
 * (`wizard/steps/select-skills.ts`, spec §7.1) to label each choice with its tier + source pack.
 */
export function buildSkillCatalog(packs: ResolvedPackEntry[], packsRoot: string): SkillCatalogEntry[] {
  const entries: SkillCatalogEntry[] = [];
  for (const pack of packs) {
    const packPath = join(packsRoot, pack.name);
    for (const skillName of pack.manifest.skills) {
      const skillDir = join(packPath, "skills", skillName);
      const manifest = readSkillManifest(skillDir, skillName, pack.manifest.adapters);
      entries.push({
        pack: pack.name,
        skill: skillName,
        enablement: manifest.enablement,
        supportedAdapters: manifest.supportedAdapters,
        requires: manifest.requires ?? [],
        ...(manifest.description !== undefined ? { description: manifest.description } : {}),
        ...(manifest.clashesWith !== undefined ? { clashesWith: manifest.clashesWith } : {}),
        ...(manifest.applicability !== undefined ? { applicability: manifest.applicability } : {}),
        ...(manifest.category !== undefined ? { category: manifest.category } : {}),
      });
    }
  }
  return entries;
}
