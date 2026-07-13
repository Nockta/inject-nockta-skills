import { runDoctorChecks } from "./doctor-checks.js";
import { repairAdapters } from "./repair-adapters.js";
import { upgradeAdapters } from "./upgrade-adapters.js";
import { repairMonorepoAdapters } from "./repair-adapters-monorepo.js";
import { upgradeMonorepoAdapters } from "./upgrade-adapters-monorepo.js";
import { readTargetsFile } from "./read-targets.js";
import type { RepairAdaptersResult } from "./repair-adapters.js";
import type { UpgradeAdaptersResult } from "./upgrade-adapters.js";
import type { DoctorReport } from "../types/doctor.js";
import type { NocktaMonorepoSkillsProfile, NocktaSkillsProfile } from "../types/profile.js";

/**
 * `sync`'s decision tree (spec §7.7, §13.5, decisions.md D10) — a PURE
 * function so the full mode matrix is unit-testable without touching a
 * real TTY, `@inquirer/prompts`, or the filesystem. `healthy` wins over
 * every flag: a current, healthy repo is a no-op regardless of
 * `--dry-run`/`--yes`/interactivity (spec §18 "no-op when healthy/current").
 */
export type SyncMode = "no-op" | "dry-run" | "interactive" | "auto-apply" | "plan-only";

