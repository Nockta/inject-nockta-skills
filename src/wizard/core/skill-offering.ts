import type { SkillCatalogEntry } from "../../packs/skill-catalog.js";
import type { AdapterType } from "../../types/adapter.js";
import type { RepoType } from "../../types/repo-type.js";

/**
 * Presenter-agnostic skill offer/lock/applicability logic (decisions.md D28 — the Model boundary).
 *
 * These predicates USED to live inside `wizard/steps/select-skills.ts` (prompt code). D28's MVC
 * split moves them here, into the wizard-core, so BOTH the CLI presenter's step (via
 * `planSkillSelectionStep`, which still imports them) AND the serializable Model
 * (`core/build-schema.ts`, `core/resolve.ts`) compute offerability from ONE brain — never a
 * second copy. Nothing here touches a terminal or a prompt; every function is pure and its inputs
 * are plain data, so the same offer/lock computation drives the deferred web presenter unchanged.
 */

export function isAdapterEligible(entry: SkillCatalogEntry, adapters: AdapterType[]): boolean {
  return entry.supportedAdapters.some((a) => adapters.includes(a));
}

/**
 * D26 (board decision d20): a skill with a declared `applicability` (today, only the razor pack's
 * skills) is only OFFERED when it intersects the current project's repo type(s). A skill with no
 * `applicability` at all (every non-razor skill) is always applicable.
 */
export function isApplicableToRepoTypes(entry: SkillCatalogEntry, repoTypes: RepoType[]): boolean {
  if (!entry.applicability) return true;
  return entry.applicability.some((t) => repoTypes.includes(t));
}

/**
 * D21, defensive: a default/optional skill is only OFFERABLE when it AND its full transitive
 * `requires` closure are adapter-eligible — a dependent whose dependency could never be satisfied
 * under the selected adapters is not offered at all. Required-tier skills are never filtered by
 * this (existing D8 behavior).
 */
export function isOfferable(
  entry: SkillCatalogEntry,
  byName: Map<string, SkillCatalogEntry>,
  adapters: AdapterType[],
  seen: Set<string> = new Set(),
): boolean {
  if (seen.has(entry.skill)) return true; // cycle guard — core's job to reject real cycles, not the offer filter's.
  seen.add(entry.skill);
  if (!isAdapterEligible(entry, adapters)) return false;
  for (const depName of entry.requires) {
    const dep = byName.get(depName);
    if (!dep) return true; // dangling requires — core's validation surfaces this, not offerability.
    if (!isOfferable(dep, byName, adapters, seen)) return false;
  }
  return true;
}

/**
 * The offerable subset of a catalog for the given adapters + repo type(s): adapter-eligible (or
 * required) AND applicable. This is the single filter every offer surface (CLI prompt, schema,
 * resolve) shares.
 */
export function offerableEntries(
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
): SkillCatalogEntry[] {
  const byName = new Map(catalog.map((e) => [e.skill, e]));
  return catalog.filter(
    (e) =>
      (e.enablement === "required" || isOfferable(e, byName, adapters)) && isApplicableToRepoTypes(e, repoTypes),
  );
}

/** True for a razor-pack (personal engineering-doctrine) skill — the layer that gets its OWN wizard step (D28). */
export function isRazorEntry(entry: SkillCatalogEntry): boolean {
  return entry.pack === "razor";
}

/**
 * D26 clash id -> readable display name. Clash ids are either bare skill names or `razor:<name>`.
 * A bare id displays as-is; a `razor:`-prefixed id has the prefix stripped and `" (razor)"`
 * appended so the source stays recognizable.
 */
export function clashIdToDisplayName(id: string): string {
  return id.startsWith("razor:") ? `${id.slice("razor:".length)} (razor)` : id;
}
