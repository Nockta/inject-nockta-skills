import { runInstallCommand } from "./install.js";
import type { InstallCliOptions } from "./install.js";
import { runInstallWizard } from "../wizard/run-install-wizard.js";
import type { WizardPrompts } from "../wizard/prompts.js";
import { detectDisplay } from "../web/display.js";
import { resolveWebPrecedence } from "../web/precedence.js";
import { runWebInstall, runEmitSchema } from "../web/run-web-install.js";
import { EXIT_CODES } from "../types/json-result.js";

/**
 * Shared entry point for BOTH the root short-form (`npx inject-nockta-skills --type ... --yes`,
 * spec §7.2) and the `install` subcommand (`npx inject-nockta-skills install --type ... --yes`)
 * — `src/cli.ts` calls this from both places with equivalent parsed options, which is what
 * guarantees the two are byte-for-byte identical (brief item 4's "root short-form parity"):
 * there is exactly one routing decision function, not two copies that could drift.
 *
 * Routing (spec §6, brief item 3):
 * - sufficient flags (`--type` or `--target`, plus `--yes`) -> the EXISTING non-interactive path
 *   (`runInstallCommand()`), completely unchanged.
 * - insufficient flags, but NOT a real TTY -> ALSO the existing non-interactive path. This is
 *   deliberate, not a shortcut: `buildInstallResult()` already returns a structured,
 *   non-hanging, exit-1 error for insufficient flags (e.g. missing `--type`/`--yes`) — reusing it
 *   here (rather than adding a second insufficient-flags error shape) is what guarantees the
 *   non-TTY path NEVER prompts and NEVER hangs, satisfying the brief's "never hang, never print
 *   human wizard text to a JSON consumer" requirement by construction rather than a new check.
 * - insufficient flags AND a real TTY -> the interactive wizard (`runInstallWizard()`), which
 *   receives whatever partial flags WERE given as step presets (spec §6: flags fill in wizard
 *   steps, they are not simply discarded because the whole set wasn't "enough").
 */
export interface InstallEntryOptions extends InstallCliOptions {
  /** Test-injection only — defaults to a real TTY check (`process.stdin.isTTY && process.stdout.isTTY`), same convention as `commands/sync.ts`'s `defaultIsTTY()`. */
  isTTY?: boolean;
  /** Test-injection only — replaces the wizard's real `@inquirer/prompts`-backed prompts. */
  wizardPrompts?: WizardPrompts;
  /** Test-injection only — replaces the wizard's narration log function. */
  wizardLog?: (message: string) => void;
  /** D30 `--web`: opt into the browser wizard. */
  web?: boolean;
  /** D30 `--cli`: force the terminal wizard even alongside `--web`. */
  cli?: boolean;
  /** D30 `--no-open`: serve + print the URL without auto-launching a browser (also treated as display-available). */
  noOpen?: boolean;
  /** D30 `--emit-schema`: print `buildWizardSchema()` JSON and exit 0. */
  emitSchema?: boolean;
  /** Test-injection only — defaults to the real display heuristic (`web/display.ts`). */
  hasDisplay?: boolean;
}

function defaultIsTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Comma-string -> array, for threading a raw `--exclude-skills`/`--include-skills` CLI value into the wizard's own preset params (same parsing `commands/install.ts`'s `parseSkillNamesArg()` does for the non-interactive path). `undefined` -> `undefined` (flag not given at all). */
function parseCommaList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Pure "is this invocation non-interactive-capable" gate (spec §6: "enough options provided for
 * non-interactive mode"). Deliberately mirrors the brief's own wording exactly — `(--type` OR
 * `--target)` AND `--yes` — and nothing more: it does NOT also require `--adapters` to be
 * present, because a missing/invalid `--adapters` on an otherwise-sufficient invocation should
 * still fail via the EXISTING `buildInstallResult()` validation error (unchanged exit-1 message),
 * not silently fall into the wizard instead.
 *
 * M7: `--dry-run` ALSO counts as sufficient even without `--yes` — a dry-run never writes and
 * never needs confirmation (`commands/install.ts`'s `buildDryRunResult()` bypasses the `--yes`
 * gate entirely), so gating it behind `--yes` here would incorrectly route a perfectly
 * answerable `--type next --dry-run` on a real TTY into the wizard instead of straight to the
 * plan it asked for.
 */
export function hasSufficientInstallFlags(
  options: Pick<InstallCliOptions, "type" | "targets" | "monorepo" | "yes" | "dryRun">,
): boolean {
  const hasTargetIntent = (options.targets && options.targets.length > 0) || options.monorepo === true;
  const hasTypeOrTarget = Boolean(options.type) || hasTargetIntent;
  return hasTypeOrTarget && (options.yes === true || options.dryRun === true);
}

export async function runInstallEntry(options: InstallEntryOptions): Promise<never> {
  // D30 composition contract: `--emit-schema` prints the schema JSON and exits — no routing, no
  // server, no TTY/display considerations at all.
  if (options.emitSchema) {
    return runEmitSchema({
      type: options.type,
      adapters: options.adapters,
      excludeSkills: Array.isArray(options.excludeSkills) ? options.excludeSkills : parseCommaList(options.excludeSkills),
      includeSkills: Array.isArray(options.includeSkills) ? options.includeSkills : parseCommaList(options.includeSkills),
      targetDir: options.targetDir,
      packsRoot: options.packsRoot,
    });
  }

  const isTTY = options.isTTY ?? defaultIsTTY();

  // D30 web-vs-CLI precedence. `--cli` forces the CLI route (so `wantWeb` is false); `--no-open`
  // makes the box count as display-available (we serve + print the URL, the user opens it).
  const wantWeb = options.web === true && options.cli !== true;
  const hasDisplay =
    options.hasDisplay ?? (options.noOpen === true ? true : detectDisplay(process.env, process.platform));
  const decision = resolveWebPrecedence({ web: wantWeb, yes: options.yes === true, hasDisplay, isTTY });

  if (decision.mode === "error") {
    const message = `install cannot proceed: ${decision.reason}`;
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, command: "install", exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS, summary: message, data: null, errors: [message] })}\n`,
      );
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exit(EXIT_CODES.INVALID_PROFILE_OR_TARGETS);
  }

  if (decision.mode === "web") {
    return runWebInstall({
      json: options.json,
      type: options.type,
      adapters: options.adapters,
      excludeSkills: Array.isArray(options.excludeSkills) ? options.excludeSkills : parseCommaList(options.excludeSkills),
      includeSkills: Array.isArray(options.includeSkills) ? options.includeSkills : parseCommaList(options.includeSkills),
      noOpen: options.noOpen,
      targetDir: options.targetDir,
      packsRoot: options.packsRoot,
      packageVersion: options.packageVersion,
    });
  }

  // decision.mode === "cli": the existing routing decides wizard vs non-interactive.
  const sufficient = hasSufficientInstallFlags(options);

  if (sufficient || !isTTY) {
    return runInstallCommand(options);
  }

  return runInstallWizard({
    json: options.json,
    targetDir: options.targetDir,
    packsRoot: options.packsRoot,
    packageVersion: options.packageVersion,
    prompts: options.wizardPrompts,
    log: options.wizardLog,
    type: options.type,
    targets: options.targets,
    monorepo: options.monorepo,
    adapters: options.adapters,
    yes: options.yes,
    excludeSkills: Array.isArray(options.excludeSkills) ? options.excludeSkills : parseCommaList(options.excludeSkills),
    includeSkills: Array.isArray(options.includeSkills) ? options.includeSkills : parseCommaList(options.includeSkills),
  });
}
