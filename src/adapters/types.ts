import type { AdapterType } from "../types/adapter.js";

/**
 * Shared renderer output types — used by all three adapters (`claude/render.ts`,
 * `cursor/render.ts`, `copilot/render.ts`) and every downstream consumer
 * (`core/render-adapters.ts`, `core/render-plan.ts`, `core/apply-render-plan.ts`,
 * `core/classify-manifest.ts`, `core/inject-skills.ts`, `core/inject-skills-monorepo.ts`).
 *
 * Historically these lived inline in `adapters/claude/render.ts` (the only renderer through M6);
 * M7 (cursor + copilot renderers) moves them here so no adapter module has to import types from
 * a SIBLING adapter's file. `adapters/claude/render.ts` re-exports both names verbatim, so every
 * M1-M6 caller that already does `import type { RenderedFile } from "../adapters/claude/render.js"`
 * keeps working unchanged — this move is additive, not a breaking rename.
 */
export interface RenderedFile {
  /** Path relative to `targetDir`, e.g. ".claude/skills/paper-trail/SKILL.md". */
  relativePath: string;
  outputPath: string;
  /**
   * Absolute path of the content actually copied/read (override-aware, D1). For claude this is
   * always a single real file whose bytes equal the output ("straight copy", `adapters/
   * CONTEXT.md`). For cursor/copilot's CONSTRUCTED per-pack/combined output (frontmatter +
   * concatenated skill sections, not a 1:1 copy) this still points at a real path for provenance/
   * audit purposes, but the actual bytes come from `content` and the actual staleness fingerprint
   * comes from `sourceContentHash` when those are set (see below) — never `readFileSync(sourcePath)`.
   */
  sourcePath: string;
  /** True when a `packs/<pack>/adapters/<adapter>/` hand-authored override won over the mechanical transform (D1). */
  overridden: boolean;
  adapter: AdapterType;
  pack: string;
  /** Absent for a render entry that covers MORE THAN ONE skill (cursor: a whole pack's .mdc; copilot: the whole combined instructions file) — there is no single skill to attribute it to. */
  skill?: string;
  kind: "skill" | "agent" | "rule" | "instructions";
  /**
   * Precomputed output bytes — REQUIRED reading for any consumer that needs to (re)write this
   * file (`core/apply-render-plan.ts`'s repair/upgrade restore path) when the output is NOT a
   * straight copy of `sourcePath` (cursor's per-pack .mdc, copilot's combined instructions file).
   * Absent for claude, whose renderer still writes via `readFileSync(sourcePath)` directly (no
   * behavior change — `content` is undefined there, so every fallback below is a no-op for it).
   */
  content?: Buffer;
  /**
   * Precomputed hash of whatever the transform actually reads as CURRENT input — e.g. the
   * concatenation of every contributing skill's raw `SKILL.md` bytes, in a deterministic order.
   * Used as `GeneratedFileRecord.sourceHash` and for staleness comparisons INSTEAD OF
   * `sha256File(sourcePath)` whenever present — needed because a multi-file merge (cursor: many
   * skills into one pack .mdc; copilot: many packs into one combined file) has no single
   * `sourcePath` whose bytes alone represent "the current source". Absent for claude (straight
   * copy — `sourcePath` alone is already the correct fingerprint target, unchanged since M3).
   */
  sourceContentHash?: string;
  /**
   * Agent adapter only (root `AGENTS.md`, decisions.md D34 addendum): set when the renderer MERGED
   * its region into a pre-existing consumer-authored `AGENTS.md` (content survived OUTSIDE Nockta's
   * guard region). The install orchestrators (`inject-skills*.ts`) read this to decide manifest
   * tracking (model b): a wholly-Nockta AGENTS.md is tracked; a merged-into-consumer one is left
   * untracked (an existing-repo-safe side-effect, kept correct by idempotent re-merge). Absent /
   * false for every other adapter and for a wholly-generated AGENTS.md. Note `content` still carries
   * the target-INDEPENDENT canonical region bytes (what a fresh install would write), never the
   * merged consumer bytes — so `computeRenderPlan()` stays pure.
   */
  mergedIntoConsumerContent?: boolean;
}

export interface SkippedSkill {
  pack: string;
  skill: string;
  reason: string;
}

export interface AdapterRenderResult {
  written: RenderedFile[];
  skipped: SkippedSkill[];
}
