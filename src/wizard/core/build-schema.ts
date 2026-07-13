import type { SkillCatalogEntry } from "../../packs/skill-catalog.js";
import type { AdapterType } from "../../types/adapter.js";
import type { RepoType } from "../../types/repo-type.js";
import { REPO_TYPES, REPO_TYPE_TITLES, REPO_TYPE_DESCRIPTIONS } from "../../types/repo-type.js";
import { ADAPTER_TYPES, ADAPTER_TITLES, ADAPTER_DESCRIPTIONS } from "../../types/adapter.js";
import type { RepoTypeGuess } from "../../core/detect-repo-type.js";
import type { WorkspaceCandidate } from "../steps/select-targets.js";
import { clashIdToDisplayName, isRazorEntry, offerableEntries } from "./skill-offering.js";
import { resolveSkillLayerRound } from "./resolve.js";
import type { ChoiceModel, SectionModel, StepModel, WizardSchema } from "./types.js";

/**
 * The wizard-core Model builder (decisions.md D28). Produces the SAME serializable `StepModel`
 * objects the CLI presenter renders AND that create fetches for web mode — one brain, two Views.
 * Nothing here prompts or touches a terminal; every function is pure and returns plain JSON.
 *
 * The skill/razor choice computation (tiers, dependency locks, clash pairs, razor applicability)
 * lives here in the core, NOT in the prompt code (D28's headline architecture requirement).
 */

/** Adapters with a real renderer (kept in sync by hand with `core/render-adapters.ts`, per D24/D35). */
const AVAILABLE_ADAPTERS: readonly AdapterType[] = ["claude", "cursor", "copilot", "agent", "antigravity"];

/** Default items per page for the paginated skill/razor steps (finite, no wrap — D28). Owner asked for up to 20/page. */
export const SKILL_PAGE_SIZE = 20;

/** Humanize a pack id into a section header label. `common` -> "Common"; stack packs stay as-is. */
export function packSectionLabel(pack: string): string {
  if (pack === "common") return "Common";
  return pack;
}

/**
 * Order packs for the general skill step: `common` first, then stack packs in catalog encounter
 * order. Razor is never here (its own step). This is D28's "sectioned/ordered by pack — no
 * lumping".
 */
function orderedPacks(entries: SkillCatalogEntry[]): string[] {
  const seen = new Set<string>();
  const packs: string[] = [];
  for (const e of entries) {
    if (!seen.has(e.pack)) {
      seen.add(e.pack);
      packs.push(e.pack);
    }
  }
  return packs.sort((a, b) => (a === "common" ? -1 : b === "common" ? 1 : 0));
}

/**
 * Fixed razor-category order + display labels — the razor step's section spine, principles first
 * then the domain-specific ones (task brief's ordering). Any razor skill whose `category` is
 * absent OR not one of these 12 known values falls into the trailing `"other"` bucket (see
 * `razorCategoryKey`) rather than crashing — defensive against a typo/future value on disk.
 */
const RAZOR_CATEGORY_ORDER: readonly string[] = [
  "core",
  "architecture",
  "security",
  "testing",
  "delivery",
  "data",
  "realtime",
  "tooling",
  "react",
  "nextjs",
  "nestjs",
  "shopify",
];

const RAZOR_OTHER_CATEGORY = "other";

const RAZOR_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  core: "Core",
  architecture: "Architecture",
  security: "Security",
  testing: "Testing",
  delivery: "Delivery",
  data: "Data",
  realtime: "Realtime",
  tooling: "Tooling",
  react: "Domain: React",
  nextjs: "Domain: Next.js",
  nestjs: "Domain: NestJS",
  shopify: "Domain: Shopify",
  [RAZOR_OTHER_CATEGORY]: "Other",
};

/** The section-grouping key for a razor entry: its `category` when it's one of the 12 known values, else `"other"`. */
function razorCategoryKey(entry: SkillCatalogEntry): string {
  const category = entry.category;
  return category && RAZOR_CATEGORY_ORDER.includes(category) ? category : RAZOR_OTHER_CATEGORY;
}

/**
 * The razor step's section order for a set of razor entries: the fixed 12-category spine, filtered
 * down to categories actually present (an empty category is simply omitted — no empty section),
 * with `"other"` appended last only if some entry needed it.
 */
