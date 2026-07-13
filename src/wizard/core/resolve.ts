import { resolveSkillSelection } from "../../core/skill-selection.js";
import type { SkillCatalogEntry } from "../../packs/skill-catalog.js";
import type { AdapterType } from "../../types/adapter.js";
import type { RepoType } from "../../types/repo-type.js";
import type { SkillSelectionDeltas } from "../../types/skill-selection.js";
import type { InstallPlan, WizardAnswers } from "./types.js";

/**
 * Merge the general (non-razor) and razor skill deltas into the single delta pair the install
 * core consumes. Razor skills are all optional, so razor only ever contributes `included`;
 * general contributes both. Deduped + sorted so the plan is stable/serializable.
 */
export function mergeSkillDeltas(
  general: SkillSelectionDeltas | undefined,
  razor: SkillSelectionDeltas | undefined,
): SkillSelectionDeltas {
  const excluded = [...new Set([...(general?.excluded ?? []), ...(razor?.excluded ?? [])])].sort();
  const included = [...new Set([...(general?.included ?? []), ...(razor?.included ?? [])])].sort();
  return { excluded, included };
}

/**
 * Pure `resolve(answers) -> InstallPlan` (decisions.md D28 seam #4). Takes the plain, JSON
 * round-trippable `WizardAnswers` object — exactly what a web page POSTs back — and yields the
 * plain option object `buildInstallResult()` executes. Does NO I/O: the web flow is literally
 * `answers -> resolve() -> buildInstallResult(plan)`, identical to the CLI flow's final assembly.
 *
 * `type` (single-project) XOR `targets` (monorepo) mirrors the two branches. Adapters/skills are
 * threaded verbatim; razor + general skill deltas are merged (`mergeSkillDeltas`).
 */
export function resolve(answers: WizardAnswers): InstallPlan {
  const merged = mergeSkillDeltas(answers.skills, answers.razor);
  const plan: InstallPlan = {
    adapters: (answers.adapters ?? []).join(","),
    excludeSkills: merged.excluded,
    includeSkills: merged.included,
  };
  if (answers.monorepo) {
    plan.monorepo = true;
    plan.targets = (answers.targets ?? []).map((t) => `${t.path}:${t.types.join("+")}`);
  } else {
    plan.type = (answers.repoTypes ?? []).join(",");
  }
  return plan;
}

/**
 * One resolution round for a single skill LAYER (general or razor) inside the Controller's
 * lock/release loop (decisions.md D21, generalized by D28's own-step split). Reuses
 * `resolveSkillSelection()` — the SAME closure/lock engine the non-interactive
 * `--include-skills`/`--exclude-skills` path uses, never a wizard-local reimplementation.
 *
 * Given the set of values the user left checked (`answerSet`) among this layer's offerable
 * `layerEntries`, it derives the layer's deltas, resolves the full catalog for the dependency
 * closure, and returns the next checked/locked state (restricted to this layer's rows, since the
 * step only shows those) plus the layer's deltas. The Controller re-renders when `nextChecked`
 * differs from `answerSet` (a newly-pulled-in dependency the user hadn't seen locked yet).
 */
export interface SkillLayerRound {
  /** Effective checked set for this layer's rows (for the next re-render). */
  nextChecked: Set<string>;
  /** dep -> dependents currently locking it on (this layer's rows only). */
  nextLocked: Map<string, string[]>;
  /** The layer's contribution to the final deltas. */
  deltas: SkillSelectionDeltas;
}

export function resolveSkillLayerRound(
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
  layerEntries: SkillCatalogEntry[],
  answerSet: ReadonlySet<string>,
): SkillLayerRound {
  const layerValues = new Set(layerEntries.map((e) => e.skill));

  let excludedGuess = layerEntries
    .filter((e) => e.enablement === "default" && !answerSet.has(e.skill))
    .map((e) => e.skill);
  const includedGuess = layerEntries
    .filter((e) => e.enablement === "optional" && answerSet.has(e.skill))
    .map((e) => e.skill);

  let resolved = resolveSkillSelection({ catalog, excluded: excludedGuess, included: includedGuess, adapters, repoTypes });
  if (resolved.blockedExclusions.length > 0) {
    excludedGuess = excludedGuess.filter((n) => !resolved.blockedExclusions.includes(n));
    resolved = resolveSkillSelection({ catalog, excluded: excludedGuess, included: includedGuess, adapters, repoTypes });
  }

  const includedLayer = resolved.ok
    ? resolved.deltas.included.filter((n) => layerValues.has(n))
    : includedGuess;

  const nextChecked = new Set<string>();
  if (resolved.ok) {
    for (const name of resolved.effective) if (layerValues.has(name)) nextChecked.add(name);
  } else {
    for (const name of answerSet) if (layerValues.has(name)) nextChecked.add(name);
  }

  const nextLocked = new Map<string, string[]>();
  for (const [dep, dependents] of resolved.requiredBy) {
    if (dependents.length > 0 && layerValues.has(dep)) nextLocked.set(dep, dependents);
  }

  return {
    nextChecked,
    nextLocked,
    deltas: { excluded: excludedGuess, included: includedLayer },
  };
}
