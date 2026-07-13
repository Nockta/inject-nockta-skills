import pc from "picocolors";
import { readProfileForMaintenance } from "../core/profile-guard.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { readTargetsFile } from "../core/read-targets.js";
import { upgradeAdapters } from "../core/upgrade-adapters.js";
import { upgradeMonorepoAdapters } from "../core/upgrade-adapters-monorepo.js";
import { shopifyTelemetryNoticesForWrittenRecords } from "../core/shopify-telemetry-notice.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { JsonResult } from "../types/json-result.js";

export interface UpgradeCliOptions {
  json?: boolean;
  force?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own running version. */
  packageVersion?: string;
}

export interface UpgradeData {
  targetDir: string;
  force: boolean;
  previousVersion: string | null;
  newVersion: string;
  restored: string[];
  refreshed: string[];
  skippedModified: string[];
  forcedOverwrites: string[];
  unchangedIntactCount: number;
  profilePath: string | null;
  manifestPath: string | null;
  /** RED-1 disclosure (packs-redistribution-audit.md) — see `core/shopify-telemetry-notice.ts`. */
  notices: string[];
}

export type UpgradeResult = JsonResult & { command: "upgrade"; data: UpgradeData };

function emptyData(targetDir: string, force: boolean, newVersion: string): UpgradeData {
  return {
    targetDir,
    force,
    previousVersion: null,
    newVersion,
    restored: [],
    refreshed: [],
    skippedModified: [],
    forcedOverwrites: [],
    unchangedIntactCount: 0,
    profilePath: null,
    manifestPath: null,
    notices: [],
  };
}

/**
 * `upgrade` core (spec §7.6, §13.4): re-renders ALL generated output using
 * the currently running package version, refuses to clobber modified files
 * without `--force`, updates the profile's version/source.version/updatedAt,
 * and reports the old->new version delta. Same pure/impure split and exit
 * code philosophy as `repair.ts` (skipped-modified is a correct, warned
 * outcome — not a failure).
 */
export function buildUpgradeResult(options: UpgradeCliOptions): UpgradeResult {
  const targetDir = options.targetDir ?? process.cwd();
  const force = Boolean(options.force);
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();

  const guard = readProfileForMaintenance(targetDir);

  if (guard.status === "missing") {
    const message = "no .nockta/skills-profile.json found — run `install` first";
    return {
      ok: false,
      command: "upgrade",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data: emptyData(targetDir, force, packageVersion),
      errors: [message],
    };
  }
  if (guard.status === "invalid") {
    const message = ".nockta/skills-profile.json exists but is invalid or unparsable";
    return {
      ok: false,
      command: "upgrade",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data: emptyData(targetDir, force, packageVersion),
      errors: [message],
    };
  }
  if (guard.status === "ok-monorepo") {
    const targets = readTargetsFile(targetDir);
    if (!targets) {
      const message =
        "monorepo profile found but .nockta/targets.json is missing or invalid — run `install` again";
      return {
        ok: false,
        command: "upgrade",
        exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
        summary: message,
        data: emptyData(targetDir, force, packageVersion),
        errors: [message],
      };
    }

    const monorepoResult = upgradeMonorepoAdapters({
      targetDir,
      packsRoot: options.packsRoot,
      packageVersion,
      force,
      profile: guard.profile,
      targets,
    });

    return buildUpgradeSuccessResult(targetDir, force, monorepoResult);
  }

  const result = upgradeAdapters({
    targetDir,
    packsRoot: options.packsRoot,
    packageVersion,
    force,
    profile: guard.profile,
  });

  return buildUpgradeSuccessResult(targetDir, force, result);
}

/**
 * Shared success-path result builder for BOTH single-project (`upgradeAdapters()`) and
 * monorepo (`upgradeMonorepoAdapters()`) results — structurally identical
 * `ApplyRenderPlanResult & { manifestPath; profilePath; previousVersion; newVersion }` shape.
 */
function buildUpgradeSuccessResult(
  targetDir: string,
  force: boolean,
  result: {
    previousVersion: string;
    newVersion: string;
    restored: string[];
    refreshed: string[];
    skippedModified: string[];
    forcedOverwrites: string[];
    unchangedIntact: string[];
    profilePath: string;
    manifestPath: string;
    records: { path: string; pack: string }[];
  },
): UpgradeResult {
  const written = [...result.restored, ...result.refreshed, ...result.forcedOverwrites];

  const data: UpgradeData = {
    targetDir,
    force,
    previousVersion: result.previousVersion,
    newVersion: result.newVersion,
    restored: result.restored,
    refreshed: result.refreshed,
    skippedModified: result.skippedModified,
    forcedOverwrites: result.forcedOverwrites,
    unchangedIntactCount: result.unchangedIntact.length,
    profilePath: result.profilePath,
    manifestPath: result.manifestPath,
    notices: shopifyTelemetryNoticesForWrittenRecords(result.records, written),
  };

  const summary =
    `upgraded ${data.previousVersion} -> ${data.newVersion}: ${data.restored.length} restored, ` +
    `${data.refreshed.length} refreshed, ${data.forcedOverwrites.length} force-overwritten` +
    (data.skippedModified.length > 0
      ? `; WARNING: ${data.skippedModified.length} user-modified file(s) skipped (use --force to overwrite)`
      : "");

  return { ok: true, command: "upgrade", exitCode: EXIT_CODES.SUCCESS, summary, data };
}

/** Pure text formatter for human (non-`--json`) `upgrade` output. */
export function formatUpgradeHuman(result: UpgradeResult): string {
  const lines: string[] = [];
  const badge = result.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`${badge} ${result.summary}`);

  if (result.data.restored.length > 0) {
    lines.push("", pc.bold("Restored:"));
    for (const p of result.data.restored) lines.push(`  ${p}`);
  }
  if (result.data.refreshed.length > 0) {
    lines.push("", pc.bold("Refreshed:"));
    for (const p of result.data.refreshed) lines.push(`  ${p}`);
  }
  if (result.data.forcedOverwrites.length > 0) {
    lines.push("", pc.yellow("Force-overwritten:"));
    for (const p of result.data.forcedOverwrites) lines.push(pc.yellow(`  ${p}`));
  }
  if (result.data.skippedModified.length > 0) {
    lines.push("", pc.yellow("WARNING — user-modified, NOT overwritten (use --force):"));
    for (const p of result.data.skippedModified) lines.push(pc.yellow(`  ${p}`));
  }
  if (result.data.profilePath) lines.push("", `Profile: ${result.data.profilePath}`);
  if (result.data.manifestPath) lines.push(`Manifest: ${result.data.manifestPath}`);
  if (result.data.notices.length > 0) {
    lines.push("");
    for (const n of result.data.notices) lines.push(pc.dim(n));
  }
  if (result.errors && result.errors.length > 0) {
    lines.push("", pc.red("Errors:"));
    for (const e of result.errors) lines.push(pc.red(`  ${e}`));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * `inject-nockta-skills upgrade` — re-renders adapter outputs using the
 * currently running package version (spec §7.6).
 */
export function runUpgradeCommand(options: UpgradeCliOptions): never {
  const result = buildUpgradeResult(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatUpgradeHuman(result));
  }

  process.exit(result.exitCode);
}
