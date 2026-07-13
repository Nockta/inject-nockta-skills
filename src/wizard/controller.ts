import type { SkillCatalogEntry } from "../packs/skill-catalog.js";
import type { AdapterType } from "../types/adapter.js";
import { ADAPTER_TYPES } from "../types/adapter.js";
import type { RepoType } from "../types/repo-type.js";
import type { ParsedTarget } from "../core/parse-targets.js";
import type { RepoTypeGuess } from "../core/detect-repo-type.js";
import type { WorkspaceCandidate } from "./steps/select-targets.js";
import {
  buildAdapterStep,
  buildConfirmStep,
  buildRazorStep,
  buildRepoTypeStep,
  buildSkillsStep,
  buildTargetsStep,
} from "./core/build-schema.js";
import { isRazorEntry, offerableEntries } from "./core/skill-offering.js";
import { resolveSkillLayerRound } from "./core/resolve.js";
import type { StepId, WizardAnswers } from "./core/types.js";
import type { Presenter } from "./view/presenter.js";

/**
 * The back-aware Controller (decisions.md D28). Owns the step index and back-navigation; drives
 * Model <-> View. It depends ONLY on the abstract `Presenter` — never on `@inquirer/*` — so the
 * CLI and a future web View are interchangeable. It never writes files: it produces a plain,
 * serializable `WizardAnswers` object that `resolve()` turns into an `InstallPlan`.
 *
 * Flow (indexed step-loop, D28): steps live in an array; the loop holds `{ index, answers }`. Each
 * step renders via the View with current answers as presets; a step returns EITHER an answer
 * (advance to the next non-skipped step) OR a BACK signal (retreat to the previous non-skipped
 * step, PRESERVING already-entered answers so re-entering a prior step shows the prior choice).
 * Preset steps (D29 — `--type`/`--adapters`/`--exclude-skills`/... already supplied) are marked
 * skipped, so they are neither prompted nor visited by back-nav.
 */

export type CatalogFactory = (repoTypes: RepoType[]) => SkillCatalogEntry[];

export interface ControllerContext {
  monorepo: boolean;
  /** Detection guesses for the single-project repo-type step. */
  guesses: RepoTypeGuess[];
  /** Discovered candidates for the monorepo targets step. */
  candidates: WorkspaceCandidate[];
  /** Builds the resolved skill catalog for a set of repo types (reads packs; memoized by the Controller). */
  buildCatalog: CatalogFactory;
  /** Optional install-preview text for the confirm step's preamble (pure narration; no I/O beyond a scratch render). */
  previewText?: (answers: WizardAnswers) => string;
}

export type ControllerResult =
  | { kind: "completed"; answers: WizardAnswers }
  | { kind: "cancelled"; reason: string };

type StepOutcome = { kind: "next" } | { kind: "back" } | { kind: "cancel"; reason: string };

const AVAILABLE_ADAPTERS: readonly AdapterType[] = ["claude", "cursor", "copilot", "agent"];

/** The repo types in play for skill resolution: single-project uses `repoTypes`; monorepo the union of target types. */
function effectiveRepoTypes(answers: WizardAnswers): RepoType[] {
  if (answers.monorepo) return [...new Set((answers.targets ?? []).flatMap((t) => t.types))];
  return answers.repoTypes ?? [];
}

