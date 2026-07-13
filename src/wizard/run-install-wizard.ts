import { buildInstallResult, emptyData, formatInstallHuman } from "../commands/install.js";
import type { InstallResult } from "../commands/install.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { parseTargetArgs } from "../core/parse-targets.js";
import { detectRepoTypeAcrossWorkspace } from "../core/detect-repo-type.js";
import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { RepoType } from "../types/repo-type.js";
import { parseRepoTypesList } from "../types/repo-type.js";
import type { AdapterType } from "../types/adapter.js";
import { isAdapterType } from "../types/adapter.js";
import { defaultWizardPrompts } from "./prompts.js";
import type { WizardPrompts } from "./prompts.js";
import { runDetectRepoStep } from "./steps/detect-repo.js";
import { discoverWorkspaceCandidates } from "./steps/select-targets.js";
import { buildPreviewPlan, formatPreviewHuman } from "./steps/preview-plan.js";
import { runExtrasWizardStep } from "./steps/extras.js";
import { EXTRAS_FAILURE_WARNING } from "../core/run-extras.js";
import { runWizardController } from "./controller.js";
import type { ControllerContext } from "./controller.js";
import { resolve, mergeSkillDeltas } from "./core/resolve.js";
import type { StepId, WizardAnswers } from "./core/types.js";
import type { Presenter } from "./view/presenter.js";
import { createCliPresenter } from "./view/cli-presenter.js";

/**
 * Default (no-subcommand) entry point: the interactive install wizard.
 *
 * D28 rebuild — strict Model–View–Controller (see `src/wizard/CONTEXT.md`): the selection/tier/
 * lock/clash/razor logic lives in the presenter-agnostic wizard-core (`core/`), the terminal UI in
 * the CLI presenter (`view/`), and this file only assembles the runtime context (detection, catalog
 * factory, presets) and drives the back-aware `runWizardController()`. Step 8 ("write") is still the
 * SAME `buildInstallResult()` the non-interactive path uses — `resolve(answers)` produces its plain
 * option object, so a wizard-driven install has an identical write path/exit codes/JSON shape.
 */
export interface WizardOptions {
  json?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own running version. */
  packageVersion?: string;
  /** Test-injection only — replaces the CLI presenter (the View) with a scripted fake. */
  presenter?: Presenter;
  /** Test-injection only — the extras step's `@inquirer/prompts`-backed confirm (extras is a post-write, non-back-nav step). */
  prompts?: WizardPrompts;
  /** Test-injection only — narration sink; defaults to console.log (human mode) / no-op (`--json`). */
  log?: (message: string) => void;
  /**
   * Presets from CLI flags (D29): each pre-answers and SKIPS its step (also skipped by back-nav).
   * An explicit `type` is never overridden by detection. May be comma-separated (multiple types).
   */
  type?: string;
  targets?: string[];
  monorepo?: boolean;
  adapters?: string;
  yes?: boolean;
  /** Preset `--exclude-skills` — pre-answers + skips BOTH skill steps (general + razor). */
  excludeSkills?: string[];
  /** Preset `--include-skills` — pre-answers + skips BOTH skill steps. */
  includeSkills?: string[];
  /** Test-injection only — extras already-installed detection's home dir; defaults to `os.homedir()`. */
  extrasHomeDir?: string;
}

/**
 * Wizard's FINAL step (spec §7.10, decisions.md D17) — the interactive extras offer, run only
 * after a successful write (`result.ok`). Mutates and returns the SAME `InstallResult`.
 */
async function withExtrasStep(
  result: InstallResult,
  prompts: WizardPrompts,
  log: (message: string) => void,
  extrasHomeDir?: string,
): Promise<InstallResult> {
  if (!result.ok) return result;
  const extras = await runExtrasWizardStep(prompts, log, { homeDir: extrasHomeDir });
  result.data.extras = extras;
  if (extras.accepted && !extras.succeeded) {
    result.data.warnings = [...result.data.warnings, EXTRAS_FAILURE_WARNING];
  }
  return result;
}

function cancelledResult(
  reason: string,
  targetDir: string,
  repoTypes: RepoType[] | null,
  adapters: AdapterType[],
  packageVersion: string,
): InstallResult {
  const message = `install cancelled: ${reason}`;
  return {
    ok: false,
    command: "install",
    exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
    summary: message,
    data: emptyData(repoTypes, adapters, targetDir, packageVersion),
    errors: [message],
  };
}

function parsePresetAdapters(raw: string): AdapterType[] | null {
  const list = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (list.length === 0 || !list.every((a) => isAdapterType(a))) return null;
  return list as AdapterType[];
}

/**
 * The wizard flow — no `process.stdout`/`process.exit`, so tests call this directly with an
 * injected `presenter` (scripted step results, no real TTY) and a capturing/no-op `log`.
 *
 * Step 1 (detect single-repo vs monorepo, decisions.md D22 "root-is-a-project monorepo" override)
 * still runs here as narration + branch selection; every other step is owned by the Controller.
 */
