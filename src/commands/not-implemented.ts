import pc from "picocolors";
import type { CliCommandName, JsonResult } from "../types/json-result.js";

export interface PlaceholderOptions {
  json?: boolean;
}

/**
 * Shared placeholder behavior for every command until real logic lands
 * (Milestone 1: package skeleton only, see startup docs/inject-nockta-skills.updated.md §11).
 *
 * Text mode: prints a "not implemented" line to stderr, exits non-zero.
 * `--json` mode: prints exactly one JsonResult to stdout, exits non-zero.
 */
export function runNotImplemented(command: CliCommandName, options: PlaceholderOptions): never {
  const summary = `"${command}" is not implemented yet`;

  if (options.json) {
    const result: JsonResult = {
      ok: false,
      command,
      exitCode: 1,
      summary,
      data: null,
      errors: [summary],
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.exitCode);
  }

  process.stderr.write(`${pc.yellow("not implemented:")} ${summary}\n`);
  process.exit(1);
}
