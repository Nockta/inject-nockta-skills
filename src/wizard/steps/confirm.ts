import type { WizardPrompts } from "../prompts.js";

/**
 * Wizard step 6 (spec §7.1: "Confirm installation"). `preset` — an already-given `--yes` —
 * short-circuits to `true` without prompting, same pattern as the other steps' preset handling.
 */
export async function confirmInstall(prompts: WizardPrompts, preset?: boolean): Promise<boolean> {
  if (preset) return true;
  return prompts.confirm("Write these files now?", true);
}
