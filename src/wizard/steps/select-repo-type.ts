import { REPO_TYPES, parseRepoTypesList } from "../../types/repo-type.js";
import type { RepoType } from "../../types/repo-type.js";
import type { RepoTypeGuess } from "../../core/detect-repo-type.js";
import type { WizardChoice, WizardPrompts } from "../prompts.js";

export interface RepoTypeStepPlan {
  /** Every guessed type, ranked — pre-checked in the checkbox list (the "single-detected-type fast path": one guess -> one item pre-checked, confirm and move on). Empty when detection found nothing (spec: "unknown"). */
  preChecked: RepoType[];
  choices: WizardChoice<RepoType>[];
  topGuess: RepoTypeGuess | null;
}

/**
 * Pure planner for the wizard's type step (spec §7.1: "Detect project type(s)" then "Confirm or
 * select project type(s)", decisions.md D22 — multi-select, generalizes the pre-D22 single-select
 * version) — turns `detectRepoType()`/`detectRepoTypeAcrossWorkspace()`'s ranked guesses into a
 * checkbox-prompt plan. Takes `guesses` rather than a `targetDir` so it never touches the
 * filesystem itself and is trivially unit-testable with synthetic guess lists (including the "no
 * guesses at all" unknown case, and the D22 "multiple guesses ranked" case).
 */
export function planRepoTypeStep(guesses: RepoTypeGuess[]): RepoTypeStepPlan {
  const topGuess = guesses[0] ?? null;
  const preChecked = guesses.map((g) => g.type);
  const choices: WizardChoice<RepoType>[] = REPO_TYPES.map((type) => {
    const guess = guesses.find((g) => g.type === type);
    return {
      value: type,
      name: guess ? `${type} (detected — ${Math.round(guess.confidence * 100)}% confidence)` : type,
      description: guess ? guess.evidence.join("; ") : undefined,
      checked: Boolean(guess),
    };
  });
  return { preChecked, choices, topGuess };
}

/**
 * Thin prompt wrapper around `planRepoTypeStep()` — MULTI-select checkbox (decisions.md D22): the
 * user confirms/adds/removes detected candidates, result is `repoTypes: RepoType[]`. `preset` —
 * an explicit `--type` value already given on the CLI, comma-separated for multiple types (D22)
 * — short-circuits WITHOUT prompting when every named type is valid, and WITHOUT even consulting
 * `guesses`: this is the concrete mechanism behind "heuristic detection never overrides an
 * explicit --type" (brief item 1, generalized to N types) — detection is not merely out-voted, it
 * is never in the loop at all when `--type` was given. A partially-or-fully invalid preset falls
 * through to prompting (never silently drops a user-named type or silently ignores a typo) —
 * same posture the old single-select preset short-circuit had for an unknown type.
 */
export async function selectRepoTypes(prompts: WizardPrompts, guesses: RepoTypeGuess[], preset?: string): Promise<RepoType[]> {
  if (preset) {
    const parsed = parseRepoTypesList(preset, ",");
    if (parsed.ok) return parsed.types;
  }

  const plan = planRepoTypeStep(guesses);
  const message = plan.topGuess
    ? `Detected likely project type(s): ${plan.preChecked.join(", ")} (${plan.topGuess.evidence.join("; ")}). Confirm, add, or remove types:`
    : "Could not confidently detect a project type from this directory. Select one or more:";
  return prompts.checkbox(message, plan.choices);
}
