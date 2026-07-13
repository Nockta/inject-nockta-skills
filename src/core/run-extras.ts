import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Extras (spec §7.10, decisions.md D17: "suggest, don't own") — detection + execution core,
 * shared by BOTH the wizard's own final step (`wizard/steps/extras.ts`) and the non-interactive
 * `--with-claude-mem` flag path (`commands/install.ts`). Lives under `core/` (not `wizard/`) for
 * exactly that reason: `commands/install.ts` must never import from `wizard/*` (a one-directional
 * dependency documented in `src/wizard/CONTEXT.md`) — this module is the neutral shared layer
 * both sides depend on instead, same as `core/detect-repo-type.ts` is consumed by the wizard
 * without install.ts needing it.
 *
 * First (only) entry: claude-mem, third-party personal tooling Nockta suggests but does not own.
 * This is the SOLE, explicitly bounded exception to spec §14's safety rules (§14's own closing
 * line + §7.10's closing line, both citing D17): everything here stays inside that exception —
 * machine-scoped (never touches the repo), opt-in, best-effort, never recorded in `.nockta`
 * metadata. `doctor`/`repair`/`upgrade`/`sync` never look at any of this.
 */

export interface ExtrasReport {
  /** Was the user actually asked (interactive) / would they have been, absent already-installed detection (non-interactive, flag given)? `false` when already-installed detection skipped the step entirely. */
  offered: boolean;
  /** Did the user say yes (interactive `confirm`, default No) / was `--with-claude-mem` given (non-interactive)? Always `false` when `offered` is `false`. */
  accepted: boolean;
  /** Did `npx claude-mem install` (or its test override) exit 0? Always `false` when `accepted` is `false`. Never affects the install's own `ok`/`exitCode` — best-effort only (spec §7.10). */
  succeeded: boolean;
}

export interface ExtrasDetectionOptions {
  /** Test-injection only — real runs always use `os.homedir()`. Tests must point this at a fixture dir, never a real user's actual home. */
  homeDir?: string;
}

const CLAUDE_MEM_PLUGIN_PREFIX = "claude-mem@";
const CLAUDE_MEM_MARKETPLACE_DIR_SEGMENTS = [".claude", "plugins", "marketplaces", "thedotmack"];

/**
 * Test-only env override for the home dir detection reads from — the "or env" half of "point
 * detection at a fixture HOME/dir via parameter or env, never the real one". The `homeDir`
 * parameter is the preferred mechanism for in-process (vitest) tests; this env var exists ONLY
 * because process-level tests spawn the BUILT `dist/cli.js` as a real child process, where
 * there is no way to pass a TS-level parameter through — `install-entry-process.test.ts` sets
 * this instead of ever letting the built CLI touch a real user's actual `~/.claude`.
 */
export const EXTRAS_HOME_OVERRIDE_ENV_VAR = "INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME";

/**
 * Pure detection function (unit-tested directly): is claude-mem already installed? Two
 * independent signals, either is sufficient:
 *   1. `~/.claude/settings.json`'s `enabledPlugins` has a key starting `"claude-mem@"` (Claude
 *      Code's plugin settings are keyed `"<plugin>@<marketplace>"`).
 *   2. `~/.claude/plugins/marketplaces/thedotmack` exists (claude-mem's marketplace directory).
 * ANY error reading/parsing either signal (missing file, unreadable, malformed JSON, unexpected
 * shape) is treated as "not installed" for that signal — never thrown, never a crash.
 */
