import pc from "picocolors";
import { readProfileForMaintenance } from "../core/profile-guard.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { readTargetsFile } from "../core/read-targets.js";
import { repairAdapters } from "../core/repair-adapters.js";
import { repairMonorepoAdapters } from "../core/repair-adapters-monorepo.js";
import { shopifyTelemetryNoticesForWrittenRecords } from "../core/shopify-telemetry-notice.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { JsonResult } from "../types/json-result.js";

export interface RepairCliOptions {
  json?: boolean;
  force?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own running version. */
  packageVersion?: string;
}

export interface RepairData {
  targetDir: string;
  force: boolean;
  restored: string[];
  refreshed: string[];
  skippedModified: string[];
  forcedOverwrites: string[];
  unchangedIntactCount: number;
  manifestPath: string | null;
  /** RED-1 disclosure (packs-redistribution-audit.md) — see `core/shopify-telemetry-notice.ts`. */
  notices: string[];
}

export type RepairResult = JsonResult & { command: "repair"; data: RepairData };

function emptyData(targetDir: string, force: boolean): RepairData {
  return {
    targetDir,
    force,
    restored: [],
    refreshed: [],
    skippedModified: [],
    forcedOverwrites: [],
    unchangedIntactCount: 0,
    manifestPath: null,
    notices: [],
  };
}

/**
 * `repair` core (spec §7.5, §13.3, decisions.md D3): recreates missing
 * generated files, safely refreshes stale-by-source files, WARNS on (never
 * overwrites) user-modified files unless `--force`, never touches unknown
 * files. Same pure/impure split as `install.ts`: real filesystem I/O, no
 * `process.stdout`/`process.exit`.
 *
 * Exit code philosophy (same precedent as `list.ts`'s always-0 for
 * "planned" packs): a repair run that completes and reports skipped
 * user-modified files is a CORRECT, successful repair — not a failure —
 * because that is exactly the safety behavior spec §14 requires. Exit 0
 * whenever the run completes; a bad/missing profile is the only failure
 * mode (exit 1).
 */
export function buildRepairResult(options: RepairCliOptions): RepairResult {
  const targetDir = options.targetDir ?? process.cwd();
  const force = Boolean(options.force);
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();

  const guard = readProfileForMaintenance(targetDir);

  if (guard.status === "missing") {
    const message = "no .nockta/skills-profile.json found — run `install` first";
    return {
      ok: false,
      command: "repair",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data: emptyData(targetDir, force),
      errors: [message],
    };
  }
  if (guard.status === "invalid") {
    const message = ".nockta/skills-profile.json exists but is invalid or unparsable";
    return {
      ok: false,
      command: "repair",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data: emptyData(targetDir, force),
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
        command: "repair",
        exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
        summary: message,
        data: emptyData(targetDir, force),
        errors: [message],
      };
    }

    const monorepoResult = repairMonorepoAdapters({
      targetDir,
      packsRoot: options.packsRoot,
      packageVersion,
      force,
      profile: guard.profile,
      targets,
    });

    return buildRepairSuccessResult(targetDir, force, monorepoResult);
  }

  const result = repairAdapters({
    targetDir,
    packsRoot: options.packsRoot,
    packageVersion,
    force,
    profile: guard.profile,
  });

  return buildRepairSuccessResult(targetDir, force, result);
}

/**
 * Shared success-path result builder for BOTH single-project (`repairAdapters()`) and monorepo
 * (`repairMonorepoAdapters()`) results — structurally identical `ApplyRenderPlanResult &
 * { manifestPath }` shape, spec §7.5/§13.3/decisions.md D3 exit-code philosophy (see doc
 * comment above `buildRepairResult`).
 */
function buildRepairSuccessResult(
  targetDir: string,
  force: boolean,
  result: {
    restored: string[];
    refreshed: string[];
    skippedModified: string[];
    forcedOverwrites: string[];
    unchangedIntact: string[];
    manifestPath: string;
    records: { path: string; pack: string }[];
  },
): RepairResult {

  const written = [...result.restored, ...result.refreshed, ...result.forcedOverwrites];

  const data: RepairData = {
    targetDir,
    force,
    restored: result.restored,
    refreshed: result.refreshed,
    skippedModified: result.skippedModified,
    forcedOverwrites: result.forcedOverwrites,
    unchangedIntactCount: result.unchangedIntact.length,
    manifestPath: result.manifestPath,
    notices: shopifyTelemetryNoticesForWrittenRecords(result.records, written),
  };

  const summary =
    `repaired: ${data.restored.length} restored, ${data.refreshed.length} refreshed, ` +
    `${data.forcedOverwrites.length} force-overwritten` +
    (data.skippedModified.length > 0
      ? `; WARNING: ${data.skippedModified.length} user-modified file(s) skipped (use --force to overwrite)`
      : "");

  return { ok: true, command: "repair", exitCode: EXIT_CODES.SUCCESS, summary, data };
}

/** Pure text formatter for human (non-`--json`) `repair` output. */
export function formatRepairHuman(result: RepairResult): string {
  const lines: string[] = [];
  const badge = result.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`${badge} ${result.summary}`);

  if (result.data.restored.length > 0) {
    lines.push("", pc.bold("Restored:"));
    for (const p of result.data.restored) lines.push(`  ${p}`);
  }
  if (result.data.refreshed.length > 0) {
    lines.push("", pc.bold("Refreshed (stale):"));
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
  if (result.data.manifestPath) lines.push("", `Manifest: ${result.data.manifestPath}`);
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
 * `inject-nockta-skills repair` — recreates missing/damaged generated
 * adapter outputs (spec §7.5).
 */
export function runRepairCommand(options: RepairCliOptions): never {
  const result = buildRepairResult(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatRepairHuman(result));
  }

  process.exit(result.exitCode);
}
