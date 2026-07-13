import { renderClaudeAdapter } from "../adapters/claude/render.js";
import { renderCursorAdapter } from "../adapters/cursor/render.js";
import { renderCopilotAdapter } from "../adapters/copilot/render.js";
import { renderAgentAdapter } from "../adapters/agent/render.js";
import { renderAntigravityAdapter } from "../adapters/antigravity/render.js";
import type { RenderedFile, SkippedSkill } from "../adapters/types.js";
import type { AdapterType } from "../types/adapter.js";
import type { ResolvedPackEntry } from "../packs/resolve-packs.js";

export interface RenderAdaptersOptions {
  targetDir: string;
  adapters: AdapterType[];
  /** Installable packs only — the D6 gate is resolve-packs' job, not this module's. */
  packs: ResolvedPackEntry[];
  packsRoot?: string;
  /** The D19 effective skill set (see `core/skill-selection.ts`) — threaded to every adapter's renderer unchanged. */
  effectiveSkills: Set<string>;
}

export interface RenderAdaptersResult {
  written: RenderedFile[];
  skipped: SkippedSkill[];
}

/**
 * Thrown when a requested adapter has no renderer implemented yet. Distinct
 * from "skipped" (an adapter-restricted *skill* within a supported adapter,
 * spec §8.2) — this is "the whole adapter isn't buildable yet", which the
 * caller (`core/inject-skills.ts`) maps to exit code 3 (render failure).
 * As of D35 every `AdapterType` (claude/cursor/copilot/agent/antigravity) has
 * a real renderer — this class has no live trigger through the current public API
 * (every value `isAdapterType()` accepts now renders) — kept in place, not
 * deleted, as forward-proofing for a FUTURE adapter (spec §8.1's "future
 * adapters" list: codex/windsurf/zed/... — now largely subsumed by the
 * generic `agent` adapter, D24) landing in `AdapterType` ahead of its own
 * renderer, same "don't delete working infrastructure speculatively"
 * instinct `src/CONTEXT.md` already documents for `runNotImplemented()`.
 */
export class AdapterNotImplementedError extends Error {
  constructor(public readonly adapter: AdapterType) {
    super(`adapter "${adapter}" has no renderer implemented yet`);
    this.name = "AdapterNotImplementedError";
  }
}

/**
 * Dispatches to each adapter's own `render.ts` (spec §11 `src/core/render-adapters.ts`). All
 * adapters (claude M3, cursor + copilot M7, agent D24, antigravity D35) are real. Requesting an
 * adapter with no renderer throws `AdapterNotImplementedError` rather than silently skipping it
 * (see that class's doc comment for why it is kept even though nothing reachable triggers it
 * today).
 */
export function renderAdapters(options: RenderAdaptersOptions): RenderAdaptersResult {
  const written: RenderedFile[] = [];
  const skipped: SkippedSkill[] = [];

  for (const adapter of options.adapters) {
    if (adapter === "claude") {
      const result = renderClaudeAdapter({
        targetDir: options.targetDir,
        packs: options.packs,
        packsRoot: options.packsRoot,
        effectiveSkills: options.effectiveSkills,
      });
      written.push(...result.written);
      skipped.push(...result.skipped);
      continue;
    }
    if (adapter === "cursor") {
      const result = renderCursorAdapter({
        targetDir: options.targetDir,
        packs: options.packs,
        packsRoot: options.packsRoot,
        effectiveSkills: options.effectiveSkills,
      });
      written.push(...result.written);
      skipped.push(...result.skipped);
      continue;
    }
    if (adapter === "copilot") {
      const result = renderCopilotAdapter({
        targetDir: options.targetDir,
        packs: options.packs,
        packsRoot: options.packsRoot,
        effectiveSkills: options.effectiveSkills,
      });
      written.push(...result.written);
      skipped.push(...result.skipped);
      continue;
    }
    if (adapter === "agent") {
      const result = renderAgentAdapter({
        targetDir: options.targetDir,
        packs: options.packs,
        packsRoot: options.packsRoot,
        effectiveSkills: options.effectiveSkills,
      });
      written.push(...result.written);
      skipped.push(...result.skipped);
      continue;
    }
    if (adapter === "antigravity") {
      const result = renderAntigravityAdapter({
        targetDir: options.targetDir,
        packs: options.packs,
        packsRoot: options.packsRoot,
        effectiveSkills: options.effectiveSkills,
      });
      written.push(...result.written);
      skipped.push(...result.skipped);
      continue;
    }
    throw new AdapterNotImplementedError(adapter);
  }

  return { written, skipped };
}
