import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { AdapterNotImplementedError } from "../core/render-adapters.js";
import { detectMonorepo } from "../core/detect-monorepo.js";
import { injectSkills } from "../core/inject-skills.js";
import { injectSkillsMonorepo } from "../core/inject-skills-monorepo.js";
import { parseTargetArgs } from "../core/parse-targets.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { EXTRAS_FAILURE_WARNING, runExtrasNonInteractive } from "../core/run-extras.js";
import type { ExtrasReport } from "../core/run-extras.js";
import { InvalidSkillSelectionError } from "../core/skill-selection.js";
import { shopifyTelemetryNoticesForPacks } from "../core/shopify-telemetry-notice.js";
import { buildInstallPlan } from "../core/build-install-plan.js";
import type { InstallPlanResult } from "../core/build-install-plan.js";
import { EMPTY_SKILL_SELECTION } from "../types/skill-selection.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";
import { ADAPTER_TYPES, isAdapterType } from "../types/adapter.js";
import type { AdapterType } from "../types/adapter.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { JsonResult } from "../types/json-result.js";
import { REPO_TYPES, parseRepoTypesList } from "../types/repo-type.js";
import type { RepoType } from "../types/repo-type.js";
import type { ParsedTarget } from "../core/parse-targets.js";

/**
 * Parses a `--exclude-skills`/`--include-skills` value — a raw comma-separated string from the
 * CLI/commander (same shape as `--adapters`), OR an already-split array (the wizard,
 * `wizard/run-install-wizard.ts`, passes its step-5 deltas directly). `undefined` input ->
 * `undefined` output (flag not given at all — distinct from an explicitly empty list, which
 * short-circuits the wizard's own step 5 prompt — see `wizard/steps/select-skills.ts`).
 */
