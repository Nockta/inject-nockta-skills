/**
 * Thin, injectable prompt interface the wizard's step functions depend on — never
 * `@inquirer/prompts` directly. Mirrors the pattern `core/sync-orchestrator.ts` already
 * established with its `confirmFn` injection point (see src/core/CONTEXT.md's "Key Concepts"):
 * real interactive behavior comes from `defaultWizardPrompts` (a thin, lazy-imported wrapper
 * around `@inquirer/prompts`, its only real caller besides `sync`); tests inject a fake
 * implementing this same interface, so every wizard step is testable with canned answers and
 * no real TTY.
 */
export interface WizardChoice<T extends string = string> {
  value: T;
  name: string;
  description?: string;
  /** `true`/a reason string disables the choice in a real `@inquirer` select/checkbox prompt. */
  disabled?: boolean | string;
  /**
   * Pre-checked state for a `checkbox()` prompt (M7, new — the skill-selection step,
   * `wizard/steps/select-skills.ts`, spec §7.1 step 5/decisions.md D19). Combined with
   * `disabled`, this is `@inquirer/prompts`' standard "locked on" pattern: a required skill is
   * `checked: true` + `disabled: "..."`, so the user cannot uncheck it and its checked state is
   * exactly what comes back in the final answer array. Ignored by `select()`/no meaning outside
   * `checkbox()` — every OTHER existing `checkbox()` caller (`select-targets.ts`) simply never
   * sets it, defaulting to unchecked, unchanged behavior.
   */
  checked?: boolean;
}

export interface WizardPrompts {
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  select<T extends string>(message: string, choices: WizardChoice<T>[], defaultValue?: T): Promise<T>;
  checkbox<T extends string>(message: string, choices: WizardChoice<T>[]): Promise<T[]>;
  input(message: string, defaultValue?: string): Promise<string>;
}

/**
 * Real, interactive implementation — lazily imports `@inquirer/prompts` (same lazy-import
 * convention `sync-orchestrator.ts`'s `defaultConfirm()` uses) so importing this module never
 * pays that cost or requires a TTY unless a step actually prompts.
 */
export const defaultWizardPrompts: WizardPrompts = {
  async confirm(message, defaultValue) {
    const { confirm } = await import("@inquirer/prompts");
    return confirm({ message, default: defaultValue });
  },
  async select(message, choices, defaultValue) {
    const { select } = await import("@inquirer/prompts");
    return (await select({ message, choices, default: defaultValue })) as typeof choices[number]["value"];
  },
  async checkbox(message, choices) {
    const { checkbox } = await import("@inquirer/prompts");
    return (await checkbox({ message, choices })) as (typeof choices[number]["value"])[];
  },
  async input(message, defaultValue) {
    const { input } = await import("@inquirer/prompts");
    return input({ message, default: defaultValue });
  },
};
