import { detectRepoTypeAcrossWorkspace } from "../core/detect-repo-type.js";
import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { ADAPTER_TYPES, isAdapterType } from "../types/adapter.js";
import type { AdapterType } from "../types/adapter.js";
import { parseRepoTypesList } from "../types/repo-type.js";
import type { RepoType } from "../types/repo-type.js";
import { buildWizardSchema } from "../wizard/core/build-schema.js";
import type { RepoTypeGuess } from "../core/detect-repo-type.js";
import type { WizardSchema } from "../wizard/core/types.js";

/**
 * Assembles the `WizardSchema` for `--web` mode and `--emit-schema` (decisions.md D30) WITHOUT
 * going through the step-by-step CLI Presenter/Controller — web is a whole-form surface. This is
 * the same runtime-context assembly `wizard/run-install-wizard.ts` does (detection + `resolvePacks`
 * + `buildSkillCatalog` + `buildWizardSchema`), condensed to the single-project branch and emitting
 * ONE fully-resolved schema up front (no per-step catalog rebuild — see the "whole-form limitation"
 * note in `src/web/CONTEXT.md`).
 *
 * FIRST PAINT vs. REACTIVE: this builds the FIRST-PAINT schema from a KNOWN repoTypes — the `--type`
 * preset if given, else detection's guesses (`detect` defaults true). The page is no longer frozen:
 * on every repo-type/adapter toggle it refetches `GET /schema`, which re-invokes THIS function with
 * `detect:false` and the checkbox state as authoritative `type`/`adapters` (empty `types` →
 * common-only, no re-detection). So `buildWebSchema` is the single derivation brain for BOTH the
 * up-front paint and every live re-derivation — one code path, no drift.
 */
export interface WebSchemaOptions {
  type?: string;
  adapters?: string;
  excludeSkills?: string[];
  includeSkills?: string[];
  targetDir?: string;
  packsRoot?: string;
  /**
   * Whether to fall back to filesystem repo-type detection when no `--type` preset is given.
   * Defaults to `true` (first-paint / `--emit-schema`). The REACTIVE `GET /schema` endpoint passes
   * `false`: there the page's checkbox state is authoritative, so an empty `types` must mean
   * "common-only", NOT "re-detect the server's project" (which would ignore the user's toggles).
   */
  detect?: boolean;
}

export interface WebSchemaResult {
  schema: WizardSchema;
  repoTypes: RepoType[];
  adapters: AdapterType[];
}

const DEFAULT_ADAPTERS: readonly AdapterType[] = ADAPTER_TYPES; // claude/cursor/copilot/agent/antigravity

function parseAdapters(raw: string | undefined): AdapterType[] {
  if (!raw) return [...DEFAULT_ADAPTERS];
  const list = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .filter((a): a is AdapterType => isAdapterType(a));
  return list.length > 0 ? list : [...DEFAULT_ADAPTERS];
}

/**
 * Applies `--yes`/flag values as page PRE-SEEDS (D30: in the `--web` + `--yes` combo, flags only
 * pre-seed the form's defaults, they don't bypass the page). Post-processes the already-built
 * schema's `checked` flags in place:
 *   - repo-type rows -> checked iff in the resolved `repoTypes` (covers an explicit `--type` whose
 *     detection guesses were empty);
 *   - adapter rows -> checked iff in the chosen adapter set (never a disabled "coming soon" row).
 *
 * Skill/razor rows are NOT touched here: their checked/locked state is resolved authoritatively in
 * `buildWizardSchema` from `excludeSkills`/`includeSkills` via the shared `resolveSkillLayerRound`
 * (so a `requires` dependency is locked-on or released to match the deltas, not merely flag-flipped
 * in place — which would leave a forced dependency's lock stale when its forcer is toggled off).
 */
function applyPreseeds(result: WebSchemaResult, opts: WebSchemaOptions): void {
  const adapters = new Set(result.adapters);
  const repoTypes = new Set<string>(result.repoTypes);

  for (const step of result.schema.steps) {
    if (!step.choices) continue;
    if (step.id !== "repo-type" && step.id !== "adapters") continue;
    for (const choice of step.choices) {
      if (choice.disabled) continue;
      if (step.id === "repo-type") choice.checked = repoTypes.has(choice.value);
      else choice.checked = adapters.has(choice.value as AdapterType);
    }
  }
}

export function buildWebSchema(opts: WebSchemaOptions): WebSchemaResult {
  const targetDir = opts.targetDir ?? process.cwd();
  const packsRoot = opts.packsRoot;

  // repoTypes: explicit --type wins and skips detection; else detection guesses drive the catalog.
  let repoTypes: RepoType[];
  let guesses: RepoTypeGuess[] = [];
  const presetParsed = opts.type ? parseRepoTypesList(opts.type, ",") : null;
  if (presetParsed && presetParsed.ok) {
    repoTypes = presetParsed.types;
  } else if (opts.detect === false) {
    // Reactive `/schema`: the page's checkbox state is authoritative — no filesystem detection.
    // An empty/invalid `types` param resolves to common-only (razor gates itself off with no type).
    repoTypes = [];
  } else {
    const detection = detectRepoTypeAcrossWorkspace(targetDir);
    guesses = detection.guesses;
    repoTypes = detection.guesses.map((g) => g.type);
  }

  const adapters = parseAdapters(opts.adapters);

  const resolved = resolvePacks({ requestedPacks: repoTypes, monorepo: false, packsRoot });
  const catalog = buildSkillCatalog(resolved.installable, packsRoot ?? getPacksPath());

  const schema = buildWizardSchema({
    monorepo: false,
    repoTypes,
    adapters,
    catalog,
    guesses,
    excludeSkills: opts.excludeSkills,
    includeSkills: opts.includeSkills,
  });

  const result: WebSchemaResult = { schema, repoTypes, adapters };
  applyPreseeds(result, opts);
  return result;
}
