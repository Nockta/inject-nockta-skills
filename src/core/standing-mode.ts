import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Single source of truth for the Nockta STANDING-MODE CONTRACT (decisions.md D34, owner design
 * refinement): the working-mode block that states the three owner skills govern all agent work in
 * a consumer repo. The contract TEXT is authored ONCE here and rendered ONCE at runtime — into
 * root `AGENTS.md` (the cross-tool standard file every modern agent reads). Every other adapter
 * entry file merely REFERENCES `AGENTS.md` rather than duplicating the block:
 *   - Claude: a marker-guarded `@AGENTS.md` import line in root `CLAUDE.md` (Claude Code's `@import`
 *     syntax resolves root-relative — verified 2026-07 against code.claude.com/docs/en/memory).
 *   - Cursor `.mdc` / Copilot instructions: a one-line reference (belt-and-suspenders — both read
 *     root `AGENTS.md` natively as of 2025, see README adapters section).
 *   - Agent adapter's own `AGENTS.md`: the block IS the preamble of the file it already renders
 *     (`adapters/agent/render.ts`), using the SAME `renderStandingModeSection()` below.
 *
 * Ownership model (decisions.md D34) — mirrors the CLAUDE.md treatment for consumer-shared files:
 *   - When the `agent` adapter IS selected, `AGENTS.md` is a Nockta-generated, manifest-TRACKED
 *     artifact owned by the agent renderer (the block rides along as its preamble). It flows
 *     through the normal hash/doctor/repair/upgrade pipeline unchanged.
 *   - When the `agent` adapter is NOT selected, `AGENTS.md` is still written on every install (the
 *     contract must ship regardless of adapters), but as a marker-guarded, existing-repo-safe,
 *     UNTRACKED side-effect via `ensureAgentsMdStandingMode()` — create-if-absent, refresh-region-
 *     if-marker-present, append-if-present-without-marker, NEVER clobber consumer content.
 *   - `CLAUDE.md` is ALWAYS a consumer-shared, untracked side-effect (`ensureClaudeMdReference()`),
 *     never hash-tracked as if we owned it.
 * These two callers are gated on adapter selection by the orchestrators
 * (`core/inject-skills.ts`, `core/inject-skills-monorepo.ts`, `core/repair-adapters.ts`,
 * `core/upgrade-adapters.ts` and their monorepo siblings) — never run inside `computeRenderPlan()`'s
 * throwaway scratch dir, so the real-target existing-file logic never sees a scratch path.
 */

export const STANDING_MODE_START = "<!-- nockta:standing-mode:start -->";
export const STANDING_MODE_END = "<!-- nockta:standing-mode:end -->";

/**
 * Guard markers wrapping the ENTIRE Nockta payload the `agent` adapter emits into root `AGENTS.md`
 * (intro header + standing-mode preamble + all skill-body sections). Distinct from the
 * `STANDING_MODE_*` pair, which guards only the standing contract preamble NESTED inside this
 * region. These outer markers are the seam that lets `mergeAgentsMd()` refresh Nockta's region on
 * repair/upgrade while preserving any consumer-authored content that lives OUTSIDE it — closing the
 * D34 "known boundary" where the agent renderer used to clobber a pre-existing consumer AGENTS.md.
 */
export const AGENTS_REGION_START = "<!-- nockta:agents:start -->";
export const AGENTS_REGION_END = "<!-- nockta:agents:end -->";

/** Wraps the Nockta agent payload in the outer guard region. */
export function wrapAgentsRegion(body: string): string {
  return `${AGENTS_REGION_START}\n${body}\n${AGENTS_REGION_END}`;
}

/**
 * Inverse of `wrapAgentsRegion()` — recovers the Nockta payload from a wrapped region (e.g. a
 * `RenderedFile.content` produced by the agent renderer). Defensive: if the markers are absent the
 * whole string is treated as the body.
 */
