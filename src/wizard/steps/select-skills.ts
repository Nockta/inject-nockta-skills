import { resolveSkillSelection } from "../../core/skill-selection.js";
import type { SkillCatalogEntry } from "../../packs/skill-catalog.js";
import type { AdapterType } from "../../types/adapter.js";
import type { RepoType } from "../../types/repo-type.js";
import type { SkillSelectionDeltas } from "../../types/skill-selection.js";
import type { WizardChoice, WizardPrompts } from "../prompts.js";
import {
  clashIdToDisplayName,
  isApplicableToRepoTypes,
  isOfferable,
} from "../core/skill-offering.js";

export interface SkillSelectionStepPlan {
  choices: WizardChoice<string>[];
}

/** A generous but finite cap on lock-convergence rounds (decisions.md D21) — see `selectSkills()`'s
 * doc comment for why this always converges quickly in practice, and what happens on the (never
 * expected with real/fixture data) non-convergent fallback. */
const MAX_LOCK_ROUNDS = 8;

/**
 * D26 (owner's headline ask): a NON-BLOCKING, informational overlap disclaimer appended to a
 * choice's description when its `clashesWith` is non-empty — never prevents selection, purely
 * advisory (clash source: `planned skills/clash-map.json`, threaded through `skill.json`
 * `clashesWith` at import time).
 */
function clashDisclaimer(clashesWith: string[] | undefined): string {
  if (!clashesWith || clashesWith.length === 0) return "";
  const names = clashesWith.map(clashIdToDisplayName).join(", ");
  return ` ⚠ Overlaps with: ${names} — enable at your discretion.`;
}

