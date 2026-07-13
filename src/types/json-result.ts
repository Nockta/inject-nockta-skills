/**
 * Machine interface contract shared by every command's `--json` mode.
 *
 * This shape and the exit code scheme are a stable public contract
 * (semver-relevant) per decisions.md D13: `create-nockta-repo` spawns
 * this CLI as a child process and depends on it.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §7.9
 */
export type CliCommandName = "install" | "doctor" | "repair" | "upgrade" | "sync" | "list";

export interface JsonResult {
  ok: boolean;
  command: CliCommandName;
  exitCode: number;
  summary: string;
  data: unknown;
  errors?: string[];
}

/** Exit code scheme, shared across all commands (spec §7.9). */
export const EXIT_CODES = {
  SUCCESS: 0,
  INVALID_PROFILE_OR_TARGETS: 1,
  MISSING_PACKS: 2,
  RENDER_FAILURE: 3,
  SYNC_ACTION_REQUIRED: 4,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
