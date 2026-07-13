import { parseTargetArgs } from "../../core/parse-targets.js";
import type { ParsedTarget } from "../../core/parse-targets.js";
import { buildRepoTypeStep } from "../core/build-schema.js";
import type { StepModel } from "../core/types.js";
import type { WorkspaceCandidate } from "../steps/select-targets.js";
import { paginatedMultiSelect } from "./paginated-multiselect.js";
import type { Presenter, PresenterResult } from "./presenter.js";
import { BACK } from "./presenter.js";
import pc from "picocolors";

/**
 * The CLI implementation of the `Presenter` seam (decisions.md D28). The Controller never imports
 * this directly — it receives it through the abstract `Presenter` interface, so a `WebPresenter`
 * drops in with zero Controller changes. Every step is rendered with picocolors theming and a back
 * affordance consistent with the paginated prompt.
 *
 * - multiselect / paginated-multiselect -> the custom `paginatedMultiSelect` prompt (finite pages,
 *   sections, ←/→ page turns, space toggle, b back).
 * - confirm -> a themed Yes / No / ‹ Back select.
 * - targets -> the monorepo target sub-flow (candidate multiselect + per-target type, or manual
 *   entry when nothing was discovered).
 */

const MAX_MANUAL_TARGET_ATTEMPTS = 5;

export interface CliPresenterOptions {
  /** Monorepo discovered candidates, for the targets step's per-path type guesses + manual fallback. */
  candidates?: WorkspaceCandidate[];
  /** Narration sink (shared with the wizard's log). */
  log?: (message: string) => void;
}

export function createCliPresenter(options: CliPresenterOptions = {}): Presenter {
  const log = options.log ?? (() => {});
  const candidatesByPath = new Map((options.candidates ?? []).map((c) => [c.path, c]));

  return {
    clear() {
      // Clean-view (D28): clear the viewport + scrollback so each step is a fresh screen.
      if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
    },

    async renderStep(step: StepModel): Promise<PresenterResult> {
      switch (step.kind) {
        case "multiselect":
        case "paginated-multiselect": {
          const result = await paginatedMultiSelect({ step });
          if (result.kind === "back") return BACK;
          return { kind: "answer", value: result.selected };
        }
        case "confirm": {
          if (step.preamble) log(step.preamble);
          const { select } = await import("@inquirer/prompts");
          const answer = (await select({
            message: step.title,
            default: step.confirmDefault ? "yes" : "no",
            choices: [
              { value: "yes", name: pc.green("Yes") },
              { value: "no", name: "No" },
              { value: "back", name: pc.dim("‹ Back") },
            ],
          })) as string;
          if (answer === "back") return BACK;
          return { kind: "answer", value: answer === "yes" };
        }
        case "targets": {
          return renderTargetsStep(step, candidatesByPath, log);
        }
        default:
          return BACK;
      }
    },

    close() {
      /* no persistent resources to release */
    },
  };
}

/**
 * The monorepo targets sub-flow. Picks candidate paths (paginated multiselect), then confirms a
 * repo type per selected path; falls back to manual `<path>:<type>` entry when nothing was
 * discovered or every candidate was deselected. `b` at the candidate step goes back a wizard step.
 */
async function renderTargetsStep(
  step: StepModel,
  candidatesByPath: Map<string, WorkspaceCandidate>,
  log: (message: string) => void,
): Promise<PresenterResult> {
  const hasCandidates = (step.choices ?? []).length > 0;

  if (hasCandidates) {
    const pick = await paginatedMultiSelect({ step });
    if (pick.kind === "back") return BACK;
    if (pick.selected.length > 0) {
      const targets: ParsedTarget[] = [];
      for (const path of pick.selected) {
        const candidate = candidatesByPath.get(path);
        const typeStep = buildRepoTypeStep(candidate ? candidate.guesses : []);
        const typed = await paginatedMultiSelect({
          step: { ...typeStep, title: `Project type(s) for ${path}` },
        });
        if (typed.kind === "back") return BACK;
        const parsed = parseTargetArgs({ targetArgs: [`${path}:${typed.selected.join("+")}`] });
        if (parsed.ok) targets.push(...parsed.targets);
        else log(`Skipping ${path}: ${parsed.errors.join("; ")}`);
      }
      return { kind: "answer", value: targets };
    }
    log("No packages selected — enter targets manually instead.");
  }

  return collectManualTargets(log);
}

async function collectManualTargets(log: (message: string) => void): Promise<PresenterResult> {
  const { input } = await import("@inquirer/prompts");
  for (let attempt = 0; attempt < MAX_MANUAL_TARGET_ATTEMPTS; attempt++) {
    const raw = await input({
      message:
        'No packages auto-discovered. Enter target(s) as "<path>:<type>" (e.g. "apps/web:next apps/api:nest"), or blank to cancel:',
    });
    const specs = raw.split(/\s+/).filter(Boolean);
    if (specs.length === 0) return { kind: "answer", value: [] as ParsedTarget[] };
    const parsed = parseTargetArgs({ targetArgs: specs });
    if (parsed.ok) return { kind: "answer", value: parsed.targets };
    log(`Could not parse that (${parsed.errors.join("; ")}) — try again.`);
  }
  return { kind: "answer", value: [] as ParsedTarget[] };
}
