import pc from "picocolors";
import { runSyncOrchestration } from "../core/sync-orchestrator.js";
import type { SyncMode, SyncPlan } from "../core/sync-orchestrator.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { JsonResult } from "../types/json-result.js";
import type { ClassificationCounts, SuggestedAction } from "../types/doctor.js";

export interface SyncCliOptions {
  json?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own running version. */
  packageVersion?: string;
  /** Test-injection only — defaults to a real TTY check (`process.stdin.isTTY && process.stdout.isTTY`). */
  isTTY?: boolean;
  /** Test-injection only — replaces the real `@inquirer/prompts` confirm() call. */
  confirmFn?: (message: string) => Promise<boolean>;
}

interface DoctorSummary {
  profileStatus: "missing" | "invalid" | "ok" | "ok-monorepo";
  isMonorepo: boolean;
  healthy: boolean;
  counts: ClassificationCounts;
  suggestedAction: SuggestedAction;
}

export interface SyncData {
  targetDir: string;
  mode: SyncMode;
  applied: boolean;
  declined: boolean;
  plan: SyncPlan;
  doctorBefore: DoctorSummary;
  doctorAfter: DoctorSummary;
  repair?: {
    restored: string[];
    refreshed: string[];
    skippedModified: string[];
    forcedOverwrites: string[];
  };
  upgrade?: {
    previousVersion: string;
    newVersion: string;
    restored: string[];
    refreshed: string[];
    skippedModified: string[];
    forcedOverwrites: string[];
  };
}

export type SyncResult = JsonResult & { command: "sync"; data: SyncData };

function summarize(report: { profileStatus: DoctorSummary["profileStatus"]; isMonorepo: boolean; healthy: boolean; counts: ClassificationCounts; suggestedAction: SuggestedAction }): DoctorSummary {
  return { profileStatus: report.profileStatus, isMonorepo: report.isMonorepo, healthy: report.healthy, counts: report.counts, suggestedAction: report.suggestedAction };
}

function defaultIsTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * `sync` core (spec §7.7, §13.5, decisions.md D10) — the async orchestrator
 * wrapper. Same pure/impure split as the other commands, except async
 * (interactive mode awaits a confirmation prompt). No `process.stdout`/
 * `process.exit` here, so tests call this directly.
 */
