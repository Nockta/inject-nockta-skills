import { isRepoType } from "./repo-type.js";
import type { RepoType } from "./repo-type.js";

/**
 * One monorepo target record inside `.nockta/targets.json`.
 * Spec: startup docs/inject-nockta-skills.updated.md §9.3.
 *
 * `repoTypes` (decisions.md D22, replaces the pre-D22 singular `repoType`): a target may span
 * multiple repo-type domains (e.g. a Shopify theme with a Vite/React asset frontend) — the union
 * of every named type's skill pack is installed. Single-type targets still record a one-element
 * array. `isValidTargetRecord()` below READS a legacy singular `repoType` on an old record as a
 * one-element `repoTypes` (back-compat read-shim) — no published versions exist with the old
 * shape, but the shim costs nothing and removes any migration cliff. Every WRITE always uses the
 * new `repoTypes` form (`core/write-targets.ts`).
 */
export interface TargetRecord {
  /** Derived from the target path's basename, e.g. "apps/web" -> "web". */
  name: string;
  /** Path relative to the monorepo root, e.g. "apps/web". */
  path: string;
  repoTypes: RepoType[];
  /** Pack names resolved+installable for THIS target alone (D6 gate), e.g. ["common", "monorepo", "next"]. */
  installedPacks: string[];
}

/**
 * `.nockta/targets.json` shape (spec §9.3). Root-owned metadata (decisions.md D5) — written
 * alongside `.nockta/skills-profile.json` by a monorepo install.
 */
export interface TargetsFile {
  schemaVersion: number;
  isMonorepo: true;
  targets: TargetRecord[];
}

export const TARGETS_SCHEMA_VERSION = 1;

/**
 * Normalizes one raw (`JSON.parse`d, untrusted) target record: accepts EITHER the current
 * `repoTypes: string[]` shape OR a legacy singular `repoType: string` (D22 read-shim,
 * `types/target.ts`'s own doc comment) and returns a record with `repoTypes` always present.
 * Returns `null` when neither shape is recoverable (not an object, missing name/path, etc.) —
 * mirrors `isValidTargetRecord()`'s never-throw convention.
 */
export function normalizeTargetRecord(value: unknown): TargetRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;

  if (typeof r.name !== "string" || r.name.length === 0) return null;
  if (typeof r.path !== "string" || r.path.length === 0) return null;
  if (!Array.isArray(r.installedPacks) || !r.installedPacks.every((p) => typeof p === "string")) return null;

  let repoTypes: unknown = r.repoTypes;
  if (repoTypes === undefined && typeof r.repoType === "string") {
    // Legacy read-shim (D22): a pre-D22 record's singular `repoType` becomes a one-element array.
    repoTypes = [r.repoType];
  }

  if (!Array.isArray(repoTypes) || repoTypes.length === 0) return null;
  if (!repoTypes.every((t): t is string => typeof t === "string" && isRepoType(t))) return null;

  return {
    name: r.name,
    path: r.path,
    repoTypes: repoTypes as RepoType[],
    installedPacks: r.installedPacks as string[],
  };
}

export function isValidTargetRecord(value: unknown): value is TargetRecord {
  return normalizeTargetRecord(value) !== null;
}

export function isValidTargetsFile(value: unknown): value is TargetsFile {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.schemaVersion === "number" &&
    f.isMonorepo === true &&
    Array.isArray(f.targets) &&
    f.targets.every(isValidTargetRecord)
  );
}