function orderedRazorCategories(entries: SkillCatalogEntry[]): string[] {
  const present = new Set(entries.map(razorCategoryKey));
  const ordered = RAZOR_CATEGORY_ORDER.filter((c) => present.has(c));
  if (present.has(RAZOR_OTHER_CATEGORY)) ordered.push(RAZOR_OTHER_CATEGORY);
  return ordered;
}

/**
 * Structured, presenter-agnostic choice rows for a set of skill entries (clean labels, no
 * dev-speak). `grouping` is optional and defaults to pack-based grouping (the general skills
 * step's existing behavior, untouched); the razor step passes category-based grouping instead —
 * see `buildRazorStep`. Either way `choice.pack` stays the entry's REAL pack (never repurposed as
 * the grouping key); `choice.section` carries whichever key is actually used for placement.
 */
export function buildSkillChoiceModels(
  entries: SkillCatalogEntry[],
  checked: ReadonlySet<string> | undefined,
  locked: ReadonlyMap<string, string[]> | undefined,
  grouping?: { sectionKeyOf: (entry: SkillCatalogEntry) => string; sectionOrder: string[] },
): ChoiceModel[] {
  const sectionKeyOf = grouping?.sectionKeyOf ?? ((e: SkillCatalogEntry) => e.pack);
  const sectionOrder = grouping?.sectionOrder ?? orderedPacks(entries);
  const bySectionIndex = (key: string): number => {
    const i = sectionOrder.indexOf(key);
    return i < 0 ? sectionOrder.length : i;
  };
  const ordered = [...entries].sort((a, b) => bySectionIndex(sectionKeyOf(a)) - bySectionIndex(sectionKeyOf(b)));

  return ordered.map((entry) => {
    const lockedBy = locked?.get(entry.skill) ?? [];
    const isRequired = entry.enablement === "required";
    const isLocked = isRequired || lockedBy.length > 0;
    const clashes = (entry.clashesWith ?? []).map(clashIdToDisplayName);
    const choice: ChoiceModel = {
      value: entry.skill,
      label: entry.skill,
      tier: entry.enablement,
      pack: entry.pack,
      section: sectionKeyOf(entry),
      checked: checked ? checked.has(entry.skill) : entry.enablement !== "optional",
      disabled: isLocked,
    };
    if (entry.description) choice.description = entry.description;
    if (clashes.length > 0) choice.clashesWith = clashes;
    if (isRequired) choice.disabledReason = "always installed";
    else if (lockedBy.length > 0) choice.disabledReason = `needed by ${lockedBy.join(", ")}`;
    return choice;
  });
}

/** Ordered pack sections for a set of skill entries (the general skills step — pack-grouped). */
export function buildSkillSections(entries: SkillCatalogEntry[]): SectionModel[] {
  return orderedPacks(entries).map((pack) => ({ pack, label: packSectionLabel(pack) }));
}

/**
 * Ordered CATEGORY sections for a set of razor entries (task brief's fixed spine — principles
 * first, then `Domain: *`). `pack` stays `"razor"` (the entries' real, single pack — never
 * repurposed); `key` is the actual category grouping id the presenter matches choices against.
 */
export function buildRazorSections(entries: SkillCatalogEntry[]): SectionModel[] {
  return orderedRazorCategories(entries).map((category) => ({
    pack: "razor",
    key: category,
    label: RAZOR_CATEGORY_LABELS[category] ?? "Other",
  }));
}

/** The general (non-razor) skill step. Sectioned by pack; razor excluded entirely (D28). */
export function buildSkillsStep(
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
  checked?: ReadonlySet<string>,
  locked?: ReadonlyMap<string, string[]>,
): StepModel {
  const general = offerableEntries(catalog, adapters, repoTypes).filter((e) => !isRazorEntry(e));
  return {
    id: "skills",
    kind: "paginated-multiselect",
    title: "Choose the skills to install",
    choices: buildSkillChoiceModels(general, checked, locked),
    sections: buildSkillSections(general),
    pageSize: SKILL_PAGE_SIZE,
  };
}

/**
 * The razor step — its OWN step, applicability-filtered (D28), sectioned by CATEGORY rather than
 * pack (every razor skill shares the one `razor` pack, so pack-grouping collapsed it into a single
 * flat section — see this file's `razorCategoryKey`/`orderedRazorCategories`). Returns `null` when
 * no razor skill is offerable for these repo type(s)/adapters, so the Controller skips it entirely
 * (no empty step).
 */