export function isClaudeMemAlreadyInstalled(options: ExtrasDetectionOptions = {}): boolean {
  const home = options.homeDir ?? process.env[EXTRAS_HOME_OVERRIDE_ENV_VAR] ?? homedir();

  try {
    const settingsPath = join(home, ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as { enabledPlugins?: unknown };
    const enabledPlugins = parsed.enabledPlugins;
    const keys: unknown[] = Array.isArray(enabledPlugins)
      ? enabledPlugins
      : enabledPlugins && typeof enabledPlugins === "object"
        ? Object.keys(enabledPlugins as Record<string, unknown>)
        : [];
    if (keys.some((k) => typeof k === "string" && k.startsWith(CLAUDE_MEM_PLUGIN_PREFIX))) {
      return true;
    }
  } catch {
    // missing/unreadable/malformed settings.json -> this signal alone says "not installed"
  }

  try {
    if (existsSync(join(home, ...CLAUDE_MEM_MARKETPLACE_DIR_SEGMENTS))) return true;
  } catch {
    // any fs error on this check -> this signal alone says "not installed" too
  }

  return false;
}

/**
 * Disclosure text shown before running the installer (spec §7.10: "Disclose before running:
 * third-party; modifies global ~/.claude state; background LLM cost; telemetry default-on").
 * Also doubles as the wizard's interactive `confirm()` prompt message.
 */
export const CLAUDE_MEM_DISCLOSURE =
  "Install claude-mem? This is third-party tooling, not part of this repo install — it modifies " +
  "your global ~/.claude state, runs as a background LLM observer with real token cost, and has " +
  "telemetry on by default.";

/**
 * Test/dev override (mirrors `create-nockta-repo/src/core/run-inject-skills.ts`'s
 * `CREATE_NOCKTA_REPO_TEST_INJECT_BIN` — this workspace's existing "spawn `node <fixture path>`
 * instead of the real external binary" convention): when set, `npx claude-mem install` becomes
 * `node <that path> install` instead. Never live `npx` in tests.
 */
export const EXTRAS_BIN_OVERRIDE_ENV_VAR = "INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN";

export interface BuiltExtrasCommand {
  command: string;
  args: string[];
  usesTestOverride: boolean;
}

/** Pure command construction — no spawning (same "resolve first, spawn separately" split as `run-inject-skills.ts`'s `buildInjectSkillsCommand()`). */
export function buildExtrasInstallCommand(): BuiltExtrasCommand {
  const override = process.env[EXTRAS_BIN_OVERRIDE_ENV_VAR];
  if (override) {
    return { command: process.execPath, args: [override, "install"], usesTestOverride: true };
  }
  return { command: "npx", args: ["claude-mem", "install"], usesTestOverride: false };
}

/**
 * Spawns `npx claude-mem install` (or its test override) with INHERITED stdio (brief item 3) —
 * the child's own output goes straight to the real terminal/pipe. Known, accepted boundary (same
 * posture as `src/wizard/CONTEXT.md`'s documented `--json` + real-TTY-prompt-rendering tension):
 * this can interleave with a `--json` consumer's single-line-stdout contract when extras actually
 * runs, because "inherited stdio" is what the brief and spec §7.10 explicitly ask for, not
 * something this function silently buffers away.
 *
 * BEST-EFFORT (spec §7.10): never throws. A spawn error or nonzero exit both just resolve to
 * `false` — the caller is responsible for warning and for never letting this affect the install's
 * own exit code.
 */
export function runClaudeMemInstall(): boolean {
  const built = buildExtrasInstallCommand();
  try {
    const result = spawnSync(built.command, built.args, { stdio: "inherit" });
    return result.error === undefined && result.status === 0;
  } catch {
    return false;
  }
}

const ALREADY_INSTALLED_REPORT: ExtrasReport = { offered: false, accepted: false, succeeded: false };
export const EXTRAS_DECLINED_REPORT: ExtrasReport = { offered: true, accepted: false, succeeded: false };

/** Shared warning text appended to `InstallData.warnings` on extras failure — one string, used by both callers, so JSON/human output is identical regardless of interactive vs. non-interactive. */
export const EXTRAS_FAILURE_WARNING =
  "extras: claude-mem install did not complete successfully (best-effort — this install is unaffected)";

/**
 * Non-interactive variant — only ever called when `--with-claude-mem` was explicitly given (brief
 * item 4: absent -> extras never runs at all, this function is never even called). No prompt: the
 * flag itself IS the accept. Already-installed detection still applies (spec §7.10 rule, not
 * TTY-conditional).
 */
export function runExtrasNonInteractive(options: ExtrasDetectionOptions = {}): ExtrasReport {
  if (isClaudeMemAlreadyInstalled(options)) {
    return ALREADY_INSTALLED_REPORT;
  }
  const succeeded = runClaudeMemInstall();
  return { offered: true, accepted: true, succeeded };
}

/**
 * Interactive core (no `WizardPrompts` dependency here — that thin wrapper lives in
 * `wizard/steps/extras.ts`, the only place allowed to import `WizardPrompts`). Exposed so the
 * wizard step doesn't have to duplicate the already-installed short-circuit.
 */
export function checkAlreadyInstalledReport(options: ExtrasDetectionOptions = {}): ExtrasReport | null {
  return isClaudeMemAlreadyInstalled(options) ? ALREADY_INSTALLED_REPORT : null;
}
