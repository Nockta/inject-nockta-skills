import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTargetRecord } from "../types/target.js";
import type { TargetsFile } from "../types/target.js";

/**
 * Reads `.nockta/targets.json` from a target dir, if present, parseable, AND schema-valid. Every
 * target record is normalized through `normalizeTargetRecord()` (decisions.md D22) — a legacy
 * singular `repoType` on an on-disk record reads back as a one-element `repoTypes` (back-compat
 * read-shim; no published versions carry the old shape, but the shim costs nothing). Returns
 * `undefined` on any problem — mirrors `read-profile.ts` / `read-manifest.ts`'s never-throw
 * convention. Callers (`monorepo-doctor-checks.ts`, `commands/install.ts`) distinguish "file
 * absent" from "file invalid" via a separate `existsSync` check where that distinction matters
 * (spec §9.5 doctor validation).
 */
export function readTargetsFile(targetDir: string): TargetsFile | undefined {
  const targetsPath = join(targetDir, ".nockta", "targets.json");
  if (!existsSync(targetsPath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(targetsPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const f = parsed as Record<string, unknown>;
    if (typeof f.schemaVersion !== "number" || f.isMonorepo !== true || !Array.isArray(f.targets)) {
      return undefined;
    }

    const targets = f.targets.map((t) => normalizeTargetRecord(t));
    if (targets.some((t) => t === null)) return undefined;

    return {
      schemaVersion: f.schemaVersion,
      isMonorepo: true,
      targets: targets as NonNullable<(typeof targets)[number]>[],
    };
  } catch {
    return undefined;
  }
}