export function buildRazorStep(
  catalog: SkillCatalogEntry[],
  adapters: AdapterType[],
  repoTypes: RepoType[],
  checked?: ReadonlySet<string>,
  locked?: ReadonlyMap<string, string[]>,
): StepModel | null {
  const razor = offerableEntries(catalog, adapters, repoTypes).filter(isRazorEntry);
  if (razor.length === 0) return null;
  const sectionOrder = orderedRazorCategories(razor);
  return {
    id: "razor",
    kind: "paginated-multiselect",
    title: "Choose Razor engineering-doctrine skills (all optional)",
    choices: buildSkillChoiceModels(razor, checked, locked, { sectionKeyOf: razorCategoryKey, sectionOrder }),
    sections: buildRazorSections(razor),
    pageSize: SKILL_PAGE_SIZE,
  };
}

/**
 * The single-project repo-type step (multi-select). Each choice's `label`/`title` is the friendly
 * display name from `REPO_TYPE_TITLES` (the raw `RepoType` enum stays in `value` — routing/resolve
 * key off that, unchanged). `description` is always the consumer-facing one-liner from
 * `REPO_TYPE_DESCRIPTIONS`, with the detection evidence appended when this type was guessed.
 */
export function buildRepoTypeStep(guesses: RepoTypeGuess[]): StepModel {
  const choices: ChoiceModel[] = REPO_TYPES.map((type) => {
    const guess = guesses.find((g) => g.type === type);
    const title = REPO_TYPE_TITLES[type];
    const choice: ChoiceModel = {
      value: type,
      label: title,
      title,
      checked: Boolean(guess),
      disabled: false,
      description: REPO_TYPE_DESCRIPTIONS[type],
    };
    if (guess) {
      choice.description = `${REPO_TYPE_DESCRIPTIONS[type]} Detected (${Math.round(guess.confidence * 100)}%): ${guess.evidence.join("; ")}`;
    }
    return choice;
  });
  const detected = guesses.map((g) => g.type);
  return {
    id: "repo-type",
    kind: "multiselect",
    title:
      detected.length > 0
        ? `Confirm the project type(s) — detected: ${detected.join(", ")}`
        : "Select the project type(s)",
    choices,
  };
}

/**
 * The adapters step (multi-select). Each choice's `label`/`title` is the friendly display name
 * from `ADAPTER_TITLES` (the raw `AdapterType` enum stays in `value` — routing/resolve/render
 * dispatch key off that, unchanged); `description` is the consumer-facing one-liner from
 * `ADAPTER_DESCRIPTIONS`.
 */
export function buildAdapterStep(): StepModel {
  const choices: ChoiceModel[] = ADAPTER_TYPES.map((adapter) => {
    const available = (AVAILABLE_ADAPTERS as readonly string[]).includes(adapter);
    const title = ADAPTER_TITLES[adapter];
    const displayTitle = available ? title : `${title} (coming soon)`;
    const choice: ChoiceModel = {
      value: adapter,
      label: displayTitle,
      title: displayTitle,
      checked: available,
      disabled: !available,
    };
    if (!available) choice.disabledReason = "not available yet";
    if (ADAPTER_DESCRIPTIONS[adapter]) choice.description = ADAPTER_DESCRIPTIONS[adapter];
    return choice;
  });
  return { id: "adapters", kind: "multiselect", title: "Choose which agent tools to set up", choices };
}

/** The monorepo target-collection step (candidate pick + per-target type is handled by the presenter). */
export function buildTargetsStep(candidates: WorkspaceCandidate[]): StepModel {
  const choices: ChoiceModel[] = candidates.map((c) => {
    const top = c.guesses[0];
    const choice: ChoiceModel = { value: c.path, label: c.path, checked: false, disabled: false };
    if (top) choice.description = `Looks like ${top.type} (${Math.round(top.confidence * 100)}%)`;
    return choice;
  });
  return { id: "targets", kind: "targets", title: "Select the workspace packages to set up", choices };
}