export interface DecideSyncModeOptions {
  healthy: boolean;
  isTTY: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

export function decideSyncMode(options: DecideSyncModeOptions): SyncMode {
  if (options.healthy) return "no-op";
  if (options.dryRun) return "dry-run";
  if (options.isTTY) return "interactive";
  if (options.yes) return "auto-apply";
  return "plan-only";
}

export interface SyncPlan {
  /** Profile missing/invalid (or, monorepo: targets.json missing/invalid) — sync cannot repair/upgrade; guide to `install`. */
  needsInstall: boolean;
  /** Profile's `source.version` differs from the currently running package version. */
  needsUpgrade: boolean;
  /** File-level issues (missing/modified/stale-by-source) at the CURRENT version. */
  needsRepair: boolean;
}

export function buildSyncPlan(doctor: DoctorReport): SyncPlan {
  if (doctor.profileStatus === "missing" || doctor.profileStatus === "invalid") {
    return { needsInstall: true, needsUpgrade: false, needsRepair: false };
  }
  if (doctor.isMonorepo && doctor.targetsStatus !== "ok") {
    // targets.json missing/invalid — repair/upgrade cannot recreate it (M5 brief item 4: they
    // operate on root-rendered outputs "using the monorepo profile", which needs a valid
    // targets.json to resolve the union canonical plan from). Guide to reinstall instead,
    // matching monorepo-doctor-checks.ts's own suggestedAction for this case.
    return { needsInstall: true, needsUpgrade: false, needsRepair: false };
  }
  const needsUpgrade = doctor.profile !== null && doctor.profile.source.version !== doctor.packageVersion;
  const needsRepair =
    !needsUpgrade && (!doctor.manifestValid || doctor.counts.missing > 0 || doctor.counts.modified > 0 || doctor.counts.stale > 0);
  return { needsInstall: false, needsUpgrade, needsRepair };
}

export interface RunSyncOptions {
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  isTTY: boolean;
  yes?: boolean;
  dryRun?: boolean;
  /** Test-injection: replaces the real `@inquirer/prompts` `confirm()` call — keeps the interactive
   * path unit-testable in-process without a real TTY (see M4 brief: process-level tests are for the
   * non-interactive paths only, so a prompt-hang fails fast rather than hanging CI). */
  confirmFn?: (message: string) => Promise<boolean>;
}

export interface SyncOutcome {
  mode: SyncMode;
  applied: boolean;
  declined: boolean;
  plan: SyncPlan;
  doctorBefore: DoctorReport;
  doctorAfter: DoctorReport;
  repairResult?: RepairAdaptersResult;
  upgradeResult?: UpgradeAdaptersResult;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const { confirm } = await import("@inquirer/prompts");
  return confirm({ message });
}

/**
 * `sync` orchestrator (spec §7.7, §13.5, decisions.md D10): runs doctor,
 * decides the minimum necessary action (upgrade supersedes repair when
 * both would otherwise apply — an upgrade re-render already restores
 * missing/stale files, so running repair afterward would find nothing left
 * to do; spec §13.5 "minimum necessary action"), and applies it per
 * `decideSyncMode()`'s policy. Never applies anything in `"dry-run"` or
 * `"plan-only"` mode (writes nothing — spec §14).
 *
 * M5, new: dispatches to the monorepo repair/upgrade cores when
 * `doctorBefore.isMonorepo` is true (`runDoctorChecks()` — via
 * `profile-guard.ts`'s `"ok-monorepo"` status — already produced a unified
 * `DoctorReport` regardless of mode, so the rest of this function's control
 * flow is unchanged from M4).
 */
export async function runSyncOrchestration(options: RunSyncOptions): Promise<SyncOutcome> {
  const doctorBefore = runDoctorChecks({
    targetDir: options.targetDir,
    packsRoot: options.packsRoot,
    packageVersion: options.packageVersion,
  });

  const plan = buildSyncPlan(doctorBefore);
  const mode = decideSyncMode({ healthy: doctorBefore.healthy, isTTY: options.isTTY, yes: options.yes, dryRun: options.dryRun });

  const base: SyncOutcome = { mode, applied: false, declined: false, plan, doctorBefore, doctorAfter: doctorBefore };

  if (mode === "no-op" || mode === "dry-run" || plan.needsInstall) {
    return base;
  }

  if (mode === "plan-only") {
    return base;
  }

  let proceed = true;
  if (mode === "interactive") {
    const confirmFn = options.confirmFn ?? defaultConfirm;
    proceed = await confirmFn(
      `sync found issues (repair: ${plan.needsRepair}, upgrade: ${plan.needsUpgrade}). Apply now?`,
    );
    if (!proceed) {
      return { ...base, declined: true };
    }
  }

  // mode is "auto-apply", or "interactive" with confirmation — apply now.
  let repairResult: RepairAdaptersResult | undefined;
  let upgradeResult: UpgradeAdaptersResult | undefined;

  if (doctorBefore.isMonorepo) {
    const profile = doctorBefore.profile as NocktaMonorepoSkillsProfile;
    const targets = readTargetsFile(options.targetDir);
    // `plan.needsInstall` (checked above) already guards `targetsStatus !== "ok"`, so `targets`
    // is guaranteed defined here — the cast documents that invariant rather than re-deriving it.
    if (targets) {
      if (plan.needsUpgrade) {
        upgradeResult = upgradeMonorepoAdapters({
          targetDir: options.targetDir,
          packsRoot: options.packsRoot,
          packageVersion: options.packageVersion,
          force: false,
          profile,
          targets,
        });
      } else if (plan.needsRepair) {
        repairResult = repairMonorepoAdapters({
          targetDir: options.targetDir,
          packsRoot: options.packsRoot,
          packageVersion: options.packageVersion,
          force: false,
          profile,
          targets,
        });
      }
    }
  } else {
    const profile = doctorBefore.profile as NocktaSkillsProfile;
    if (plan.needsUpgrade) {
      upgradeResult = upgradeAdapters({
        targetDir: options.targetDir,
        packsRoot: options.packsRoot,
        packageVersion: options.packageVersion,
        force: false,
        profile,
      });
    } else if (plan.needsRepair) {
      repairResult = repairAdapters({
        targetDir: options.targetDir,
        packsRoot: options.packsRoot,
        packageVersion: options.packageVersion,
        force: false,
        profile,
      });
    }
  }

  const doctorAfter = runDoctorChecks({
    targetDir: options.targetDir,
    packsRoot: options.packsRoot,
    packageVersion: options.packageVersion,
  });

  return { ...base, applied: true, doctorAfter, repairResult, upgradeResult };
}