export function unwrapAgentsRegion(wrapped: string): string {
  const startIdx = wrapped.indexOf(AGENTS_REGION_START);
  const endIdx = wrapped.indexOf(AGENTS_REGION_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return wrapped;
  return wrapped
    .slice(startIdx + AGENTS_REGION_START.length, endIdx)
    .replace(/^\n/, "")
    .replace(/\n$/, "");
}

/**
 * Removes every complete `start..end` marker region (markers included) from `content`. Used to
 * excise NOCKTA-OWNED regions from what would otherwise be treated as consumer bytes — anything
 * between our own markers is ours to reconcile, never the consumer's (adapter-selection-flip rule,
 * D34 addendum). Loops so duplicate regions (e.g. left by an earlier bug) are all removed.
 */
function exciseRegions(content: string, start: string, end: string): string {
  let out = content;
  for (;;) {
    const startIdx = out.indexOf(start);
    const endIdx = out.indexOf(end);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return out;
    out = out.slice(0, startIdx) + out.slice(endIdx + end.length);
  }
}

/**
 * Strips ALL Nockta-owned regions — any stray `nockta:agents` remnants AND any bare
 * `nockta:standing-mode` region (e.g. the one `ensureAgentsMdStandingMode()` writes when the agent
 * adapter is NOT selected) — from bytes about to be treated as consumer content, then collapses the
 * whitespace holes left behind. This is what makes the adapter-selection FLIP safe (D34 addendum):
 * a repo installed without the agent adapter carries a bare standing region; on a later
 * agent-selected install that region is OURS — excised here and re-supplied nested inside the new
 * `nockta:agents` region — instead of surviving as a duplicate standing block.
 */
function exciseOwnedRegions(content: string): string {
  let out = exciseRegions(content, AGENTS_REGION_START, AGENTS_REGION_END);
  out = exciseRegions(out, STANDING_MODE_START, STANDING_MODE_END);
  return out.replace(/\n{3,}/g, "\n\n");
}

export interface MergeAgentsResult {
  /** The bytes to write to `AGENTS.md`. */
  content: string;
  /**
   * True when the on-disk file carried consumer-authored content OUTSIDE Nockta's region (either an
   * existing file with no region markers at all, or non-whitespace bytes around the region). This is
   * the signal callers use to decide manifest tracking (decisions.md D34 addendum, model b): a
   * wholly-Nockta AGENTS.md is manifest-tracked; a merged-into-consumer AGENTS.md is an untracked,
   * existing-repo-safe side-effect kept correct by the idempotent re-merge on every run.
   */
  hadConsumerContent: boolean;
}

/**
 * Merges Nockta's agent payload into a (possibly consumer-authored) root `AGENTS.md`, preserving
 * every byte outside Nockta's guard region. The single source of truth for the write semantics both
 * the install path (`adapters/agent/render.ts`) and the repair/upgrade path
 * (`core/apply-render-plan.ts`) use — so an install over a hand-written AGENTS.md and a later repair
 * behave identically. Idempotent: a second call with the same body is a no-op on the consumer's
 * bytes and re-stamps only Nockta's region.
 *
 *   - `existingOnDisk === null` (no file yet)         -> pure Nockta region, `hadConsumerContent=false`.
 *   - region markers present                          -> replace region in place, keep everything
 *                                                        around it; `hadConsumerContent` reflects
 *                                                        whether non-whitespace bytes exist outside.
 *   - present WITHOUT region markers                  -> excise any Nockta-owned regions first (a
 *                                                        bare standing-mode region from an
 *                                                        agent-not-selected install is OURS — the
 *                                                        adapter-selection-flip rule), then append
 *                                                        the Nockta region after whatever consumer
 *                                                        content remains, never clobber.
 */
export function mergeAgentsMd(existingOnDisk: string | null, nocktaBody: string): MergeAgentsResult {
  const region = wrapAgentsRegion(nocktaBody);

  if (existingOnDisk === null) {
    return { content: `${region}\n`, hadConsumerContent: false };
  }

  const startIdx = existingOnDisk.indexOf(AGENTS_REGION_START);
  const endIdx = existingOnDisk.indexOf(AGENTS_REGION_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Anything OUTSIDE the agents region that sits between our own markers (a stray bare standing
    // region, a duplicate agents region) is ours to reconcile — excise it; the fresh region below
    // re-supplies the standing block nested inside. Everything else is the consumer's, kept verbatim.
    const before = exciseOwnedRegions(existingOnDisk.slice(0, startIdx));
    const after = exciseOwnedRegions(existingOnDisk.slice(endIdx + AGENTS_REGION_END.length));
    const content = `${before}${region}${after}`;
    const hadConsumerContent = before.trim().length > 0 || after.trim().length > 0;
    return { content, hadConsumerContent };
  }

  // No agents region — excise any bare Nockta-owned regions (adapter-selection flip: the standing
  // region `ensureAgentsMdStandingMode()` wrote is ours, not consumer content), then treat what
  // remains as the consumer's. If nothing remains, the file was wholly ours all along.
  const consumer = exciseOwnedRegions(existingOnDisk);
  if (consumer.trim().length === 0) {
    return { content: `${region}\n`, hadConsumerContent: false };
  }
  const trimmed = consumer.replace(/\s*$/, "");
  return { content: `${trimmed}\n\n${region}\n`, hadConsumerContent: true };
}

/** Path a consumer would reference in prose to find the contract's canonical home. */
export const AGENTS_MD_BASENAME = "AGENTS.md";

/**
 * The contract body (no markers). Consumer-repo-appropriate adaptation of the owner's machine-level
 * standing block: written as THIS project's working mode, naming the three skills as installed by
 * this package. The worker-leaf rule (workers follow every skill EXCEPT subagent-delegation) is
 * folded into the subagent-delegation bullet. Deviation clause matches the owner's ("only where a
 * skill's own text defines an exception").
 */
export function renderStandingModeContract(): string {
  return [
    "## Working mode — Nockta standing contract",
    "",
    "This repository installs three Nockta skills that govern how AI agents do work here. Apply",
    "them by default, on every task, without being asked:",
    "",
    "- **subagent-delegation** — real work is delegated to subagents; the main thread stays a",
    "  director's desk for planning and talking to you. (Leaf/worker agents are the one exception:",
    "  a worker follows every skill below EXCEPT this one — it does the work itself and never spawns",
    "  further subagents. Delegation is one level deep.)",
    "- **paper-trail** — finished knowledge is filed in its one canonical home (a root index with",
    "  takeaways, module-level docs, updated in the same pass); decision records are consulted",
    "  before any new architecture work.",
    "- **proof-of-done** — nothing is reported done until it is demonstrated with evidence; no",
    "  self-certification (the maker is never the sole verifier), and human eyes are required for",
    "  visual, audio, or feel surfaces.",
    "",
    "These are defaults, not suggestions. Deviate only where a skill's own text defines an",
    "exception, and say so when you do. Each skill's full guidance is installed alongside this file",
    "(under `.claude/skills/`, `.agents/skills/`, `.cursor/rules/`, `.github/instructions/`, or the sections below,",
    "depending on your tool).",
  ].join("\n");
}

/** The marker-guarded contract region embedded verbatim in `AGENTS.md` (owned or appended). */
export function renderStandingModeSection(): string {
  return `${STANDING_MODE_START}\n${renderStandingModeContract()}\n${STANDING_MODE_END}`;
}

/**
 * One-line reference the cursor/copilot renderers prepend to their generated content instead of
 * the full block (single source of truth — the block lives only in `AGENTS.md`). Belt-and-
 * suspenders: current Cursor and GitHub Copilot both read root `AGENTS.md` natively.
 */
export const STANDING_MODE_REFERENCE =
  "> This project's working mode is defined in `AGENTS.md` at the repository root (the Nockta " +
  "standing contract) — it governs all agent work here.";

export type EnsureAction = "created" | "appended" | "refreshed" | "unchanged";

export interface EnsureResult {
  path: string;
  action: EnsureAction;
}

/**
 * Idempotently upserts a marker-guarded region into `content`. Returns the new content and which
 * action was taken. Never touches bytes outside the `START..END` region — consumer content around
 * it is preserved verbatim.
 */
function upsertGuardedRegion(
  content: string | null,
  regionInner: string,
  freshFileHeader: string | null,
): { next: string; action: EnsureAction } {
  const region = `${STANDING_MODE_START}\n${regionInner}\n${STANDING_MODE_END}`;

  if (content === null) {
    const body = freshFileHeader ? `${freshFileHeader}\n\n${region}\n` : `${region}\n`;
    return { next: body, action: "created" };
  }

  const startIdx = content.indexOf(STANDING_MODE_START);
  const endIdx = content.indexOf(STANDING_MODE_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + STANDING_MODE_END.length);
    const next = `${before}${region}${after}`;
    return { next, action: next === content ? "unchanged" : "refreshed" };
  }

  // Present but no marker region — append, never clobber.
  const trimmed = content.replace(/\s*$/, "");
  const next = `${trimmed}\n\n${region}\n`;
  return { next, action: "appended" };
}

/**
 * Ensures root `AGENTS.md` carries the marker-guarded standing-mode section. Called ONLY when the
 * `agent` adapter is NOT selected (when it IS selected, the agent renderer owns `AGENTS.md` and the
 * block is its preamble — see this module's header). Existing-repo-safe and idempotent: a re-run
 * never duplicates the region.
 */
export function ensureAgentsMdStandingMode(targetDir: string): EnsureResult {
  const path = join(targetDir, AGENTS_MD_BASENAME);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;

  const freshHeader = [
    "# AGENTS.md",
    "",
    "> Working-mode contract generated by [inject-nockta-skills](https://github.com/nockta). The",
    "> Nockta skills installed in this repo (see `.claude/skills/`, `.agents/skills/`, `.cursor/rules/`,",
    "> and/or `.github/instructions/`) govern how agents work here.",
  ].join("\n");

  const { next, action } = upsertGuardedRegion(existing, renderStandingModeContract(), freshHeader);
  if (action !== "unchanged") writeFileSync(path, next, "utf8");
  return { path, action };
}

/**
 * Ensures root `CLAUDE.md` carries a marker-guarded `@AGENTS.md` import line (Claude Code pulls the
 * imported file into context at launch). Always a consumer-shared, untracked side-effect — never
 * hash-tracked. Existing-repo-safe and idempotent. Called only when the `claude` adapter is
 * selected.
 */
export function ensureClaudeMdReference(targetDir: string): EnsureResult {
  const path = join(targetDir, "CLAUDE.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;

  // The imported file is the single source of truth; the surrounding comment explains the line for
  // a human reader who opens CLAUDE.md.
  const regionInner = [
    "<!-- Nockta standing contract: the line below imports the repo-root working-mode file. -->",
    "@AGENTS.md",
  ].join("\n");

  const freshHeader = "# CLAUDE.md";
  const { next, action } = upsertGuardedRegion(existing, regionInner, freshHeader);
  if (action !== "unchanged") writeFileSync(path, next, "utf8");
  return { path, action };
}

/**
 * The one entry point orchestrators call after rendering adapters on a REAL target dir. Applies the
 * standing-mode side effects appropriate to the selected adapters:
 *   - `claude` selected -> ensure the `@AGENTS.md` reference in `CLAUDE.md`.
 *   - `agent` NOT selected -> ensure the marker-guarded block in `AGENTS.md` (when agent IS
 *     selected, its renderer already owns `AGENTS.md` with the block as preamble).
 * Returns the actions taken (for reporting/testing). Never throws on a healthy filesystem; safe to
 * call on every install/repair/upgrade run.
 */
export function applyStandingMode(options: {
  targetDir: string;
  adapters: readonly string[];
}): { agents?: EnsureResult; claude?: EnsureResult } {
  const out: { agents?: EnsureResult; claude?: EnsureResult } = {};
  if (!options.adapters.includes("agent")) {
    out.agents = ensureAgentsMdStandingMode(options.targetDir);
  }
  if (options.adapters.includes("claude")) {
    out.claude = ensureClaudeMdReference(options.targetDir);
  }
  return out;
}
