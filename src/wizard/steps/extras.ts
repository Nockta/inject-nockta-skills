import {
  CLAUDE_MEM_DISCLOSURE,
  checkAlreadyInstalledReport,
  runClaudeMemInstall,
} from "../../core/run-extras.js";
import type { ExtrasDetectionOptions, ExtrasReport } from "../../core/run-extras.js";
import type { WizardPrompts } from "../prompts.js";

/**
 * Wizard step 8 (spec §7.1: "Optional Extras", spec §7.10, decisions.md D17) — the wizard's
 * FINAL step, run only after step 7 ("write metadata and adapter outputs") has already succeeded
 * (see `run-install-wizard.ts`'s `withExtrasStep()`). Thin prompt wrapper only — detection,
 * disclosure text, and execution all live in `core/run-extras.ts` (shared with the non-interactive
 * `--with-claude-mem` path in `commands/install.ts`); this file's only job is the `WizardPrompts`
 * interaction, same "steps only touch prompts, core does the rest" split every other
 * `wizard/steps/*.ts` file follows.
 */
export async function runExtrasWizardStep(
  prompts: WizardPrompts,
  log: (message: string) => void,
  options: ExtrasDetectionOptions = {},
): Promise<ExtrasReport> {
  const alreadyInstalled = checkAlreadyInstalledReport(options);
  if (alreadyInstalled) return alreadyInstalled;

  log("");
  log("— Extras (optional, personal) —");
  const accepted = await prompts.confirm(CLAUDE_MEM_DISCLOSURE, false);
  if (!accepted) {
    return { offered: true, accepted: false, succeeded: false };
  }

  log("Running: npx claude-mem install ...");
  const succeeded = runClaudeMemInstall();
  if (!succeeded) {
    log("warning: claude-mem install did not complete successfully (best-effort — this install is unaffected).");
  }
  return { offered: true, accepted: true, succeeded };
}