function setEquals(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Default checked set for a skill layer: required + default checked, optionals off. */
function defaultChecked(entries: SkillCatalogEntry[]): Set<string> {
  return new Set(entries.filter((e) => e.enablement !== "optional").map((e) => e.skill));
}

/** Reconstruct the checked set from a prior layer answer (for back re-entry): required+default minus excluded, plus included. */
function checkedFromDeltas(entries: SkillCatalogEntry[], deltas: { excluded: string[]; included: string[] }): Set<string> {
  const excluded = new Set(deltas.excluded);
  const included = new Set(deltas.included);
  const checked = new Set<string>();
  for (const e of entries) {
    if (e.enablement === "required") checked.add(e.skill);
    else if (e.enablement === "default" && !excluded.has(e.skill)) checked.add(e.skill);
    else if (e.enablement === "optional" && included.has(e.skill)) checked.add(e.skill);
  }
  return checked;
}

export interface RunControllerOptions {
  presenter: Presenter;
  ctx: ControllerContext;
  /** Pre-seeded answers from CLI flags (D29). */
  answers: WizardAnswers;
  /** Step ids pre-answered by flags and therefore skipped entirely (never prompted, never visited by back). */
  presetSteps: Set<StepId>;
}

export async function runWizardController(options: RunControllerOptions): Promise<ControllerResult> {
  const { presenter, ctx } = options;
  const answers: WizardAnswers = { ...options.answers, monorepo: ctx.monorepo };

  // Memoize catalog reads by repo-type key so nav (skip checks + step builds) never re-reads packs redundantly.
  const catalogCache = new Map<string, SkillCatalogEntry[]>();
  const catalogFor = (repoTypes: RepoType[]): SkillCatalogEntry[] => {
    const key = [...repoTypes].sort().join(",");
    let cached = catalogCache.get(key);
    if (!cached) {
      cached = ctx.buildCatalog(repoTypes);
      catalogCache.set(key, cached);
    }
    return cached;
  };

  const layerEntriesFor = (layer: "skills" | "razor", answersNow: WizardAnswers): SkillCatalogEntry[] => {
    const repoTypes = effectiveRepoTypes(answersNow);
    const adapters = answersNow.adapters ?? [];
    const offerable = offerableEntries(catalogFor(repoTypes), adapters, repoTypes);
    return layer === "razor" ? offerable.filter(isRazorEntry) : offerable.filter((e) => !isRazorEntry(e));
  };

  // The ordered step spine for this branch.
  const stepIds: StepId[] = ctx.monorepo
    ? ["targets", "adapters", "skills", "razor", "confirm"]
    : ["repo-type", "adapters", "skills", "razor", "confirm"];

  const isSkipped = (id: StepId): boolean => {
    if (options.presetSteps.has(id)) return true;
    if (id === "skills") {
      const general = layerEntriesFor("skills", answers);
      // Nothing togglable (every offerable general skill is required) -> skip, same spirit as the old flow.
      return general.length === 0 || general.every((e) => e.enablement === "required");
    }
    if (id === "razor") return layerEntriesFor("razor", answers).length === 0;
    return false;
  };

  const nextIndex = (from: number): number => {
    for (let i = from; i < stepIds.length; i++) if (!isSkipped(stepIds[i]!)) return i;
    return stepIds.length;
  };
  const prevIndex = (from: number): number => {
    for (let i = from; i >= 0; i--) if (!isSkipped(stepIds[i]!)) return i;
    return -1;
  };

  let index = nextIndex(0);
  while (index < stepIds.length) {
    const id = stepIds[index]!;
    const outcome = await runStep(id, presenter, ctx, answers, {
      catalogFor,
      layerEntriesFor,
    });
    if (outcome.kind === "cancel") return { kind: "cancelled", reason: outcome.reason };
    if (outcome.kind === "back") {
      const prev = prevIndex(index - 1);
      index = prev < 0 ? index : prev; // at the first step, back is a no-op (re-render).
    } else {
      index = nextIndex(index + 1);
    }
  }

  return { kind: "completed", answers };
}

interface StepHelpers {
  catalogFor: (repoTypes: RepoType[]) => SkillCatalogEntry[];
  layerEntriesFor: (layer: "skills" | "razor", answers: WizardAnswers) => SkillCatalogEntry[];
}

async function runStep(
  id: StepId,
  presenter: Presenter,
  ctx: ControllerContext,
  answers: WizardAnswers,
  helpers: StepHelpers,
): Promise<StepOutcome> {
  switch (id) {
    case "repo-type": {
      const step = buildRepoTypeStep(ctx.guesses);
      // Reflect any prior answer (back re-entry) as the checked defaults.
      if (answers.repoTypes) for (const c of step.choices ?? []) c.checked = answers.repoTypes.includes(c.value as RepoType);
      presenter.clear();
      const res = await presenter.renderStep(step);
      if (res.kind === "back") return { kind: "back" };
      const chosen = res.value as RepoType[];
      if (chosen.length === 0) return { kind: "cancel", reason: "no project type was selected" };
      answers.repoTypes = chosen;
      return { kind: "next" };
    }
    case "targets": {
      const step = buildTargetsStep(ctx.candidates);
      presenter.clear();
      const res = await presenter.renderStep(step, answers.targets);
      if (res.kind === "back") return { kind: "back" };
      const targets = res.value as ParsedTarget[];
      if (targets.length === 0) return { kind: "cancel", reason: "no monorepo targets were selected" };
      answers.targets = targets;
      return { kind: "next" };
    }
    case "adapters": {
      const step = buildAdapterStep();
      const prior = answers.adapters;
      if (prior) for (const c of step.choices ?? []) c.checked = prior.includes(c.value as AdapterType);
      presenter.clear();
      const res = await presenter.renderStep(step);
      if (res.kind === "back") return { kind: "back" };
      let chosen = res.value as AdapterType[];
      if (chosen.length === 0) chosen = [...AVAILABLE_ADAPTERS]; // empty pick -> sensible default (all available).
      answers.adapters = chosen;
      return { kind: "next" };
    }
    case "skills":
    case "razor": {
      return runSkillStep(id, presenter, answers, helpers);
    }
    case "confirm": {
      const step = buildConfirmStep(ctx.previewText?.(answers));
      if (answers.confirmed !== undefined) step.confirmDefault = answers.confirmed;
      presenter.clear();
      const res = await presenter.renderStep(step);
      if (res.kind === "back") return { kind: "back" };
      answers.confirmed = res.value as boolean;
      return { kind: "next" };
    }
    default:
      return { kind: "next" };
  }
}

/** A skill layer step (general or razor) with the D21 lock/release fixed-point re-render loop, driven Controller-side. */
async function runSkillStep(
  layer: "skills" | "razor",
  presenter: Presenter,
  answers: WizardAnswers,
  helpers: StepHelpers,
): Promise<StepOutcome> {
  const MAX_ROUNDS = 8;
  const repoTypes = effectiveRepoTypes(answers);
  const adapters = answers.adapters ?? [];
  const catalog = helpers.catalogFor(repoTypes);
  const layerEntries = helpers.layerEntriesFor(layer, answers);

  const prior = answers[layer];
  const layerValues = new Set(layerEntries.map((e) => e.skill));
  let checked = prior ? checkedFromDeltas(layerEntries, prior) : defaultChecked(layerEntries);
  let locked = new Map<string, string[]>();
  let lastDeltas = { excluded: [] as string[], included: [] as string[] };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const model =
      layer === "razor"
        ? buildRazorStep(catalog, adapters, repoTypes, checked, locked)!
        : buildSkillsStep(catalog, adapters, repoTypes, checked, locked);
    presenter.clear();
    const res = await presenter.renderStep(model);
    if (res.kind === "back") return { kind: "back" };

    // Restrict to this layer's offerable values — a robust presenter only returns those, but a
    // preset/scripted answer might carry names from another layer, which must not perturb the loop.
    const answerSet = new Set((res.value as string[]).filter((v) => layerValues.has(v)));
    const roundResult = resolveSkillLayerRound(catalog, adapters, repoTypes, layerEntries, answerSet);
    lastDeltas = roundResult.deltas;

    if (setEquals(roundResult.nextChecked, answerSet)) {
      answers[layer] = lastDeltas;
      return { kind: "next" };
    }
    checked = roundResult.nextChecked;
    locked = roundResult.nextLocked;
  }
  answers[layer] = lastDeltas;
  return { kind: "next" };
}
