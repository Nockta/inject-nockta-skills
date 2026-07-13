import pc from "picocolors";
import { runDoctorChecks } from "../core/doctor-checks.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { EXIT_CODES } from "../types/json-result.js";
import type { JsonResult } from "../types/json-result.js";
import type { ClassificationCounts, ClassifiedFile, SuggestedAction, TargetCheckResult } from "../types/doctor.js";
import { EMPTY_SKILL_SELECTION } from "../types/skill-selection.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";

export interface DoctorCliOptions {
  json?: boolean;
  /** Test-injection only — real CLI runs always use `process.cwd()`. */
  targetDir?: string;
  /** Test-injection only — defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Test-injection only — defaults to this package's own running version. */
  packageVersion?: string;
}

export interface DoctorData {
  targetDir: string;
  profileStatus: "missing" | "invalid" | "ok" | "ok-monorepo";
  isMonorepo: boolean;
  healthy: boolean;
  packageVersion: string;
  profileVersion: string | null;
  counts: ClassificationCounts;
  files: ClassifiedFile[];
  unknownFiles: string[];
  suggestedAction: SuggestedAction;
  /** Monorepo only (spec §9.5) — targets.json validation + per-target existence/plausibility. */
  targetsStatus: "missing" | "invalid" | "ok" | "n/a";
  targets: TargetCheckResult[];
  /** The stored skill-selection deltas (decisions.md D19) doctor computed the effective set FROM — `EMPTY_SKILL_SELECTION` when no profile was found. Deselected skills are NOT reported as "missing" (see `src/core/CONTEXT.md`'s merge policy) — this field is what makes that intentional-vs-accidental distinction visible in `doctor --json`. */
  skillSelection: SkillSelectionDeltas;
}

export type DoctorResult = JsonResult & { command: "doctor"; data: DoctorData };

/**
 * Pure(ish) computation of the `doctor` result (spec §7.4, §10.3, §13.2).
 * Read-only — never writes anything. Same pure/impure split as
 * `install.ts`/`list.ts`: no `process.stdout`/`process.exit` here, so
 * tests call this directly.
 */
export function buildDoctorResult(options: DoctorCliOptions): DoctorResult {
  const targetDir = options.targetDir ?? process.cwd();
  const packageVersion = options.packageVersion ?? readRunningPackageVersion();

  const report = runDoctorChecks({ targetDir, packsRoot: options.packsRoot, packageVersion });

  const data: DoctorData = {
    targetDir,
    profileStatus: report.profileStatus,
    isMonorepo: report.isMonorepo,
    healthy: report.healthy,
    packageVersion,
    profileVersion: report.profile?.source.version ?? null,
    counts: report.counts,
    files: report.files,
    unknownFiles: report.unknownFiles,
    suggestedAction: report.suggestedAction,
    targetsStatus: report.targetsStatus,
    targets: report.targets,
    skillSelection: report.profile?.skillSelection ?? EMPTY_SKILL_SELECTION,
  };

  if (report.profileStatus === "missing") {
    const message = "no .nockta/skills-profile.json found — run `install` first";
    return {
      ok: false,
      command: "doctor",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data,
      errors: [message],
    };
  }
  if (report.profileStatus === "invalid") {
    const message = ".nockta/skills-profile.json exists but is invalid or unparsable";
    return {
      ok: false,
      command: "doctor",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data,
      errors: [message],
    };
  }
  if (report.targetsStatus === "missing" || report.targetsStatus === "invalid") {
    const message =
      report.targetsStatus === "missing"
        ? "monorepo profile found but .nockta/targets.json is missing — run `install` again"
        : ".nockta/targets.json exists but is invalid or unparsable — run `install` again";
    return {
      ok: false,
      command: "doctor",
      exitCode: EXIT_CODES.INVALID_PROFILE_OR_TARGETS,
      summary: message,
      data,
      errors: [message],
    };
  }

  if (report.healthy) {
    const unknownNote = report.counts.unknown > 0 ? `; ${report.counts.unknown} unknown file(s) (informational)` : "";
    const targetsNote = report.isMonorepo ? `; ${report.targets.length} target(s) OK` : "";
    const summary = `healthy — ${report.counts.intact} file(s) intact, current at v${packageVersion}${unknownNote}${targetsNote}`;
    return { ok: true, command: "doctor", exitCode: EXIT_CODES.SUCCESS, summary, data };
  }

  const targetIssueCount = report.targets.filter((t) => !t.exists || !t.plausible).length;
  const targetsNote = report.isMonorepo && targetIssueCount > 0 ? `, ${targetIssueCount} target(s) with issues` : "";
  const summary =
    `issues found — ${report.counts.missing} missing, ${report.counts.modified} modified, ` +
    `${report.counts.stale} stale, ${report.counts.unknown} unknown${targetsNote}; suggested action: ${report.suggestedAction}`;
  return {
    ok: false,
    command: "doctor",
    exitCode: EXIT_CODES.SYNC_ACTION_REQUIRED,
    summary,
    data,
    errors: [summary],
  };
}

/** Pure text formatter for human (non-`--json`) `doctor` output. */
export function formatDoctorHuman(result: DoctorResult): string {
  const lines: string[] = [];
  const badge = result.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`${badge} ${result.summary}`);

  if (result.data.profileStatus === "ok" || result.data.profileStatus === "ok-monorepo") {
    lines.push("");
    lines.push(pc.bold("Classification counts:"));
    for (const [cls, count] of Object.entries(result.data.counts)) {
      lines.push(`  ${cls}: ${count}`);
    }
    const nonIntact = result.data.files.filter((f) => f.classification !== "intact");
    if (nonIntact.length > 0) {
      lines.push("", pc.bold("Files needing attention:"));
      for (const f of nonIntact) {
        lines.push(`  [${f.classification}] ${f.path}${f.detail ? ` — ${f.detail}` : ""}`);
      }
    }
    if (result.data.unknownFiles.length > 0) {
      lines.push("", pc.dim("Unknown (untracked) files — never touched by repair/upgrade:"));
      for (const path of result.data.unknownFiles) lines.push(pc.dim(`  ${path}`));
    }
    if (result.data.isMonorepo) {
      lines.push("", pc.bold(`Targets (${result.data.targets.length}):`));
      for (const t of result.data.targets) {
        const ok = t.exists && t.plausible;
        const badge = ok ? pc.green("✓") : pc.red("✗");
        lines.push(`  ${badge} ${t.name} (${t.path}, ${t.repoTypes.join("+")})`);
        for (const issue of t.issues) lines.push(pc.red(`      ${issue}`));
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * `inject-nockta-skills doctor` — validates the current installation state
 * against `.nockta/generated-manifest.json` (spec §7.4).
 */
export function runDoctorCommand(options: DoctorCliOptions): never {
  const result = buildDoctorResult(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatDoctorHuman(result));
  }

  process.exit(result.exitCode);
}