export async function runWizardFlow(options: WizardOptions): Promise<InstallResult> {
  const targetDir = options.targetDir ?? process.cwd();
  const packsRoot = options.packsRoot;
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();
  const prompts = options.prompts ?? defaultWizardPrompts;
  const log = options.log ?? (() => {});

  // Step 1: detect single-repo vs monorepo. A repo can be BOTH a workspace root AND itself a real
  // project (e.g. a Shopify theme at the root with a Vite/React asset workspace) — that case is one
  // multi-type install AT THE ROOT, not a per-package install. Only an AUTO-DETECTED monorepo
  // signal is overridden this way; an EXPLICIT `--monorepo`/`--target` always wins.
  const detection = runDetectRepoStep(targetDir);
  const workspaceDetection = detectRepoTypeAcrossWorkspace(targetDir);
  const rootIsAlsoAProject = workspaceDetection.bySource.some((g) => g.source === ".");
  const explicitMonorepo = options.monorepo === true || (options.targets ?? []).length > 0;
  const rootIsAProjectOverride = !explicitMonorepo && detection.isMonorepo && rootIsAlsoAProject;
  const isMonorepoMode = explicitMonorepo || (detection.isMonorepo && !rootIsAlsoAProject);
  if (rootIsAProjectOverride) {
    // NOTE (decisions.md D28 dev-speak strip): the "decisions.md D22" citation was removed from
    // this consumer-facing line; the plain concept phrase "root-is-a-project monorepo" is kept.
    log(
      `Detected a monorepo (signals: ${detection.signals.join(", ")}), but the root itself also looks like a ` +
        `project — treating this as a single install at the root ("root-is-a-project monorepo"), not separate ` +
        `per-package installs.`,
    );
  } else {
    log(
      isMonorepoMode
        ? `Detected a monorepo${detection.signals.length > 0 ? ` (signals: ${detection.signals.join(", ")})` : " (forced via --target/--monorepo)"}.`
        : "Detected a single-project repo (no monorepo signals found).",
    );
  }

  const presetTypesValid = options.type ? parseRepoTypesList(options.type, ",").ok : false;
  const guesses = presetTypesValid ? [] : workspaceDetection.guesses;
  const candidates = isMonorepoMode ? discoverWorkspaceCandidates(targetDir) : [];

  const buildCatalog = (repoTypes: RepoType[]) => {
    const resolved = resolvePacks({ requestedPacks: repoTypes, monorepo: isMonorepoMode, packsRoot });
    return buildSkillCatalog(resolved.installable, packsRoot ?? getPacksPath());
  };

  const previewText = (answers: WizardAnswers): string => {
    const repoTypes = answers.monorepo
      ? [...new Set((answers.targets ?? []).flatMap((t) => t.types))]
      : answers.repoTypes ?? [];
    const preview = buildPreviewPlan({
      repoTypes,
      adapters: answers.adapters ?? [],
      monorepo: isMonorepoMode,
      packsRoot,
      skillSelection: mergeSkillDeltas(answers.skills, answers.razor),
    });
    return formatPreviewHuman(preview);
  };

  // Seed answers + preset-skip set from the flags already given (D29).
  const answers: WizardAnswers = { monorepo: isMonorepoMode };
  const presetSteps = new Set<StepId>();

  if (!isMonorepoMode && presetTypesValid) {
    const parsed = parseRepoTypesList(options.type as string, ",");
    if (parsed.ok) {
      answers.repoTypes = parsed.types;
      presetSteps.add("repo-type");
    }
  }
  if (isMonorepoMode && (options.targets ?? []).length > 0) {
    const parsed = parseTargetArgs({ targetArgs: options.targets as string[], type: options.type });
    if (parsed.ok) {
      answers.targets = parsed.targets;
      presetSteps.add("targets");
      log(`Using ${parsed.targets.length} target(s) already given on the command line.`);
    }
  }
  const presetAdapters = options.adapters ? parsePresetAdapters(options.adapters) : null;
  if (presetAdapters) {
    answers.adapters = presetAdapters;
    presetSteps.add("adapters");
  }
  if (options.excludeSkills !== undefined || options.includeSkills !== undefined) {
    answers.skills = { excluded: options.excludeSkills ?? [], included: options.includeSkills ?? [] };
    presetSteps.add("skills");
    presetSteps.add("razor");
  }
  if (options.yes) {
    answers.confirmed = true;
    presetSteps.add("confirm");
  }

  const ctx: ControllerContext = { monorepo: isMonorepoMode, guesses, candidates, buildCatalog, previewText };
  const presenter = options.presenter ?? createCliPresenter({ candidates, log });

  let controllerResult;
  try {
    controllerResult = await runWizardController({ presenter, ctx, answers, presetSteps });
  } finally {
    presenter.close();
  }

  if (controllerResult.kind === "cancelled") {
    return cancelledResult(controllerResult.reason, targetDir, answers.repoTypes ?? null, answers.adapters ?? [], packageVersion);
  }

  const final = controllerResult.answers;
  if (!final.confirmed) {
    return cancelledResult(
      "user declined the confirmation prompt — no changes made",
      targetDir,
      final.repoTypes ?? null,
      final.adapters ?? [],
      packageVersion,
    );
  }

  // Step 8: write, via the existing install core. `resolve()` produces its exact plain option object.
  const plan = resolve(final);
  const installResult = buildInstallResult({
    type: plan.type,
    targets: plan.targets,
    monorepo: plan.monorepo,
    adapters: plan.adapters,
    yes: true,
    targetDir,
    packsRoot,
    packageVersion,
    excludeSkills: plan.excludeSkills,
    includeSkills: plan.includeSkills,
  });

  // Wizard's final step: extras (only after a successful write).
  return withExtrasStep(installResult, prompts, log, options.extrasHomeDir);
}

/**
 * Impure wrapper: runs `runWizardFlow()`, prints narration + the final result, then exits with the
 * SAME code scheme every other command uses. Reuses `formatInstallHuman()` for the write summary.
 */
export async function runInstallWizard(options: WizardOptions = {}): Promise<never> {
  const log = options.log ?? (options.json ? () => {} : (message: string) => console.log(message));
  const result = await runWizardFlow({ ...options, log });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatInstallHuman(result));
  }

  process.exit(result.exitCode);
}
