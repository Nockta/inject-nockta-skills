#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { runInstallEntry } from "./commands/install-entry.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRepairCommand } from "./commands/repair.js";
import { runUpgradeCommand } from "./commands/upgrade.js";
import { runSyncCommand } from "./commands/sync.js";
import { runListCommand } from "./commands/list.js";

function readPackageVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as { version: string };
  return pkg.version;
}

function collectTarget(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

interface RootOpts {
  json?: boolean;
  type?: string;
  target: string[];
  monorepo?: boolean;
  adapters?: string;
  yes?: boolean;
  withClaudeMem?: boolean;
  excludeSkills?: string;
  includeSkills?: string;
  dryRun?: boolean;
  /** D30: `--web` opt-in web wizard. */
  web?: boolean;
  /** D30: `--cli` explicit force-CLI (beats `--web`). */
  cli?: boolean;
  /** D30: commander's `--no-open` negation → `open === false` means "serve + print URL, don't launch a browser". */
  open?: boolean;
  /** D30 composition contract: print `buildWizardSchema()` JSON and exit 0. */
  emitSchema?: boolean;
}

/** Shared by both the root short-form action and the `install` subcommand's action — see the block comment above the root command's `.action()` in `buildProgram()`. */
async function runRootInstall(program: Command): Promise<void> {
  const opts = program.opts<RootOpts>();
  await runInstallEntry({
    json: opts.json,
    type: opts.type,
    targets: opts.target,
    monorepo: opts.monorepo,
    adapters: opts.adapters,
    yes: opts.yes,
    withClaudeMem: opts.withClaudeMem,
    excludeSkills: opts.excludeSkills,
    includeSkills: opts.includeSkills,
    dryRun: opts.dryRun,
    web: opts.web,
    cli: opts.cli,
    noOpen: opts.open === false,
    emitSchema: opts.emitSchema,
  });
}

export function buildProgram(): Command {
  const program = new Command();

  // Install's flags (`--type`/`--target`/`--monorepo`/`--adapters`/`--yes`) are declared ONLY
  // ONCE, here on the root command — same as `--json` already was. This is deliberate, not an
  // oversight (brief item 3, "root short-form: wire it"): commander recognizes a root-declared
  // option ANYWHERE in argv regardless of a subcommand token's position (this is how `--json`
  // already worked before/after every subcommand — see the "Key Concepts" note in
  // src/CONTEXT.md, "--json is global, read per-command via closure"). Declaring these flags a
  // SECOND time on the `install` subcommand itself would collide with the root's own
  // registration and cause commander to silently swallow the values into whichever command's
  // Option object it resolves first (reproduced while building this: `install --type next`
  // landed on `program.opts()`, not the subcommand's own options, leaving the subcommand with
  // nothing). Reading the SAME `program.opts()` closure from both the root action (root
  // short-form, spec §7.2) and the `install` subcommand's action is what makes the two
  // byte-for-byte identical by construction — see `commands/install-entry.ts`.
  program
    .name("inject-nockta-skills")
    .description("Inject Nockta AI agent skill packs (Claude, Cursor, Copilot adapters) into a repo.")
    .version(readPackageVersion(), "-v, --version", "print the installed version")
    .option("--json", "print one machine-readable JSON result to stdout", false)
    .option("--type <repoType>", "repo type for a standalone project root (e.g. next)")
    .option(
      "--target <spec>",
      "monorepo target 'path:type' (canonical, repeatable); " +
        "or bare 'path' with --type for a single target (split-form convenience)",
      collectTarget,
      [] as string[],
    )
    .option("--monorepo", "force monorepo mode — see src/commands/install.ts for the exact semantics")
    .option("--adapters <adapters>", "comma-separated adapter list (e.g. claude)")
    .option("--yes", "confirm a non-interactive install, or skip the wizard's final confirm step")
    .option(
      "--with-claude-mem",
      "non-interactive only: after a successful install, also run `npx claude-mem install` " +
        "(best-effort, third-party). Declared ONLY on the root " +
        "command, same reasoning as the flags above — see this file's earlier comment block on " +
        "the commander parent/child-option collision. The wizard never needs this flag — it has " +
        "its own interactive Extras step (wizard/steps/extras.ts).",
    )
    .option(
      "--exclude-skills <names>",
      "comma-separated skill names to exclude from the default set (excluding a required skill is an error). Same root-only declaration reasoning as the flags above.",
    )
    .option(
      "--include-skills <names>",
      "comma-separated skill names to include beyond the default set (optional-tier skills). Same root-only declaration reasoning as the flags above.",
    )
    .option(
      "--dry-run",
      "install only: print the fully resolved plan (packs/skills/tiers/files) and write NOTHING. Bypasses --yes. Same root-only declaration reasoning as the flags above.",
    )
    .option(
      "--web",
      "open a local browser page to run the wizard (decisions.md D30). Falls back to the terminal wizard (or --yes) when no display is available. Root-only, same reasoning as the flags above.",
    )
    .option("--cli", "force the terminal wizard even if --web is also given (decisions.md D30). Root-only.")
    .option("--no-open", "with --web: serve and print the URL but do not auto-launch a browser (decisions.md D30). Root-only.")
    .option(
      "--emit-schema",
      "print the wizard schema (buildWizardSchema) as JSON to stdout and exit — the create-hosting contract (decisions.md D30). No server, no page. Root-only.",
    )
    .action(async () => {
      // No subcommand: either the root short-form non-interactive install (spec §7.2 — enough
      // flags given directly on the root command) or, lacking that, the interactive wizard
      // (spec §7.1). `runInstallEntry()` makes this exact routing decision — see
      // src/commands/install-entry.ts.
      await runRootInstall(program);
    });

  program
    .command("install")
    .description("Install skill packs into the current repo (wizard on a TTY with insufficient flags; flag-driven otherwise)")
    .action(async () => {
      // Same flags, same routing decision as the root short-form above — reads the identical
      // `program.opts()` closure (see the block comment above `.action()` on the root command).
      await runRootInstall(program);
    });

  program
    .command("wizard")
    .description(
      "Run the install wizard (terminal, or --web for a browser page). With --emit-schema, print the wizard schema as JSON and exit (the create-hosting contract, decisions.md D30).",
    )
    .action(async () => {
      // Same root-declared flags (--type/--adapters/--web/--emit-schema/…) read via program.opts(),
      // same collision-avoidance reasoning as install (see the block comment on the root command).
      await runRootInstall(program);
    });

  program
    .command("doctor")
    .description("Validate the current installation state against the generated-file manifest")
    .action(() => {
      runDoctorCommand({ json: program.opts().json as boolean | undefined });
    });

  program
    .command("repair")
    .description("Recreate missing/damaged generated adapter outputs")
    .option("--force", "overwrite generated paths even if user-modified")
    .action((repairOpts: { force?: boolean }) => {
      runRepairCommand({ json: program.opts().json as boolean | undefined, force: repairOpts.force });
    });

  program
    .command("upgrade")
    .description("Re-render adapter outputs using the currently installed package version")
    .option("--force", "overwrite generated paths even if user-modified")
    .action((upgradeOpts: { force?: boolean }) => {
      runUpgradeCommand({ json: program.opts().json as boolean | undefined, force: upgradeOpts.force });
    });

  program
    .command("sync")
    .description("Determine what the repo needs (doctor/repair/upgrade) and run it")
    // Neither `--yes` NOR `--dry-run` is re-declared here — both are the SAME root-level options
    // `install` uses (see the block comment above the root command's `.action()`): declaring a
    // second, sync-local Option under either flag name reproduces the exact install/root
    // collision documented above (verified while building M6's `--yes` fix; M7 adds `--dry-run`
    // to root for `install --dry-run`, spec §7.3, and hits the identical collision against
    // sync's own PRE-EXISTING local `--dry-run` — same fix applies: read the shared flag from
    // `program.opts()` instead of a second local declaration).
    .action(async () => {
      await runSyncCommand({
        json: program.opts().json as boolean | undefined,
        yes: program.opts().yes as boolean | undefined,
        dryRun: program.opts().dryRun as boolean | undefined,
      });
    });

  program
    .command("list")
    .description("List bundled packs and adapters that have real authored content")
    .option("--details", "print extended pack/adapter details")
    .action((listOpts: { details?: boolean }) => {
      runListCommand({
        json: program.opts().json as boolean | undefined,
        details: listOpts.details,
      });
    });

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

// Only auto-run when this file is the process entry point (bin/dist/cli.js),
// so test suites can `import { buildProgram } from "./cli.js"` safely.
//
// `realpathSync` matters here: package managers install CLI `bin` entries as
// symlinks (e.g. node_modules/.bin/inject-nockta-skills -> ../inject-nockta-skills/dist/cli.js),
// and `npx` does the same from its cache. Node resolves `import.meta.url` to the
// symlink TARGET, but `process.argv[1]` stays the symlink PATH the user invoked —
// comparing them directly would silently no-op the whole CLI under a symlinked bin.
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    // @inquirer prompts reject with `ExitPromptError` on Ctrl-C (SIGINT).
    // Checked by `.name` (not `instanceof`) so this stays robust across
    // @inquirer/core versions/import paths — every prompt in the wizard
    // (repo-type, adapters, skills, razor, confirm, paginated multiselect)
    // funnels through this one top-level catch on cancel.
    if (error instanceof Error && error.name === "ExitPromptError") {
      process.stderr.write("\nCancelled.\n");
      process.exitCode = 130; // standard SIGINT exit code
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
}