/** The final confirm step. `preamble` (optional) carries the install preview shown above the prompt. */
export function buildConfirmStep(preamble?: string): StepModel {
  const step: StepModel = { id: "confirm", kind: "confirm", title: "Write these files now?", confirmDefault: true };
  if (preamble) step.preamble = preamble;
  return step;
}

export interface WizardSchemaContext {
  monorepo: boolean;
  repoTypes: RepoType[];
  adapters: AdapterType[];
  /** Full resolved skill catalog for `repoTypes` (from `resolvePacks()` + `buildSkillCatalog()`). */
  catalog: SkillCatalogEntry[];
  /** Optional detection guesses for the repo-type step (single-project). */
  guesses?: RepoTypeGuess[];
  /** Optional discovered candidates for the monorepo targets step. */
  candidates?: WorkspaceCandidate[];
  /**
   * Web-flow skill selection deltas off the tier defaults — the page's CURRENT checked state,
   * threaded so the skills/razor steps resolve their dependency locks against THAT (e.g. `grill-me`
   * toggled off → `grilling` released) via the shared `resolveSkillLayerRound`. Absent → pure tier
   * defaults (first paint / `--emit-schema`).
   */
  excludeSkills?: string[];
  includeSkills?: string[];
}

/**
 * The fully serializable Model create fetches for web mode (D28 seam #3). Ordered steps, each
 * with its choices/state resolved for the given repo type(s) + adapters. Round-trips through JSON
 * (no Maps/Sets/closures). The razor step is omitted when no razor skill applies; the head step is
 * `targets` for a monorepo, `repo-type` otherwise.
 */
export function buildWizardSchema(ctx: WizardSchemaContext): WizardSchema {
  const steps: StepModel[] = [];
  if (ctx.monorepo) {
    steps.push(buildTargetsStep(ctx.candidates ?? []));
  } else {
    steps.push(buildRepoTypeStep(ctx.guesses ?? []));
  }
  steps.push(buildAdapterStep());

  // Resolve each skill LAYER's dependency closure through the ONE lock/release resolver
  // (`resolveSkillLayerRound` — exactly what the CLI wizard's controller loop uses), NOT the bare
  // tier defaults, so a default-on skill that FORCES an optional one via `requires` (e.g. default
  // `grill-me` requires optional `grilling`) renders the forced skill LOCKED-ON (checked + disabled
  // "needed by grill-me") instead of a bare "Off" toggle the install would silently pull in — the
  // UI/reality mismatch this fixes (the web View was omitting the lock the CLI View already shows;
  // grilling ended up installed on every web install while the page showed it Off). The answer set
  // is the tier defaults ADJUSTED by the caller's current exclude/include deltas, so when the
  // forcing skill is toggled OFF (the web page re-fetches `/schema` with the new deltas) the
  // dependency is correctly RELEASED, never left stale-locked. First paint / `--emit-schema` pass
  // no deltas → pure tier defaults.
  const exclude = new Set(ctx.excludeSkills ?? []);
  const include = new Set(ctx.includeSkills ?? []);
  const answerSetFor = (entries: SkillCatalogEntry[]): Set<string> => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.enablement === "optional") {
        if (include.has(e.skill)) set.add(e.skill);
      } else if (!exclude.has(e.skill)) {
        set.add(e.skill);
      }
    }
    return set;
  };
  const offerable = offerableEntries(ctx.catalog, ctx.adapters, ctx.repoTypes);

  const general = offerable.filter((e) => !isRazorEntry(e));
  const generalRound = resolveSkillLayerRound(ctx.catalog, ctx.adapters, ctx.repoTypes, general, answerSetFor(general));
  steps.push(buildSkillsStep(ctx.catalog, ctx.adapters, ctx.repoTypes, generalRound.nextChecked, generalRound.nextLocked));

  const razorEntries = offerable.filter(isRazorEntry);
  if (razorEntries.length > 0) {
    const razorRound = resolveSkillLayerRound(ctx.catalog, ctx.adapters, ctx.repoTypes, razorEntries, answerSetFor(razorEntries));
    const razorStep = buildRazorStep(ctx.catalog, ctx.adapters, ctx.repoTypes, razorRound.nextChecked, razorRound.nextLocked);
    if (razorStep) steps.push(razorStep);
  }
  steps.push(buildConfirmStep());
  return { monorepo: ctx.monorepo, repoTypes: ctx.repoTypes, adapters: ctx.adapters, steps };
}
