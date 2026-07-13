import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the package root of `inject-nockta-skills` itself, so the bundled
 * `packs/` directory can be found regardless of how this module ends up
 * running. Spec: startup docs/inject-nockta-skills.updated.md §11
 * (`src/packs/get-pack-path.ts`), §2.2 (source layout).
 *
 * Two real runtime shapes have to both resolve correctly:
 *
 * - Built: `dist/cli.js` (or a tsup-emitted shared chunk) lives directly
 *   under `<packageRoot>/dist/`, one directory above the root — this is
 *   what a real `npx inject-nockta-skills` invocation runs.
 * - Source: `src/packs/get-pack-path.ts` lives under `<packageRoot>/src/packs/`,
 *   two directories above the root — this is what vitest runs directly
 *   against TS source, with no build step.
 *
 * `realpathSync` matters the same way it does in `cli.ts`'s `isMainModule()`:
 * package managers and `npx` caches install/invoke CLI files through
 * symlinks, and we want the real on-disk location, not the symlink path.
 */
function currentModulePath(): string {
  const url = import.meta.url;
  try {
    return realpathSync(fileURLToPath(url));
  } catch {
    return fileURLToPath(url);
  }
}

let cachedPackageRoot: string | undefined;

// A marker file that only exists directly under the real package root's
// packs/ dir, never under this module's own src/packs/ folder. Checking
// for a bare "packs" directory is NOT enough: this module's own source
// directory is also named src/packs/, so a naive `<candidate>/packs`
// exists-check would false-positive on `<root>/src` (whose child "packs"
// is just this module's own folder) when running unbuilt from src/.
const PACKS_MARKER = join("packs", "common", "pack.json");

export function getPackagePath(): string {
  if (cachedPackageRoot) return cachedPackageRoot;

  const moduleDir = dirname(currentModulePath());
  const distShapeRoot = join(moduleDir, ".."); // moduleDir = <root>/dist
  const srcShapeRoot = join(moduleDir, "..", ".."); // moduleDir = <root>/src/packs

  if (existsSync(join(distShapeRoot, PACKS_MARKER))) {
    cachedPackageRoot = distShapeRoot;
  } else if (existsSync(join(srcShapeRoot, PACKS_MARKER))) {
    cachedPackageRoot = srcShapeRoot;
  } else {
    // Neither candidate has a packs/ dir (e.g. a corrupted install). Fall
    // back to the dist-shape assumption, matching the published bin
    // entry's real layout, so callers get a sensible (if wrong) path
    // rather than an exception thrown from path math.
    cachedPackageRoot = distShapeRoot;
  }

  return cachedPackageRoot;
}

export function getPacksPath(): string {
  return join(getPackagePath(), "packs");
}

export function getPackPath(packName: string): string {
  return join(getPacksPath(), packName);
}
