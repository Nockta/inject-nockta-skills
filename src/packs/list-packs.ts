import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { PackManifest } from "../types/pack.js";
import { getPacksPath } from "./get-pack-path.js";
import { readPackManifest } from "./read-pack-manifest.js";

export interface PackEntry {
  /** Pack directory name, e.g. "next" (same as `manifest.name`). */
  name: string;
  /** Absolute path to the pack directory (`<packsRoot>/<name>`). */
  path: string;
  manifest: PackManifest;
}

/**
 * Enumerates every bundled pack under `packsRoot` (default: this package's
 * own `packs/`) and parses each `pack.json`. Sorted by directory name for a
 * stable, deterministic order — `list --json` depends on it.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §11
 * (`src/packs/list-packs.ts`), §12.
 */
export function listPacks(packsRoot: string = getPacksPath()): PackEntry[] {
  const dirNames = readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return dirNames.map((name) => {
    const path = join(packsRoot, name);
    return { name, path, manifest: readPackManifest(path) };
  });
}