export async function buildSyncResult(options: SyncCliOptions): Promise<SyncResult> {
  const targetDir = options.targetDir ?? process.cwd();
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();
  const isTTY = options.isTTY ?? defaultIsTTY();

  const outcome = await runSyncOrchestration({
    targetDir,
    packsRoot: options.packsRoot,
    packageVersion,
    isTTY,
    yes: options.yes,
    dryRun: options.dryRun,
    confirmFn: options.confirmFn,
  });

  const data: SyncData = {
    targetDir,
    mode: outcome.mode,
    applied: outcome.applied,
    declined: outcome.declined,
    plan: outcome.plan,
    doctorBefore: summarize(outcome.doctorBefore),
    doctorAfter: summarize(outcome.doctorAfter),
    repair: outcome.repairResult
      ? {
          restored: outcome.repairResult.restored,
          refreshed: outcome.repairResult.refreshed,
          skippedModified: outcome.repairResult.skippedModified,
          forcedOverwrites: outcome.repairResult.forcedOverwrites,
        }
      : undefined,
    upgrade: outcome.upgradeResult
      ? {
          previousVersion: outcome.upgradeResult.previousVersion,
          newVersion: outcome.upgradeResult.newVersion,
          restored: outcome.upgradeResult.restored,
          refreshed: outcome.upgradeResult.refreshed,
          skippedModified: outcome.upgradeResult.skippedModified,
          forcedOverwrites: outcome.upgradeResult.forcedOverwrites,
        }
      : undefined,
  };

  // Profile missing/invalid, or (monorepo) targets.json missing/invalid: sync cannot act at all
  // (spec §7.7 "if profile is missing: guide user to install wizard"; M5's
  // `buildSyncPlan()`/`plan.needsInstall` folds the targets.json case into the same bucket).
  if (outcome.plan.needsInstall) {
    const message =
      outcome.doctorBefore.profileStatus === "missing"
        ? "no .nockta/skills-profile.json found — run `install` first"
        : outcome.doctorBefore.profileStatus === "invalid"
          ? ".nockta/skills-profile.json exists but is invalid or unparsable"
          : "monorepo profile found but .nockta/targets.json is missing or invalid — run `install` again";
    return {
      ok: false,
      command: "sync",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data,
      errors: [message],
    };
  }

  if (outcome.mode === "no-op") {
    return { ok: true, command: "sync", exitCode: EXIT_CODES.SUCCESS, summary: "healthy and current — nothing to do", data };
  }

  if (outcome.mode === "dry-run") {
    const summary = `dry run — plan only, wrote nothing (repair: ${outcome.plan.needsRepair}, upgrade: ${outcome.plan.needsUpgrade})`;
    return { ok: false, command: "sync", exitCode: EXIT_CODES.SYNC_ACTION_REQUIRED, summary, data, errors: [summary] };
  }

  if (outcome.mode === "plan-only") {
    const summary =
      `action required (non-interactive, no --yes) — repair: ${outcome.plan.needsRepair}, ` +
      `upgrade: ${outcome.plan.needsUpgrade}; wrote nothing`;
    return { ok: false, command: "sync", exitCode: EXIT_CODES.SYNC_ACTION_REQUIRED, summary, data, errors: [summary] };
  }

  if (outcome.declined) {
    const summary = "user declined the confirmation prompt — no changes made";
    return { ok: false, command: "sync", exitCode: EXIT_CODES.SYNC_ACTION_REQUIRED, summary, data, errors: [summary] };
  }

  // mode === "auto-apply" or interactive-confirmed: applied.
  const healthy = outcome.doctorAfter.healthy;
  const summary = healthy
    ? `synced successfully — now healthy and current (${outcome.mode})`
    : `synced but issues remain (e.g. user-modified files skipped without --force) — ${outcome.mode}`;
  return {
    ok: healthy,
    command: "sync",
    exitCode: healthy ? EXIT_CODES.SUCCESS : EXIT_CODES.SYNC_ACTION_REQUIRED,
    summary,
    data,
    errors: healthy ? undefined : [summary],
  };
}

/** Pure text formatter for human (non-`--json`) `sync` output. */
export function formatSyncHuman(result: SyncResult): string {
  const lines: string[] = [];
  const badge = result.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`${badge} ${result.summary}`);
  lines.push(`  mode: ${result.data.mode}`);
  lines.push(`  plan: needsInstall=${result.data.plan.needsInstall} needsRepair=${result.data.plan.needsRepair} needsUpgrade=${result.data.plan.needsUpgrade}`);
  if (result.data.repair) {
    lines.push("", pc.bold("Repair applied:"));
    lines.push(`  restored: ${result.data.repair.restored.length}, refreshed: ${result.data.repair.refreshed.length}`);
  }
  if (result.data.upgrade) {
    lines.push("", pc.bold(`Upgrade applied: ${result.data.upgrade.previousVersion} -> ${result.data.upgrade.newVersion}`));
    lines.push(`  restored: ${result.data.upgrade.restored.length}, refreshed: ${result.data.upgrade.refreshed.length}`);
  }
  if (result.errors && result.errors.length > 0) {
    lines.push("", pc.red("Errors:"));
    for (const e of result.errors) lines.push(pc.red(`  ${e}`));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * `inject-nockta-skills sync` — the D10 orchestrator: doctor -> repair/
 * upgrade as needed, per the confirmation policy (spec §7.7,
 * decisions.md D10). Async (`process.exit` still terminates the process).
 */
export async function runSyncCommand(options: SyncCliOptions): Promise<never> {
  const result = await buildSyncResult(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatSyncHuman(result));
  }

  process.exit(result.exitCode);
}
