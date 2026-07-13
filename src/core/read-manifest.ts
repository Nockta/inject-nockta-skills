import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedManifest } from "../types/generated-manifest.js";

/**
 * Reads `.nockta/generated-manifest.json` from a target dir, if present and
 * parseable. Returns `undefined` on any problem (missing file, invalid
 * JSON, missing `files` array) rather than throwing — mirrors
 * `read-profile.ts`'s `readSkillsProfile()` (same never-throw convention).
 *
 * New in M4 — no reader existed for the manifest before doctor needed one
 * (M3's `write-manifest.ts` only ever wrote a fresh one during install).
 */
export function readGeneratedManifest(targetDir: string): GeneratedManifest | undefined {
  const manifestPath = join(targetDir, ".nockta", "generated-manifest.json");
  if (!existsSync(manifestPath)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as GeneratedManifest;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
