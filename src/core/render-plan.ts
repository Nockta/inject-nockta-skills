import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { renderAdapters } from "./render-adapters.js";
import { resolveSkillSelection } from "./skill-selection.js";
import type { SkillSelectionDeltas } from "./skill-selection.js";
import type { RenderedFile } from "../adapters/types.js";
import type { AdapterType } from "../types/adapter.js";
import type { RepoType } from "../types/repo-type.js";

export interface ComputeRenderPlanOptions {
  /**
   * One or more repo types (decisions.md D22 — a single-project caller still passes a
   * one-element array; a monorepo caller passes the UNION of distinct repo types across every
   * target). Omitted (or empty) means no packs beyond `common` (and `monorepo`, if
   * `monorepo: true`) are requested.
   */
  repoTypes?: RepoType[];
  adapters: AdapterType[];
  monorepo?: boolean;
  packsRoot?: string;
  /**
   * Skill-selection deltas (decisions.md D19) — defaults to `{excluded: [], included: []}`
   * (required+default only) when omitted, i.e. the pre-M7 behavior. Doctor/repair/upgrade pass
   * the STORED profile deltas here; the catalog they are resolved against is always freshly
   * built from the CURRENTLY bundled packs (not what was on disk at install time) — this is the
   * merge policy documented in `src/core/CONTEXT.md`. `resolveSkillSelection()`'s `.errors`/`.ok`
   * are deliberately ignored here (maintenance recompute never rejects a stale delta — see that
   * function's own doc comment).
   */
  skillSelection?: SkillSelectionDeltas;
}

/**
 * Computes the canonical "what would a fresh install produce right now"
 * file set for a profile's `repoType`/`installedAdapters`, using the
 * CURRENTLY bundled pack content and the currently running renderer —
 * without writing anything into the real target repo.
 *
 * Reused by doctor (to detect staleness-by-source and unknown files),
 * repair, and upgrade (to know what to (re)write and where its canonical
 * bytes come from) — see `src/core/CONTEXT.md`.
 *
 * Implementation note: this reuses `renderAdapters()` unmodified by
 * rendering into a throwaway `mkdtemp` scratch directory, then discarding
 * it immediately. This is deliberate, not wasteful I/O: it is the only way
 * to get the D1-override-aware, skill.json-honoring source resolution
 * `renderClaudeAdapter()` already implements, without duplicating that
 * logic here. Each `RenderedFile.sourcePath` returned points at the real
 * bundled `packs/` tree (never at the scratch dir), and `relativePath` is
 * scratch-dir-independent (`relative(scratchDir, output)` yields the same
 * ".claude/..." string regardless of which absolute dir was used) — so the
 * scratch dir can be deleted before this function returns; callers never
 * touch it.
 */
export function computeRenderPlan(options: ComputeRenderPlanOptions): RenderedFile[] {
  const requestedPacks = options.repoTypes ?? [];
  const resolved = resolvePacks({
    requestedPacks,
    monorepo: options.monorepo ?? false,
    packsRoot: options.packsRoot,
  });

  const packsRoot = options.packsRoot ?? getPacksPath();
  const catalog = buildSkillCatalog(resolved.installable, packsRoot);
  const selection = resolveSkillSelection({
    catalog,
    excluded: options.skillSelection?.excluded,
    included: options.skillSelection?.included,
    adapters: options.adapters,
  });

  const scratchDir = mkdtempSync(join(tmpdir(), "inject-nockta-skills-render-plan-"));
  try {
    const { written } = renderAdapters({
      targetDir: scratchDir,
      adapters: options.adapters,
      packs: resolved.installable,
      packsRoot: options.packsRoot,
      effectiveSkills: selection.effective,
    });
    return written;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

/** Indexes a render plan by its target-relative path for O(1) lookup. */
export function toPlanMap(plan: RenderedFile[]): Map<string, RenderedFile> {
  return new Map(plan.map((file) => [file.relativePath, file]));
}
