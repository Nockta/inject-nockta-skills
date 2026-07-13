import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";

const LOCKFILE_BY_MANAGER: Array<[string, PackageManagerName]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

/**
 * Best-effort package manager detection for the target repo, purely from
 * lockfile presence at `targetDir`. Returns `undefined` when no known
 * lockfile is found (the `packageManager` field on
 * `NocktaSkillsProfile`/`NocktaMonorepoSkillsProfile` is optional — spec
 * §10.1/§10.2 — precisely for this case).
 */
export function detectPackageManager(targetDir: string): PackageManagerName | undefined {
  for (const [lockfile, manager] of LOCKFILE_BY_MANAGER) {
    if (existsSync(join(targetDir, lockfile))) return manager;
  }
  return undefined;
}