/** D26: choice description = the skill's `skill.json` description, plus the clash disclaimer when applicable. Absent description + no clash -> `undefined` (no description shown). */
function choiceDescription(entry: SkillCatalogEntry): string | undefined {
  const base = entry.description ?? "";
  const disclaimer = clashDisclaimer(entry.clashesWith);
  const combined = `${base}${disclaimer}`.trim();
  return combined.length > 0 ? combined : undefined;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Pure planner for wizard step 5 (spec §7.1: "Select skills — navigable toggle list of all
 * skills the resolved packs provide; required skills are locked on", decisions.md D19/D21). One
 * choice per OFFERABLE `SkillCatalogEntry` (D21: adapter-ineligible default/optional skills are
 * OMITTED entirely, not shown disabled — a skill that can render for none of the selected
 * adapters produces zero output either way, so there is nothing meaningful to toggle; documented
 * choice, the brief allows either "disabled" or "omitted"). The label carries the tier + source
 * pack, PLUS a lock marker when `locked` names this skill (D21: enabled by `checked`/`locked`
 * being passed on a re-prompt round — see `selectSkills()`). Required entries are `disabled` +
 * pre-`checked` as before; a D21-locked default/optional entry gets the SAME disabled+checked
 * treatment (reusing the exact "locked on" combination already established for required tier),
 * labeled with WHICH enabled skill(s) require it. **D26:** a razor-pack skill not applicable to
 * `repoTypes` is omitted entirely (`isApplicableToRepoTypes()`, board decision d20) — same
 * "omitted, not disabled" posture as D21's adapter-ineligible filter. Every OFFERED choice's
 * `description` carries its `skill.json` description plus, when it declares `clashesWith`, the
 * non-blocking overlap disclaimer (D26, owner's headline ask).
 */
export function planSkillSelectionStep(
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
  checked?: Set<string>,
  locked?: Map<string, string[]>,
): SkillSelectionStepPlan {
  const byName = new Map(catalog.map((e) => [e.skill, e]));
  const offerable = catalog.filter(
    (e) => (e.enablement === "required" || isOfferable(e, byName, adapters)) && isApplicableToRepoTypes(e, repoTypes),
  );

  const choices: WizardChoice<string>[] = offerable.map((entry) => {
    const lockedBy = locked?.get(entry.skill) ?? [];
    const isLocked = entry.enablement === "required" || lockedBy.length > 0;
    const lockSuffix = entry.enablement !== "required" && lockedBy.length > 0 ? ` 🔒 required by ${lockedBy.join(", ")}` : "";
    return {
      value: entry.skill,
      name: `${entry.skill} [${entry.enablement}] (pack: ${entry.pack})${lockSuffix}`,
      description: choiceDescription(entry),
      checked: checked ? checked.has(entry.skill) : entry.enablement !== "optional",
      disabled: entry.enablement === "required" ? "required — always installed" : isLocked ? `🔒 required by ${lockedBy.join(", ")}` : false,
    };
  });
  return { choices };
}

/**
 * Thin prompt wrapper, extended by D21 into an ITERATIVE lock/release loop. `presetExcluded`/
 * `presetIncluded` — already-given `--exclude-skills`/`--include-skills` values — short-circuit
 * WITHOUT prompting (same "explicit flag wins" pattern every other wizard step follows): EITHER
 * flag being present (even as an empty array from an empty `--exclude-skills ""`) is enough to
 * skip the prompt entirely. Raw preset values are returned as-is; validation (unknown names,
 * excluding a required skill, D21's closure/adapter-gating checks) happens later, in
 * `core/skill-selection.ts`, at the SAME point the non-interactive CLI path validates — one
 * validator, not two.
 *
 * **D21 lock/release UX — why an ITERATIVE reprompt loop, not live per-keystroke locking.**
 * `@inquirer/prompts`' `checkbox()` is a single synchronous prompt call; there is no hook to
 * re-render the list's `disabled`/`checked` state WHILE the user is still interacting with one
 * call (no per-keystroke callback in the `WizardPrompts` interface, and none in the underlying
 * library either). So instead of live locking, this reuses `resolveSkillSelection()` — the exact
 * closure/lock engine `core/skill-selection.ts` already implements for the non-interactive path —
 * as a FIXED-POINT loop: show the checkbox with the currently-known locked/checked state, read
 * the user's answer, resolve it (deriving `excluded`/`included` from what the user left checked),
 * and if the resolved effective set differs from what was just submitted (a newly-pulled-in
 * dependency the user hadn't seen locked yet), show the checkbox AGAIN with the updated locked
 * rows and ask once more. In the common case (a dependent's `requires` are already default-tier,
 * already-checked skills the user never touched) this converges in exactly ONE round — the
 * dependency was already part of what the user submitted, nothing new to show. It only takes a
 * SECOND round when enabling a dependent pulls in an optional-tier dependency the user had not
 * separately checked (e.g. `grill-me` -> `grilling`, decisions.md D21's "dangling dependency"
 * example) or when a dependent stops being satisfied and its exclusive locks release.
 * `resolveSkillSelection()`'s `blockedExclusions` (an attempted uncheck of a still-required
 * default skill in the SAME round the dependent was checked) is corrected in place before
 * resolving again — the wizard never surfaces that as a hard error to the user, it just re-locks
 * the row, exactly what a live-updating UI would have prevented them from doing in the first
 * place. Capped at `MAX_LOCK_ROUNDS` as a defensive, never-expected-to-fire fallback (real/fixture
 * dependency graphs are small and acyclic by the time they reach this function — a cycle is
 * rejected by `core/skill-selection.ts` before the wizard ever gets this far via the non-
 * interactive path; the wizard itself never constructs a cyclic request since it always resolves
 * from a `checked` snapshot that was itself already a successfully-resolved closure).
 *
 * `repoTypes` (D26) applies the razor-layer applicability offer filter (board decision d20) — a
 * razor skill not applicable to the current project's repo type(s) never appears as a choice in
 * ANY round of this loop, same as an adapter-ineligible skill.
 */
export async function selectSkills(
  prompts: WizardPrompts,
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
  presetExcluded?: string[],
  presetIncluded?: string[],
): Promise<SkillSelectionDeltas> {
  if (presetExcluded !== undefined || presetIncluded !== undefined) {
    return { excluded: presetExcluded ?? [], included: presetIncluded ?? [] };
  }

  const byName = new Map(catalog.map((e) => [e.skill, e]));
  const offerable = catalog.filter(
    (e) => (e.enablement === "required" || isOfferable(e, byName, adapters)) && isApplicableToRepoTypes(e, repoTypes),
  );

  // Nothing togglable at all (every offerable skill is "required") -> skip the prompt entirely
  // rather than showing a checkbox where every choice is locked. Same "don't ask what has only
  // one possible answer" spirit as `confirmInstall()`'s `--yes` short-circuit.
  if (offerable.every((e) => e.enablement === "required")) {
    return { excluded: [], included: [] };
  }

  let checked = new Set(offerable.filter((e) => e.enablement !== "optional").map((e) => e.skill));
  let locked = new Map<string, string[]>();
  let lastExcludedGuess: string[] = [];
  let lastIncludedGuess: string[] = [];

  for (let round = 0; round < MAX_LOCK_ROUNDS; round++) {
    const plan = planSkillSelectionStep(catalog, adapters, repoTypes, checked, locked);
    const answer = await prompts.checkbox(
      "Select skills to install (required/locked skills cannot be toggled; toggle defaults off or optionals on):",
      plan.choices,
    );
    const answerSet = new Set(answer);

    let excludedGuess = offerable.filter((e) => e.enablement === "default" && !answerSet.has(e.skill)).map((e) => e.skill);
    const includedGuess = offerable.filter((e) => e.enablement === "optional" && answerSet.has(e.skill)).map((e) => e.skill);

    let resolved = resolveSkillSelection({ catalog, excluded: excludedGuess, included: includedGuess, adapters, repoTypes });
    if (resolved.blockedExclusions.length > 0) {
      // The user tried (in this same round) to uncheck a default that a dependent they also just
      // checked still requires — a live-updating UI would never have let them; re-lock it instead
      // of surfacing a hard error, then resolve again.
      excludedGuess = excludedGuess.filter((n) => !resolved.blockedExclusions.includes(n));
      resolved = resolveSkillSelection({ catalog, excluded: excludedGuess, included: includedGuess, adapters, repoTypes });
    }

    lastExcludedGuess = excludedGuess;
    lastIncludedGuess = resolved.ok ? resolved.deltas.included : includedGuess;

    // Defensive fallback (should not happen against offerable-filtered, previously-resolved input
    // — see this function's doc comment): keep the prior round's state rather than crash.
    const nextChecked = resolved.ok ? resolved.effective : checked;
    const nextLocked = new Map<string, string[]>();
    for (const [dep, dependents] of resolved.requiredBy) {
      if (dependents.length > 0) nextLocked.set(dep, dependents);
    }

    const stable = setEquals(nextChecked, answerSet);
    checked = nextChecked;
    locked = nextLocked;

    if (stable) {
      return { excluded: lastExcludedGuess, included: lastIncludedGuess };
    }
  }

  return { excluded: lastExcludedGuess, included: lastIncludedGuess };
}
