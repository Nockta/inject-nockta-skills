import type { StepModel } from "../core/types.js";

/**
 * The View seam (decisions.md D28 seam #1). The Controller depends ONLY on this abstract
 * `Presenter` — never on `@inquirer/*`, picocolors, or any terminal API. The CLI paginated/themed
 * prompts are ONE implementation (`cli-presenter.ts`); a future `WebPresenter` (an HTML page that
 * renders the same `StepModel` and POSTs back a result) is droppable in with ZERO Controller
 * changes. That is the whole point of the split — a second View, not a second wizard.
 */

/** A step's outcome: either the user's answer, or a request to go back one step. */
export type PresenterResult =
  | { kind: "back" }
  /** `value` is `string[]` (multiselect/paginated), `boolean` (confirm), or `ParsedTarget[]` (targets). */
  | { kind: "answer"; value: unknown };

export const BACK: PresenterResult = { kind: "back" };

export interface Presenter {
  /** Clean-view: clear the viewport before a step renders, so each step is a fresh screen (D28). */
  clear(): void;
  /**
   * Render one step and resolve with the user's answer or a BACK signal. The step's current state
   * (selected rows, confirm default) is carried on `step` itself (`ChoiceModel.checked` /
   * `StepModel.confirmDefault`), so re-entry after a back — or a lock-loop re-render — is just a
   * fresh `renderStep` call with an updated `StepModel`. `prefill` carries any non-choice prior
   * answer a step needs (today: the monorepo targets step's prior `ParsedTarget[]`).
   */
  renderStep(step: StepModel, prefill?: unknown): Promise<PresenterResult>;
  /** Release any terminal resources. */
  close(): void;
}