function parseSkillNamesArg(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.map((s) => s.trim()).filter((s) => s.length > 0);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface InstallCliOptions {
  json?: boolean;
  /** Raw `--type` flag value. */
  type?: string;
  /** Raw `--target` flag values (repeatable — commander accumulates into an array). Monorepo mode (M5). */
  targets?: string[];
  /** Raw `--monorepo` flag — forces monorepo mode (spec §7.3, M5). */
  monorepo?: boolean;
  /** Raw `--adapters` flag value (comma-separated). */
  adapters?: string;
  /** Raw `--yes` flag. */
  yes?: boolean;
  /** Raw `--exclude-skills` flag value (comma-separated skill names, decisions.md D19). */
  excludeSkills?: string | string[];
  /** Raw `--include-skills` flag value (comma-separated skill names, decisions.md D19). */
  includeSkills?: string | string[];
  /** Raw `--dry-run` flag (spec §7.3): prints the fully resolved plan and writes NOTHING. Bypasses the `--yes` requirement (dry-run needs no confirmation — it never writes). */
  dryRun?: boolean;
  /**
   * Raw `--with-claude-mem` flag (spec §7.10, decisions.md D17, root command only — see
   * `src/cli.ts`'s commander duplicate-flag note). Non-interactive-path-only: when `true` AND
   * the install below succeeds, runs the extras step (best-effort, never affects this result's
   * own `ok`/`exitCode`). The wizard has its OWN interactive extras step
   * (`wizard/steps/extras.ts`) and never sets this — see `src/wizard/CONTEXT.md`.
   */
  withClaudeMem?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own `package.json` version. */
  packageVersion?: string;
  /** Test-injection only — extras already-installed detection's home dir; defaults to `os.homedir()`. */
  extrasHomeDir?: string;
}

export interface InstallSkippedPack {
  name: string;
  missingSkills: string[];
}

export interface InstallSkippedSkill {
  pack: string;
  skill: string;
  reason: string;
}

export interface InstallTargetSummary {
  name: string;
  path: string;
  /** decisions.md D22 — one or more repo types; a single-type target still has a one-element array. */
  repoTypes: RepoType[];
  installedPacks: string[];
}

export interface InstallData {
  /** decisions.md D22 — one or more repo types for a single-project install; `null` before/without a resolvable type, or for a monorepo install (per-target types live in `targets[].repoTypes` instead). */
  repoTypes: RepoType[] | null;
  adapters: AdapterType[];
  targetDir: string;
  installedPacks: string[];
  skippedPacks: InstallSkippedPack[];
  skippedSkills: InstallSkippedSkill[];
  renderedFileCount: number;
  renderedFiles: string[];
  profilePath: string | null;
  manifestPath: string | null;
  /** Monorepo install (M5, new) — always present, `false` for the single-project path. */
  isMonorepo: boolean;
  /** Monorepo install only — per-target records mirroring `.nockta/targets.json`. */
  targets: InstallTargetSummary[];
  /** Monorepo install only — `.nockta/targets.json` path once written. */
  targetsPath: string | null;
  /** Non-blocking notices (e.g. "no monorepo signals detected but --target was used"). */
  warnings: string[];
  /**
   * Disclosure notices (RED-1, packs-redistribution-audit.md) — currently just the Shopify
   * telemetry disclosure, present exactly when `installedPacks` includes a `shopify-*` pack
   * (real install) or would (`--dry-run`). Empty array otherwise. Distinct from `warnings`:
   * these aren't problems, they're required disclosure that ships regardless of outcome.
   * See `core/shopify-telemetry-notice.ts`.
   */
  notices: string[];
  /**
   * Extras (spec §7.10, decisions.md D17) — present ONLY when the extras step actually ran (non-
   * interactive: `--with-claude-mem` was given; wizard: always, as its final step). Absent
   * (`undefined`) whenever extras never ran at all — e.g. every non-interactive install WITHOUT
   * `--with-claude-mem` (brief item 4). Never written to `.nockta` metadata — this field exists
   * purely for the `--json`/human-readable result of THIS run.
   */
  extras?: ExtrasReport;
  /**
   * Running package version (M7, brief item 9) — the sibling `create-nockta-repo` package
   * previously had to read the WRITTEN profile to learn this; now present directly in every
   * `install`/`install --dry-run` result (`data.version`), same value also written into
   * `skills-profile.json`'s own `version`/`source.version` fields (kept, not replaced — this is
   * an ADDITIVE convenience, not a schema migration).
   */
  version: string;
  /** `true` only for an `install --dry-run` run (spec §7.3, brief item 8). */
  dryRun: boolean;
  /** Populated ONLY for a dry-run — the fully resolved plan (packs/skills/tiers/files) that WOULD be installed. `null` for a real (writing) install. */
  plan: InstallPlanResult | null;
  /** The VALIDATED, normalized skill-selection deltas (decisions.md D19) — present for both real and dry-run results; `EMPTY_SKILL_SELECTION` before any packs have even been resolved (e.g. an early `--type` validation failure). */
  skillSelection: SkillSelectionDeltas;
}

export type InstallResult = JsonResult & { command: "install"; data: InstallData };

/** Exported (M6) so `wizard/run-install-wizard.ts` can build a same-shape `InstallData` for a
 * user-declined confirm step without duplicating this shape. */
export function emptyData(repoTypes: RepoType[] | null, adapters: AdapterType[], targetDir: string, packageVersion: string): InstallData {
  return {
    repoTypes,
    adapters,
    targetDir,
    installedPacks: [],
    skippedPacks: [],
    skippedSkills: [],
    renderedFileCount: 0,
    renderedFiles: [],
    profilePath: null,
    manifestPath: null,
    isMonorepo: false,
    targets: [],
    targetsPath: null,
    warnings: [],
    notices: [],
    version: packageVersion,
    dryRun: false,
    plan: null,
    skillSelection: EMPTY_SKILL_SELECTION,
  };
}

function invalidOptions(message: string, data: InstallData): InstallResult {
  return {
    ok: false,
    command: "install",
    exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
    summary: message,
    data,
    errors: [message],
  };
}

interface ParsedAdapters {
  ok: true;
  adapters: AdapterType[];
}
interface InvalidAdapters {
  ok: false;
  message: string;
}

/** Shared `--adapters` parsing for both the single-project and monorepo install paths. */
function parseAdaptersArg(raw: string | undefined): ParsedAdapters | InvalidAdapters {
  if (!raw) {
    return { ok: false, message: `missing required --adapters <list>. Valid adapters: ${ADAPTER_TYPES.join(", ")}` };
  }
  const requested = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  const invalid = requested.find((a) => !isAdapterType(a));
  if (invalid || requested.length === 0) {
    return { ok: false, message: `invalid --adapters value. Valid adapters: ${ADAPTER_TYPES.join(", ")}` };
  }
  return { ok: true, adapters: requested as AdapterType[] };
}

/**
 * Pure(ish) computation of the `install` command result. Does real
 * filesystem I/O (spec §13.1, §14 safety rules restrict it to `.claude/`
 * and `.nockta/` under `options.targetDir`) but no `process.stdout`/
 * `process.exit` — mirrors `commands/list.ts`'s pure/impure split so tests
 * can call this directly against a temp `targetDir` and inspect both the
 * returned result and the files it wrote.
 *
 * Two paths (M5):
 * - Single-project (spec §7.2): `install --type <repoType> --adapters claude --yes [--json]`.
 *   UNCHANGED from M3/M4 — see `buildSingleProjectInstallResult()` below.
 * - Monorepo (spec §7.3, §9): `install --target <path>:<type> [--target ...] --adapters claude
 *   --yes [--json]`, or `--monorepo` + a single split-form `--target <path> --type <type>`.
 *   Triggered whenever `options.targets` is non-empty OR `options.monorepo` is `true` — see
 *   "chosen semantics" note on `isMonorepoRequest` below.
 */
export function buildInstallResult(options: InstallCliOptions): InstallResult {
  const targetDir = options.targetDir ?? process.cwd();

  const rawTargets = options.targets ?? [];
  // Chosen semantics (brief item 3 — "document the chosen semantics"): presence of ANY
  // `--target` flag is itself sufficient signal of monorepo intent (it is the only way to name
  // a target at all); `--monorepo` is an explicit alternate way to force the same mode. Detected
  // signals (spec §9.1) are used ONLY to decide whether to WARN, never to block — see below.
  const isMonorepoRequest = rawTargets.length > 0 || options.monorepo === true;

  const result = isMonorepoRequest
    ? buildMonorepoInstallResult(options, targetDir, rawTargets)
    : buildSingleProjectInstallResult(options, targetDir);

  // Extras (spec §7.10, decisions.md D17) — non-interactive path only, and only when the install
  // itself already succeeded. `--with-claude-mem` (root flag; the wizard never sets this, see
  // `InstallCliOptions.withClaudeMem`'s doc comment) is the sole trigger. Best-effort: a failure
  // is folded into `data.warnings` (same non-blocking-notice mechanism the monorepo path already
  // uses above) and NEVER changes `result.ok`/`result.exitCode` — see `core/run-extras.ts`.
  if (result.ok && options.withClaudeMem) {
    const extras = runExtrasNonInteractive({ homeDir: options.extrasHomeDir });
    result.data.extras = extras;
    if (extras.accepted && !extras.succeeded) {
      result.data.warnings = [...result.data.warnings, EXTRAS_FAILURE_WARNING];
    }
  }

  return result;
}

/**
 * Shared dry-run result builder (spec §7.3, brief item 8): `install --dry-run [--json]` prints
 * the FULLY RESOLVED plan (packs installable/planned, per-skill selection with tiers, adapters,
 * files that WOULD be generated) and writes NOTHING — exit 0 always, UNLESS the skill-selection
 * deltas themselves were invalid (`plan.ok === false`: unknown skill name, or excluding a
 * required skill), in which case this is the SAME exit 1 (`INVALID_PROFILE_OR_TARGETS`) a real
 * install would give for the identical bad input — dry-run never lies about a request that would
 * have failed for real. Used by BOTH the single-project and monorepo paths.
 */
function buildDryRunResult(
  repoTypes: RepoType[] | null,
  adapters: AdapterType[],
  targetDir: string,
  packageVersion: string,
  plan: InstallPlanResult,
  isMonorepo: boolean,
  targets: InstallTargetSummary[] = [],
): InstallResult {
  const data: InstallData = {
    repoTypes,
    adapters,
    targetDir,
    installedPacks: plan.installedPacks,
    skippedPacks: plan.plannedPacks,
    skippedSkills: [],
    renderedFileCount: plan.files.length,
    renderedFiles: plan.files,
    profilePath: null,
    manifestPath: null,
    isMonorepo,
    targets,
    targetsPath: null,
    warnings: [],
    notices: shopifyTelemetryNoticesForPacks(plan.installedPacks),
    version: packageVersion,
    dryRun: true,
    plan,
    skillSelection: plan.skillSelection,
  };

  if (!plan.ok) {
    const message = `invalid skill selection: ${plan.errors.join("; ")}`;
    return {
      ok: false,
      command: "install",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data,
      errors: [message],
    };
  }

  const summary =
    `dry run: would install ${data.renderedFileCount} file${data.renderedFileCount === 1 ? "" : "s"} ` +
    `across ${data.installedPacks.length} pack${data.installedPacks.length === 1 ? "" : "s"} ` +
    `(${data.installedPacks.join(", ") || "none"}) for adapters: ${adapters.join(", ")}; nothing written`;

  return { ok: true, command: "install", exitCode: EXIT_CODES.SUCCESS, summary, data };
}

/**
 * Single-project non-interactive install (spec §7.2). D22, new: `--type` accepts a
 * comma-separated multi-type list (`--type shopify-theme,vite-react-ts`) — parsed here via
 * `parseRepoTypesList()` into `repoTypes: RepoType[]`, a one-element array for the pre-D22
 * single-type case. Everything downstream (`buildInstallPlan()`, `injectSkills()`) already takes
 * the array shape and unions the named types' packs — see `packs/resolve-packs.ts`'s
 * `requestedPacks` (already a set-like list, D22 union resolution needs no new merge logic there).
 */
function buildSingleProjectInstallResult(options: InstallCliOptions, targetDir: string): InstallResult {
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();

  // --type (D22: comma-separated multi-type)
  if (!options.type) {
    return invalidOptions(
      `missing required --type <repoType>[,<repoType>...]. Valid repo types: ${REPO_TYPES.join(", ")}`,
      emptyData(null, [], targetDir, packageVersion),
    );
  }
  const parsedTypes = parseRepoTypesList(options.type, ",");
  if (!parsedTypes.ok) {
    return invalidOptions(parsedTypes.error, emptyData(null, [], targetDir, packageVersion));
  }
  const repoTypes = parsedTypes.types;

  // --adapters
  const parsedAdapters = parseAdaptersArg(options.adapters);
  if (!parsedAdapters.ok) {
    return invalidOptions(parsedAdapters.message, emptyData(repoTypes, [], targetDir, packageVersion));
  }
  const adapters = parsedAdapters.adapters;

  // --exclude-skills / --include-skills (decisions.md D19) — parsed here so the dry-run branch
  // and the real write path validate through the SAME `resolveSkillSelection()` call.
  const excludeSkills = parseSkillNamesArg(options.excludeSkills);
  const includeSkills = parseSkillNamesArg(options.includeSkills);

  // --dry-run (spec §7.3, brief item 8) — bypasses --yes entirely (never writes, so nothing to
  // confirm) and short-circuits before any real filesystem write happens.
  if (options.dryRun) {
    const plan = buildInstallPlan({
      repoTypes,
      monorepo: false,
      adapters,
      packsRoot: options.packsRoot,
      excludeSkills,
      includeSkills,
    });
    return buildDryRunResult(repoTypes, adapters, targetDir, packageVersion, plan, false);
  }

  // --yes — required in this milestone: no interactive confirmation step
  // exists yet (the wizard remains a shell, spec §7.1), so a non-interactive
  // install without --yes has no safe confirmation path (spec §14, §7.7's
  // sync confirmation policy applied here by the same reasoning).
  if (!options.yes) {
    return invalidOptions(
      "non-interactive install requires --yes (interactive confirmation is not implemented yet)",
      emptyData(repoTypes, adapters, targetDir, packageVersion),
    );
  }

  let injectResult: ReturnType<typeof injectSkills>;
  try {
    injectResult = injectSkills({
      repoTypes,
      adapters,
      yes: true,
      targetDir,
      packsRoot: options.packsRoot,
      packageVersion,
      excludeSkills,
      includeSkills,
    });
  } catch (error) {
    if (error instanceof InvalidSkillSelectionError) {
      return invalidOptions(error.message, emptyData(repoTypes, adapters, targetDir, packageVersion));
    }
    const message =
      error instanceof AdapterNotImplementedError
        ? error.message
        : `render failure: ${(error as Error).message}`;
    return {
      ok: false,
      command: "install",
      exitCode: EXIT_CODES.RENDER_FAILURE,
      summary: message,
      data: emptyData(repoTypes, adapters, targetDir, packageVersion),
      errors: [message],
    };
  }

  const data: InstallData = {
    repoTypes,
    adapters,
    targetDir,
    installedPacks: injectResult.installedPacks,
    skippedPacks: injectResult.skippedPacks,
    skippedSkills: injectResult.skippedSkills,
    renderedFileCount: injectResult.renderedFiles.length,
    renderedFiles: injectResult.renderedFiles.map((f) => f.path).sort(),
    profilePath: injectResult.profilePath,
    manifestPath: injectResult.manifestPath,
    isMonorepo: false,
    targets: [],
    targetsPath: null,
    warnings: [],
    notices: shopifyTelemetryNoticesForPacks(injectResult.installedPacks),
    version: packageVersion,
    dryRun: false,
    plan: null,
    skillSelection: injectResult.skillSelection,
  };

  if (injectResult.missingPacks.length > 0) {
    const message = `requested pack(s) not found on disk: ${injectResult.missingPacks.join(", ")}`;
    return {
      ok: false,
      command: "install",
      exitCode: EXIT_CODES.MISSING_PACKS,
      summary: message,
      data,
      errors: [message],
    };
  }

  const summary =
    `installed ${data.renderedFileCount} file${data.renderedFileCount === 1 ? "" : "s"} ` +
    `across ${data.installedPacks.length} pack${data.installedPacks.length === 1 ? "" : "s"} ` +
    `(${data.installedPacks.join(", ") || "none"}) for adapters: ${adapters.join(", ")}; ` +
    `${data.skippedPacks.length} pack${data.skippedPacks.length === 1 ? "" : "s"} skipped (planned)`;

  return {
    ok: true,
    command: "install",
    exitCode: EXIT_CODES.SUCCESS,
    summary,
    data,
  };
}

/**
 * Monorepo install (spec §7.3, §9, decisions.md D9, M5 new). Resolves + renders packs for every
 * `--target` ONCE at the monorepo root (spec §9.4 — no per-target `.claude/`), writes the
 * monorepo profile (spec §10.2) + `.nockta/targets.json` (spec §9.3) + the generated manifest
 * (spec §10.3, same as single-project).
 */
function buildMonorepoInstallResult(options: InstallCliOptions, targetDir: string, rawTargets: string[]): InstallResult {
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();

  if (rawTargets.length === 0) {
    // --monorepo passed with no --target at all: nothing to install.
    return invalidOptions(
      "--monorepo requires at least one --target <path>:<type>",
      emptyData(null, [], targetDir, packageVersion),
    );
  }

  const parsed = parseTargetArgs({ targetArgs: rawTargets, type: options.type });
  if (!parsed.ok) {
    return invalidOptions(parsed.errors.join("; "), emptyData(null, [], targetDir, packageVersion));
  }

  const parsedAdapters = parseAdaptersArg(options.adapters);
  if (!parsedAdapters.ok) {
    return invalidOptions(parsedAdapters.message, emptyData(null, [], targetDir, packageVersion));
  }
  const adapters = parsedAdapters.adapters;

  // Path validation (brief item 2): every target path must exist inside the repo. Collect ALL
  // problems, not just the first, for a single actionable error message. Runs BEFORE the --yes
  // gate (and before the dry-run branch) so `install --dry-run` still reports a bad target path
  // as invalid input, same as a real install would — a "resolved plan" against a target that
  // does not exist is not meaningfully resolved.
  const pathErrors: string[] = [];
  const resolvedTargetDir = resolve(targetDir);
  for (const t of parsed.targets) {
    const abs = resolve(targetDir, t.path);
    if (abs !== resolvedTargetDir && !abs.startsWith(`${resolvedTargetDir}/`)) {
      pathErrors.push(`--target "${t.path}" escapes the repo root — target paths must stay inside the repo`);
      continue;
    }
    let ok = false;
    try {
      ok = existsSync(abs) && statSync(abs).isDirectory();
    } catch {
      ok = false;
    }
    if (!ok) pathErrors.push(`--target "${t.path}" does not exist (or is not a directory) under ${targetDir}`);
  }
  if (pathErrors.length > 0) {
    return invalidOptions(pathErrors.join("; "), emptyData(null, adapters, targetDir, packageVersion));
  }

  // Self-target normalization: a `--target <path>` whose resolved absolute path IS the repo
  // root (e.g. `--target <cwd>` or any absolute path equal to `targetDir`) is the root install,
  // not a distinct monorepo member — store it as "." rather than the raw (often absolute) path
  // the caller typed. Without this, the raw path (absolute, or otherwise not root-relative)
  // gets written into `.nockta/targets.json` and `monorepo-doctor-checks.ts`'s `checkTarget()`
  // (which does `join(targetDir, record.path)`) resolves it to a nonexistent location — a false
  // "target directory does not exist" on a target that IS the (perfectly healthy) root.
  const targets = parsed.targets.map((t) => (resolve(targetDir, t.path) === resolvedTargetDir ? { ...t, path: "." } : t));
  // Derives a display name from a (possibly self-target, ".") target path — factored out since
  // both `targetSummaries` below and `monorepoTargets` further down need the identical mapping.
  const targetName = (path: string): string =>
    path === "." ? (resolvedTargetDir.split("/").filter(Boolean).pop() ?? resolvedTargetDir) : path.split("/").filter(Boolean).pop() ?? path;

  // --exclude-skills / --include-skills (decisions.md D19).
  const excludeSkills = parseSkillNamesArg(options.excludeSkills);
  const includeSkills = parseSkillNamesArg(options.includeSkills);

  // D22 union resolution: flatten every target's types[] into one deduped set before resolving
  // packs — `resolvePacks()` already dedups `requestedPacks` internally.
  const distinctRepoTypes = [...new Set(targets.flatMap((t) => t.types))];
  const targetSummaries: InstallTargetSummary[] = targets.map((t) => ({
    name: targetName(t.path),
    path: t.path,
    repoTypes: t.types,
    installedPacks: [],
  }));

  // --dry-run (spec §7.3, brief item 8).
  if (options.dryRun) {
    const plan = buildInstallPlan({
      repoTypes: distinctRepoTypes,
      monorepo: true,
      adapters,
      packsRoot: options.packsRoot,
      excludeSkills,
      includeSkills,
    });
    return buildDryRunResult(null, adapters, targetDir, packageVersion, plan, true, targetSummaries);
  }

  if (!options.yes) {
    return invalidOptions(
      "non-interactive install requires --yes (interactive confirmation is not implemented yet)",
      emptyData(null, adapters, targetDir, packageVersion),
    );
  }

  const warnings: string[] = [];
  if (!options.monorepo) {
    const detection = detectMonorepo(targetDir);
    if (!detection.isMonorepo) {
      warnings.push(
        "no monorepo signals detected (pnpm-workspace.yaml, turbo.json, nx.json, " +
          "lerna.json, rush.json, package.json workspaces) — proceeding anyway because --target " +
          "was given; pass --monorepo to silence this warning",
      );
    }
  }

  const monorepoTargets = targets.map((t: ParsedTarget) => ({
    name: targetName(t.path),
    path: t.path,
    repoTypes: t.types,
  }));

  let injectResult: ReturnType<typeof injectSkillsMonorepo>;
  try {
    injectResult = injectSkillsMonorepo({
      targets: monorepoTargets,
      adapters,
      targetDir,
      packsRoot: options.packsRoot,
      packageVersion,
      excludeSkills,
      includeSkills,
    });
  } catch (error) {
    if (error instanceof InvalidSkillSelectionError) {
      return invalidOptions(error.message, emptyData(null, adapters, targetDir, packageVersion));
    }
    const message =
      error instanceof AdapterNotImplementedError
        ? error.message
        : `render failure: ${(error as Error).message}`;
    return {
      ok: false,
      command: "install",
      exitCode: EXIT_CODES.RENDER_FAILURE,
      summary: message,
      data: emptyData(null, adapters, targetDir, packageVersion),
      errors: [message],
    };
  }

  const data: InstallData = {
    repoTypes: null,
    adapters,
    targetDir,
    installedPacks: injectResult.installedPacks,
    skippedPacks: injectResult.skippedPacks,
    skippedSkills: injectResult.skippedSkills,
    renderedFileCount: injectResult.renderedFiles.length,
    renderedFiles: injectResult.renderedFiles.map((f) => f.path).sort(),
    profilePath: injectResult.profilePath,
    manifestPath: injectResult.manifestPath,
    isMonorepo: true,
    targets: injectResult.targetRecords.map((t) => ({
      name: t.name,
      path: t.path,
      repoTypes: t.repoTypes,
      installedPacks: t.installedPacks,
    })),
    targetsPath: injectResult.targetsPath,
    warnings,
    notices: shopifyTelemetryNoticesForPacks(injectResult.installedPacks),
    version: packageVersion,
    dryRun: false,
    plan: null,
    skillSelection: injectResult.skillSelection,
  };

  if (injectResult.missingPacks.length > 0) {
    const message = `requested pack(s) not found on disk: ${injectResult.missingPacks.join(", ")}`;
    return {
      ok: false,
      command: "install",
      exitCode: EXIT_CODES.MISSING_PACKS,
      summary: message,
      data,
      errors: [message],
    };
  }

  const summary =
    `monorepo install: ${data.renderedFileCount} file${data.renderedFileCount === 1 ? "" : "s"} ` +
    `at root across ${data.installedPacks.length} pack${data.installedPacks.length === 1 ? "" : "s"} ` +
    `(${data.installedPacks.join(", ") || "none"}) for ${data.targets.length} target${data.targets.length === 1 ? "" : "s"} ` +
    `(adapters: ${adapters.join(", ")}); ${data.skippedPacks.length} pack${data.skippedPacks.length === 1 ? "" : "s"} skipped (planned)`;

  return {
    ok: true,
    command: "install",
    exitCode: EXIT_CODES.SUCCESS,
    summary,
    data,
  };
}

/** Pure text formatter for human (non-`--json`) `install` output. */
export function formatInstallHuman(result: InstallResult): string {
  const lines: string[] = [];
  const badge = result.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`${badge} ${result.summary}`);

  if (result.data.dryRun && result.data.plan) {
    lines.push("", pc.bold("Skills (tier, selected):"));
    for (const s of result.data.plan.skills) {
      const mark = s.selected ? pc.green("✓") : pc.dim("—");
      const lock = s.requiredBy.length > 0 ? pc.dim(` 🔒 required by ${s.requiredBy.join(", ")}`) : "";
      lines.push(`  ${mark} ${s.skill} [${s.enablement}] (pack: ${s.pack})${lock}`);
    }
  }

  if (result.data.installedPacks.length > 0) {
    lines.push("");
    lines.push(pc.bold(`${result.data.dryRun ? "Would render" : "Rendered"} ${result.data.renderedFileCount} file(s):`));
    for (const path of result.data.renderedFiles) lines.push(`  ${path}`);
  }
  if (result.data.isMonorepo && result.data.targets.length > 0) {
    lines.push("", pc.bold(`Targets (${result.data.targets.length}):`));
    for (const t of result.data.targets) {
      lines.push(`  ${t.name} (${t.path}, ${t.repoTypes.join("+")}) — packs: ${t.installedPacks.join(", ")}`);
    }
  }
  if (result.data.skippedPacks.length > 0) {
    lines.push("");
    lines.push(pc.dim("Skipped (planned, no authored content yet):"));
    for (const pack of result.data.skippedPacks) {
      lines.push(pc.dim(`  ${pack.name} — missing: ${pack.missingSkills.join(", ")}`));
    }
  }
  if (result.data.profilePath) lines.push("", `Profile: ${result.data.profilePath}`);
  if (result.data.targetsPath) lines.push(`Targets: ${result.data.targetsPath}`);
  if (result.data.manifestPath) lines.push(`Manifest: ${result.data.manifestPath}`);
  if (result.data.warnings.length > 0) {
    lines.push("", pc.yellow("Warnings:"));
    for (const w of result.data.warnings) lines.push(pc.yellow(`  ${w}`));
  }
  if (result.data.notices.length > 0) {
    lines.push("");
    for (const n of result.data.notices) lines.push(pc.dim(n));
  }
  if (result.data.extras?.accepted && result.data.extras.succeeded) {
    lines.push("", pc.dim("Extras: claude-mem installed."));
  }
  if (result.errors && result.errors.length > 0) {
    lines.push("", pc.red("Errors:"));
    for (const e of result.errors) lines.push(pc.red(`  ${e}`));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * `inject-nockta-skills install` — non-interactive / flag-driven install.
 * Spec: startup docs/inject-nockta-skills.updated.md §7.2, §7.3, §13.1.
 */
export function runInstallCommand(options: InstallCliOptions): never {
  const result = buildInstallResult(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatInstallHuman(result));
  }

  process.exit(result.exitCode);
}
