import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { toPlanMap } from "./render-plan.js";
import { sha256File } from "../utils/hash.js";
import { emptyCounts } from "../types/doctor.js";
import type { ClassificationCounts, ClassifiedFile } from "../types/doctor.js";
import type { GeneratedFileRecord, GeneratedManifest } from "../types/generated-manifest.js";
import type { RenderedFile } from "../adapters/types.js";

/**
 * Scan roots for "unknown" (untracked) file detection — the per-skill FULL-INJECTION adapter output
 * dirs: `.claude/skills/` + `.claude/agents/` (claude) and `.agents/skills/` (antigravity, D35 —
 * the antigravity renderer's `.agents/skills/<skill>/` mirror of `.claude/skills/`). cursor/copilot/
 * agent produce single tracked files (`.cursor/rules/*.mdc`, `.github/instructions/...`, root
 * `AGENTS.md`), not open dirs where a stray untracked file could appear, so they need no scan root
 * here. Still root-rendered (spec §9.4 "one adapter tree at root"), so single-project and monorepo
 * doctor share these roots unchanged.
 */
export const MANAGED_SCAN_ROOTS = [
  join(".claude", "skills"),
  join(".claude", "agents"),
  join(".agents", "skills"),
];

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/** Recursively lists every file under `MANAGED_SCAN_ROOTS`, relative to `targetDir`, posix-slashed. */
export function scanManagedAdapterFiles(targetDir: string): string[] {
  const found: string[] = [];

  function walk(absDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        found.push(toPosix(relative(targetDir, abs)));
      }
    }
  }

  for (const root of MANAGED_SCAN_ROOTS) {
    const absRoot = join(targetDir, root);
    if (existsSync(absRoot)) walk(absRoot);
  }

  return found;
}

export interface ClassifyManifestOptions {
  targetDir: string;
  manifest: GeneratedManifest | undefined;
  /** The canonical "what should exist right now" set — from `computeRenderPlan()`. */
  canonicalPlan: RenderedFile[];
  packageVersion: string;
}

export interface ClassifyManifestResult {
  counts: ClassificationCounts;
  files: ClassifiedFile[];
  unknownFiles: string[];
}

/**
 * Classifies every file tracked in a `GeneratedManifest` as intact/missing/modified/stale
 * (spec §10.3), plus scans the managed adapter output dirs for untracked ("unknown") files.
 *
 * Extracted from `doctor-checks.ts` (M4) so BOTH single-project doctor (one `repoType`) and
 * monorepo doctor (a UNION `canonicalPlan` across every target's `repoType`, M5) share the
 * exact same classification rules instead of two copies drifting apart. Single-project
 * behavior is unchanged — `doctor-checks.ts` now delegates here instead of inlining this loop.
 */
export function classifyManifestRecords(options: ClassifyManifestOptions): ClassifyManifestResult {
  const canonicalByPath = toPlanMap(options.canonicalPlan);
  const counts = emptyCounts();
  const files: ClassifiedFile[] = [];

  const records: GeneratedFileRecord[] = options.manifest?.files ?? [];
  const trackedPaths = new Set(records.map((r) => r.path));

  for (const record of records) {
    const absPath = join(options.targetDir, record.path);
    const canonical = canonicalByPath.get(record.path);

    if (!existsSync(absPath)) {
      counts.missing++;
      files.push({
        path: record.path,
        classification: "missing",
        adapter: record.adapter,
        pack: record.pack,
        skill: record.skill,
        detail: "tracked in manifest but not found on disk",
      });
      continue;
    }

    const currentOutputHash = sha256File(absPath);
    if (currentOutputHash !== record.outputHash) {
      counts.modified++;
      files.push({
        path: record.path,
        classification: "modified",
        adapter: record.adapter,
        pack: record.pack,
        skill: record.skill,
        detail: "on-disk content differs from the hash recorded at generation time",
      });
      continue;
    }

    const currentSourceHash = canonical ? (canonical.sourceContentHash ?? sha256File(canonical.sourcePath)) : undefined;
    const versionStale = record.generatorVersion !== options.packageVersion;
    const sourceStale = currentSourceHash !== undefined && currentSourceHash !== record.sourceHash;
    const vanished = canonical === undefined;

    if (versionStale || sourceStale || vanished) {
      counts.stale++;
      const reasons: string[] = [];
      if (versionStale) reasons.push(`generatorVersion ${record.generatorVersion} != running ${options.packageVersion}`);
      if (sourceStale) reasons.push("bundled source content has changed since generation");
      if (vanished) reasons.push("no longer part of the current canonical render plan (pack/skill composition changed)");
      files.push({
        path: record.path,
        classification: "stale",
        adapter: record.adapter,
        pack: record.pack,
        skill: record.skill,
        detail: reasons.join("; "),
      });
      continue;
    }

    counts.intact++;
    files.push({
      path: record.path,
      classification: "intact",
      adapter: record.adapter,
      pack: record.pack,
      skill: record.skill,
    });
  }

  const unknownFiles = scanManagedAdapterFiles(options.targetDir).filter((path) => !trackedPaths.has(path));
  counts.unknown = unknownFiles.length;

  return { counts, files, unknownFiles };
}
