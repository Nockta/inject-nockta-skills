import { ADAPTER_TYPES, isAdapterType } from "../../types/adapter.js";
import type { AdapterType } from "../../types/adapter.js";
import type { WizardChoice, WizardPrompts } from "../prompts.js";

/**
 * Adapters with a real renderer as of this milestone (spec §7.1 wizard note: "pack and adapter
 * selection ... only lists packs that have real authored content and are enabled" — the same
 * rule applied to adapters, since offering an adapter the CLI cannot render would just fail at
 * write time, spec §8.1/`core/render-adapters.ts`'s `AdapterNotImplementedError`). Keep this in
 * sync with `core/render-adapters.ts`'s dispatch — that is the actual source of truth for what
 * renders; this list exists so the wizard never OFFERS what it cannot deliver. M7: `cursor`/
 * `copilot` gained real renderers (`src/adapters/cursor/`, `src/adapters/copilot/`) — un-disabled
 * here to match; ALL THREE MVP adapters (spec §3.4 item 7) are now offered. D24 (post-M8) adds a
 * fourth: `agent`, the generic root `AGENTS.md` surface (`src/adapters/agent/render.ts`) — it
 * renders now, not a "coming soon" placeholder, so it too joins `AVAILABLE_ADAPTERS`.
 */
const AVAILABLE_ADAPTERS: readonly AdapterType[] = ["claude", "cursor", "copilot", "agent", "antigravity"];

/**
 * Per-adapter descriptions shown in the wizard checkbox — `agent` and `antigravity` need one, since
 * their bare values don't self-explain the way "claude"/"cursor"/"copilot" do. (D35: `antigravity`
 * is the FULL-injection Antigravity adapter — distinct from the text-only `agent`/AGENTS.md surface.)
 */
const ADAPTER_DESCRIPTIONS: Partial<Record<AdapterType, string>> = {
  agent: "Generic AGENTS.md — covers Codex, Antigravity/agy, Zed, Windsurf (and secondarily Copilot)",
  antigravity: "Antigravity — installs skills under .agents/skills (IDE + agy CLI)",
};

export interface AdapterStepPlan {
  choices: WizardChoice<AdapterType>[];
  /** Preselected when only one adapter is available — matches spec §7.2's own examples defaulting to `claude`. */
  defaultSelected: AdapterType[];
}

/** Pure planner for wizard step 4 (spec §7.1: "Select adapters"). */
export function planAdapterStep(): AdapterStepPlan {
  const choices: WizardChoice<AdapterType>[] = ADAPTER_TYPES.map((adapter) => {
    const available = (AVAILABLE_ADAPTERS as readonly string[]).includes(adapter);
    return {
      value: adapter,
      name: available ? adapter : `${adapter} (coming soon)`,
      disabled: available ? false : "coming soon — no renderer implemented yet",
      ...(ADAPTER_DESCRIPTIONS[adapter] ? { description: ADAPTER_DESCRIPTIONS[adapter] } : {}),
    };
  });
  return { choices, defaultSelected: [...AVAILABLE_ADAPTERS] };
}

function parsePresetAdapters(raw: string): AdapterType[] | null {
  const list = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  if (list.length === 0 || !list.every((a) => isAdapterType(a))) return null;
  return list as AdapterType[];
}

/**
 * Thin prompt wrapper. `preset` — an already-given `--adapters` value — short-circuits without
 * prompting (same "explicit flag wins, detection/defaults never override it" spirit as
 * `selectRepoType()`). An invalid preset is ignored, falling through to the prompt.
 */
export async function selectAdapters(prompts: WizardPrompts, preset?: string): Promise<AdapterType[]> {
  if (preset) {
    const parsed = parsePresetAdapters(preset);
    if (parsed) return parsed;
  }
  const plan = planAdapterStep();
  const selected = await prompts.checkbox(
    "Select adapters to generate (only adapters with a real renderer can be chosen):",
    plan.choices,
  );
  return selected.length > 0 ? selected : plan.defaultSelected;
}
