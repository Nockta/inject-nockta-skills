import type { RepoType } from "../../types/repo-type.js";
import type { AdapterType } from "../../types/adapter.js";
import type { ParsedTarget } from "../../core/parse-targets.js";
import type { SkillSelectionDeltas } from "../../types/skill-selection.js";

/**
 * The wizard-core Model's serializable vocabulary (decisions.md D28's MVC boundary).
 *
 * EVERY type in this file is plain JSON — no closures, class instances, Symbols, Maps, or Sets —
 * because two future consumers depend on it being wire-safe:
 *   1. the deferred web presenter (D28): inject emits a `WizardSchema` describing its steps, and a
 *      web page hosts them as a second View;
 *   2. the create->inject handoff (D28/D29): create fetches that same schema to drive inject's
 *      steps inside its own page, then POSTs back a `WizardAnswers` object.
 * The CLI presenter renders from the SAME `StepModel` objects `buildWizardSchema()` emits — one
 * brain, two Views (see `core/build-schema.ts`).
 */

/** Stable step identifiers — the ordered spine of the wizard. */
export type StepId = "repo-type" | "targets" | "adapters" | "skills" | "razor" | "confirm";

/**
 * How a step is presented. `paginated-multiselect` is the custom finite/paged skill+razor prompt
 * (D28); `multiselect` the themed repo-type/adapter checkbox; `confirm` the final yes/no;
 * `targets` the monorepo target-collection sub-flow (candidate pick + per-target type).
 */
export type StepKind = "multiselect" | "paginated-multiselect" | "confirm" | "targets";

export type SkillTier = "required" | "default" | "optional";

/** One selectable row. User-facing strings (`label`, `disabledReason`, `description`) carry NO dev-speak (D28). */
export interface ChoiceModel {
  value: string;
  /** Clean, user-facing name — never a `foo [default] (pack: x)` dev-speak label. */
  label: string;
  /**
   * Optional friendly display title, distinct from the raw enum `value` (repo-type/adapter rows,
   * this pass — see `REPO_TYPE_TITLES`/`ADAPTER_TITLES`). Currently always equal to `label` — both
   * are set together so the CLI View (`label`) and the `--web` page (`title ?? label ?? value`)
   * render the same friendly name without either surface special-casing the other. Skill/razor
   * rows leave this unset (their `label` is already the clean skill name).
   */
  title?: string;
  description?: string;
  /** Present for skill/razor rows; absent for repo-type/adapter rows. */
  tier?: SkillTier;
  /** Source pack (skill/razor rows only). Always the skill's REAL owning pack (e.g. "razor") — never repurposed as a grouping key; see `section` for that. */
  pack?: string;
  /**
   * The grouping key a presenter matches against `SectionModel.key` to place this row under its
   * header. Falls back to `pack` when absent (every pre-category step — general skills stay
   * pack-grouped). The razor step sets this to the skill's `category` instead of its pack, since
   * every razor skill shares one pack — see `wizard/core/build-schema.ts`'s `buildRazorStep`.
   */
  section?: string;
  /** Default checked state when the step is first entered (before any user toggle). */
  checked: boolean;
  /** A locked/required row: cannot be toggled. */
  disabled: boolean;
  /** Why it is locked, in plain language (e.g. "always installed", "needed by <skill>"). */
  disabledReason?: string;
  /** Display names of skills this one overlaps with (advisory only, never blocks selection). */
  clashesWith?: string[];
}

/** A non-selectable section header grouping a run of `ChoiceModel`s (by pack, or — the razor step — by category). */
export interface SectionModel {
  /** Pack id the section covers (kept for the general/pack-grouped steps and display back-compat). */
  pack: string;
  /**
   * The grouping key rows match via `ChoiceModel.section` (falls back to `pack` when absent — the
   * general skills step's pack-only grouping, unchanged). The razor step sets this to a category
   * id (e.g. "nextjs") — distinct from `pack`, which stays the razor skills' real, single pack.
   */
  key?: string;
  /** Rendered header label (e.g. "Common", "shopify-theme", "Domain: Next.js"). */
  label: string;
}

/** One fully-resolved, serializable step the presenter renders. */
export interface StepModel {
  id: StepId;
  kind: StepKind;
  /** User-facing prompt title. */
  title: string;
  /** Selectable rows (in section order for paginated steps). Absent for `confirm`. */
  choices?: ChoiceModel[];
  /** Ordered pack sections for paginated steps — a header precedes each pack's run of choices. */
  sections?: SectionModel[];
  /** Items per page for `paginated-multiselect` (finite, no wrap). */
  pageSize?: number;
  /** Default answer for a `confirm` step. */
  confirmDefault?: boolean;
  /** Optional pre-rendered text shown above the step (today: the install preview above `confirm`). Plain string, so a web View can show it too. */
  preamble?: string;
}

/**
 * The full serialized Model create fetches for web mode (D28). Ordered `steps`, each with its
 * choices/state already resolved for the given repo type(s) + adapters. Plain JSON end to end.
 */
export interface WizardSchema {
  monorepo: boolean;
  repoTypes: RepoType[];
  adapters: AdapterType[];
  steps: StepModel[];
}

/**
 * The accumulating answer object the Controller threads through the step loop — and the exact
 * shape a web page POSTs back (D28 seam #2). Strictly JSON round-trippable: `ParsedTarget`,
 * `SkillSelectionDeltas`, and the primitive arrays are all plain objects/arrays. `resolve()`
 * consumes THIS shape (D28 seam #4).
 */
export interface WizardAnswers {
  monorepo: boolean;
  /** Single-project branch: the chosen repo type(s). */
  repoTypes?: RepoType[];
  /** Monorepo branch: the chosen targets (each `{ path, types }`, plain). */
  targets?: ParsedTarget[];
  adapters?: AdapterType[];
  /** General (non-razor) skill deltas off the tier defaults. */
  skills?: SkillSelectionDeltas;
  /** Razor-layer skill deltas (all optional; `included` = chosen razor skills). */
  razor?: SkillSelectionDeltas;
  confirmed?: boolean;
}

/**
 * The plan `resolve(answers)` yields — the plain option object `buildInstallResult()` executes
 * (D28 seam #4). Deliberately NOT the InstallResult itself: `resolve()` stays pure/serializable
 * and does no I/O; the web flow is literally `answers -> resolve() -> buildInstallResult(plan)`.
 * `type` XOR `targets` mirrors the single-project vs. monorepo branch.
 */
export interface InstallPlan {
  /** Single-project: comma-joined repo types. */
  type?: string;
  /** Monorepo: `["<path>:<type>[+<type>...]", ...]`. */
  targets?: string[];
  monorepo?: boolean;
  /** Comma-joined adapters. */
  adapters: string;
  /** Merged deselected-default skill names (general layer only — razor has no defaults). */
  excludeSkills: string[];
  /** Merged selected-optional skill names (general optionals + chosen razor skills). */
  includeSkills: string[];
}
