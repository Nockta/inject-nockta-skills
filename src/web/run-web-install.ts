import { buildInstallResult, formatInstallHuman } from "../commands/install.js";
import type { InstallCliOptions, InstallResult } from "../commands/install.js";
import { readRunningPackageVersion } from "../core/read-package-version.js";
import { resolve as resolvePlan } from "../wizard/core/resolve.js";
import type { WizardAnswers } from "../wizard/core/types.js";
import { buildWebSchema } from "./build-web-schema.js";
import type { WebSchemaOptions } from "./build-web-schema.js";
import { startWebWizardServer } from "./server.js";
import { openBrowser } from "./open-browser.js";

/**
 * Standalone inject `--web` mode (decisions.md D30). Whole-form flow (NOT the CLI step loop):
 *   buildWebSchema(ctx) -> serve page -> receive plain WizardAnswers -> resolve(answers) ->
 *   buildInstallResult(plan) -> print the SAME result summary the CLI wizard prints.
 *
 * Reuses the D28 seams verbatim: `buildWizardSchema` (via `buildWebSchema`), `resolve()`, and the
 * existing `buildInstallResult()` write path — so a web-driven install has identical exit codes,
 * `InstallResult` shape, and safety guarantees to the CLI wizard's confirm step.
 */
export interface WebInstallOptions extends WebSchemaOptions {
  json?: boolean;
  /** `--no-open`: still serve + print the URL, but do not auto-launch a browser. */
  noOpen?: boolean;
  packageVersion?: string;
  extrasHomeDir?: string; // reserved; extras is a CLI-wizard-only step, not part of web flow yet
}

/** Pure tail: answers -> resolve -> buildInstallResult. No process/exit — unit-testable directly. */
export function buildInstallResultFromAnswers(answers: WizardAnswers, options: WebInstallOptions): InstallResult {
  const plan = resolvePlan(answers);
  const cliOptions: InstallCliOptions = {
    type: plan.type,
    targets: plan.targets,
    monorepo: plan.monorepo,
    adapters: plan.adapters,
    yes: true,
    targetDir: options.targetDir,
    packsRoot: options.packsRoot,
    packageVersion: options.packageVersion ?? readRunningPackageVersion(),
    excludeSkills: plan.excludeSkills,
    includeSkills: plan.includeSkills,
  };
  return buildInstallResult(cliOptions);
}

/**
 * Impure orchestration: builds the schema, serves it, opens the browser, awaits the submit, writes,
 * prints, and exits with the same code scheme every command uses. Narration goes to STDERR so a
 * `--json` consumer still gets exactly one clean JSON line on stdout.
 */
export async function runWebInstall(options: WebInstallOptions): Promise<never> {
  const { schema } = buildWebSchema(options);
  // The REAL install runs inside the submit handler (`onSubmit`), BEFORE the HTTP response is
  // written, so the browser shows the actual outcome — a failed install renders as an error on the
  // page, never a false "Done" screen (truthfulness fix; mirrors create's web server). A failed
  // submit stays unsettled server-side, so the user can correct the form and resubmit. The
  // successful result is captured here for the terminal summary + exit code below.
  let submittedResult: InstallResult | undefined;
  // Carry the derivation ctx so the reactive `GET /schema` endpoint can recompute the offering per
  // request (Bug A fix — the page re-derives on every repo-type/adapter toggle).
  const handle = await startWebWizardServer({
    schema,
    targetDir: options.targetDir,
    packsRoot: options.packsRoot,
    onSubmit: (answers) => {
      const result = buildInstallResultFromAnswers(answers, options);
      if (!result.ok) return { ok: false, error: result.summary };
      submittedResult = result;
      return { ok: true };
    },
  });

  const onSigint = (): void => {
    process.stderr.write("\nCancelled (Ctrl-C) — no changes made.\n");
    void handle.close().finally(() => process.exit(130));
  };
  process.on("SIGINT", onSigint);

  process.stderr.write(`\n  Nockta skill installer is running at:\n    ${handle.url}\n\n`);
  if (options.noOpen) {
    process.stderr.write("  Open that URL in your browser to continue. (Ctrl-C to cancel)\n");
  } else {
    openBrowser(handle.url);
    process.stderr.write("  Opening your browser… if it didn't open, paste the URL above. (Ctrl-C to cancel)\n");
  }

  let answers: WizardAnswers;
  try {
    answers = await handle.waitForAnswers();
  } catch (error) {
    process.removeListener("SIGINT", onSigint);
    process.stderr.write(`\n  Cancelled: ${(error as Error).message}\n`);
    await handle.close().catch(() => {});
    process.exit(1);
  }
  process.removeListener("SIGINT", onSigint);
  await handle.close().catch(() => {});

  // The install already ran inside `onSubmit` (answers only resolve on a successful one) — print
  // that result; never run the install a second time. The fallback covers the impossible-by-
  // construction case of answers resolving without a captured result (defensive, not a code path).
  const result = submittedResult ?? buildInstallResultFromAnswers(answers, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(formatInstallHuman(result));
  }
  process.exit(result.exitCode);
}

/**
 * `inject wizard --emit-schema` / `install --emit-schema` (decisions.md D30 composition contract) —
 * prints `buildWizardSchema()` as JSON to stdout and exits 0. No server, no page. This is the exact
 * payload create will later fetch to host inject's steps in its own web page.
 */
export function runEmitSchema(options: WebSchemaOptions): never {
  const { schema } = buildWebSchema(options);
  process.stdout.write(`${JSON.stringify(schema)}\n`);
  process.exit(0);
}
