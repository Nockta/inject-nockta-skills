import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256File } from "../utils/hash.js";
import { mergeAgentsMd, unwrapAgentsRegion } from "./standing-mode.js";
import { AGENTS_MD_RELATIVE_PATH } from "../adapters/agent/render.js";
import type { RenderedFile } from "../adapters/types.js";
import type { GeneratedFileRecord } from "../types/generated-manifest.js";

export type ApplyMode = "repair" | "upgrade";

export interface ApplyRenderPlanOptions {
  targetDir: string;
  /** The canonical "what should exist right now" set — from `computeRenderPlan()`. */
  canonicalPlan: RenderedFile[];
  /** The manifest records read before this run (may be empty if the manifest was missing/invalid). */
  existingRecords: GeneratedFileRecord[];
  force: boolean;
  packageVersion: string;
  mode: ApplyMode;
}

export interface ApplyRenderPlanResult {
  /** New/updated manifest records — the full replacement set for `.nockta/generated-manifest.json`. */
  records: GeneratedFileRecord[];
  restored: string[];
  refreshed: string[];
  skippedModified: string[];
  forcedOverwrites: string[];
  unchangedIntact: string[];
}

function writeFileEnsuringDir(outputPath: string, content: Buffer): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

/**
 * The root `AGENTS.md` the `agent` adapter owns — the ONE file that must be merged (never
 * blind-copied) so consumer content outside Nockta's guard region survives (decisions.md D34
 * addendum). Deliberately narrow: agent adapter + the exact root path, nothing else.
 */
function isAgentsRootEntry(entry: RenderedFile): boolean {
  return entry.adapter === "agent" && entry.relativePath === AGENTS_MD_RELATIVE_PATH;
}


/**
 * The shared engine behind both `repair` and `upgrade` (spec §7.5/§7.6,
 * §10.3, §13.3/§13.4, decisions.md D3). Given the canonical render plan
 * (what a fresh install would produce right now, see `render-plan.ts`) and
 * the previously recorded manifest, decides — per file — whether to
 * restore, refresh, skip-with-warning, or force-overwrite, and returns the
 * fresh manifest record set. Never touches paths outside `canonicalPlan`
 * (so "unknown" files, per doctor's definition, are never written to,
 * moved, or deleted by construction — spec §14).
 *
 * Per-file policy (D3 policy, spec §10.3):
 * - missing (does not exist on disk) -> always restored, regardless of mode.
 * - exists AND matches its manifest record's `outputHash` (or has no prior
 *   record but happens to already match canonical bytes) -> "safe": repair
 *   only refreshes it when stale (generatorVersion or sourceHash drift);
 *   upgrade always refreshes it (spec §13.4 "re-renders ALL generated
 *   output using the currently running package version").
 * - exists AND does NOT match its manifest record's `outputHash` (user-
 *   modified), OR exists with no prior record at all (unknown provenance)
 *   -> WARN and skip, unless `force` — never blind-overwritten (spec §14).
 */
export function applyRenderPlan(options: ApplyRenderPlanOptions): ApplyRenderPlanResult {
  const existingByPath = new Map(options.existingRecords.map((r) => [r.path, r]));
  const canonicalPaths = new Set(options.canonicalPlan.map((f) => f.relativePath));

  const restored: string[] = [];
  const refreshed: string[] = [];
  const skippedModified: string[] = [];
  const forcedOverwrites: string[] = [];
  const unchangedIntact: string[] = [];
  const records: GeneratedFileRecord[] = [];

  const now = new Date().toISOString();

  function writeFreshRecord(entry: RenderedFile): GeneratedFileRecord {
    const outputPath = join(options.targetDir, entry.relativePath);
    // `content` (when set — cursor/copilot's CONSTRUCTED, non-1:1-copy output, see
    // `src/adapters/types.ts`) carries the actual bytes to write; falls back to reading
    // `sourcePath` verbatim for claude's straight-copy case (unchanged since M3).
    writeFileEnsuringDir(outputPath, entry.content ?? readFileSync(entry.sourcePath));
    return {
      path: entry.relativePath,
      adapter: entry.adapter,
      pack: entry.pack,
      skill: entry.skill,
      sourceHash: entry.sourceContentHash ?? sha256File(entry.sourcePath),
      outputHash: sha256File(outputPath),
      generatedAt: now,
      generatorVersion: options.packageVersion,
    };
  }

  for (const entry of options.canonicalPlan) {
    // D34 addendum — root AGENTS.md is MERGED, never blind-copied: Nockta's guard region is
    // refreshed in place while any consumer content around it is preserved verbatim. This
    // deliberately bypasses the generic user-modified guard below — for AGENTS.md, bytes OUTSIDE our
    // region are ALWAYS the consumer's (kept), bytes INSIDE are ALWAYS ours (restored), so there is
    // nothing to "protect and skip". Tracking follows model b: manifest-track only when the file is
    // wholly Nockta's (no consumer content); an AGENTS.md merged into consumer content is left
    // untracked (an existing-repo-safe side-effect kept correct by this same idempotent re-merge).
    if (isAgentsRootEntry(entry)) {
      const outputPath = join(options.targetDir, entry.relativePath);
      const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
      const nocktaBody = unwrapAgentsRegion((entry.content ?? Buffer.from("")).toString("utf8"));
      const { content: mergedContent, hadConsumerContent } = mergeAgentsMd(existing, nocktaBody);
      writeFileEnsuringDir(outputPath, Buffer.from(mergedContent, "utf8"));
      (existing === null ? restored : refreshed).push(entry.relativePath);
      if (!hadConsumerContent) {
        records.push({
          path: entry.relativePath,
          adapter: entry.adapter,
          pack: entry.pack,
          skill: entry.skill,
          sourceHash: entry.sourceContentHash ?? sha256File(entry.sourcePath),
          outputHash: sha256File(outputPath),
          generatedAt: now,
          generatorVersion: options.packageVersion,
        });
      }
      // hadConsumerContent -> untracked: emit no record; any prior AGENTS.md record is intentionally
      // dropped (it is in canonicalPaths, so the tail preservation loop won't re-add it).
      continue;
    }

    const outputPath = join(options.targetDir, entry.relativePath);
    const existingRecord = existingByPath.get(entry.relativePath);
    const onDisk = existsSync(outputPath);

    if (!onDisk) {
      records.push(writeFreshRecord(entry));
      restored.push(entry.relativePath);
      continue;
    }

    const currentOutputHash = sha256File(outputPath);
    const matchesRecord = existingRecord !== undefined && currentOutputHash === existingRecord.outputHash;

    if (!matchesRecord) {
      // Either no prior record (unknown provenance) or content diverges
      // from what was last generated (user-modified). Never blind-overwrite.
      if (options.force) {
        records.push(writeFreshRecord(entry));
        forcedOverwrites.push(entry.relativePath);
      } else {
        skippedModified.push(entry.relativePath);
        if (existingRecord) records.push(existingRecord); // preserve tracking as-is
        // No prior record and not forced: leave untracked (matches "never
        // touches unknown files" — this file simply isn't added to the
        // manifest either, same as before this run).
      }
      continue;
    }

    // Content on disk matches what we last generated — safe to consider refreshing.
    const currentSourceHash = entry.sourceContentHash ?? sha256File(entry.sourcePath);
    const stale =
      (existingRecord as GeneratedFileRecord).generatorVersion !== options.packageVersion ||
      (existingRecord as GeneratedFileRecord).sourceHash !== currentSourceHash;

    if (options.mode === "upgrade" || stale) {
      records.push(writeFreshRecord(entry));
      refreshed.push(entry.relativePath);
    } else {
      records.push(existingRecord as GeneratedFileRecord);
      unchangedIntact.push(entry.relativePath);
    }
  }

  // Preserve records for manifest entries that fell outside the canonical
  // plan entirely (e.g. a skill/pack composition change) — never dropped
  // silently, never touched on disk either.
  for (const record of options.existingRecords) {
    if (!canonicalPaths.has(record.path) && !records.some((r) => r.path === record.path)) {
      records.push(record);
    }
  }

  records.sort((a, b) => a.path.localeCompare(b.path));

  return { records, restored, refreshed, skippedModified, forcedOverwrites, unchangedIntact };
}
