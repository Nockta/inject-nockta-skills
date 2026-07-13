import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Monorepo signal files/fields this package checks for (spec §9.1).
 */
export type MonorepoSignal =
  | "pnpm-workspace.yaml"
  | "turbo.json"
  | "nx.json"
  | "lerna.json"
  | "rush.json"
  | "package.json:workspaces";

const SIGNAL_FILES: readonly Exclude<MonorepoSignal, "package.json:workspaces">[] = [
  "pnpm-workspace.yaml",
  "turbo.json",
  "nx.json",
  "lerna.json",
  "rush.json",
];

export interface DetectMonorepoResult {
  isMonorepo: boolean;
  signals: MonorepoSignal[];
}

/** True when root `package.json` has a non-empty `workspaces` field (array or `{ packages: [] }`). */
function hasWorkspacesField(rootDir: string): boolean {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces.length > 0;
    if (pkg.workspaces && typeof pkg.workspaces === "object") {
      const packages = (pkg.workspaces as { packages?: unknown }).packages;
      return Array.isArray(packages) && packages.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Monorepo signal detection (spec §9.1, §11 `src/core/detect-monorepo.ts`). Purely additive
 * signal-gathering — never throws, never used to BLOCK a `--target` install (see
 * `commands/install.ts`'s "chosen semantics" note): an explicit `--target` always attempts a
 * monorepo install; this function's result is only used to decide whether to WARN when no
 * signal is present and `--monorepo` was not passed either.
 */
export function detectMonorepo(rootDir: string): DetectMonorepoResult {
  const signals: MonorepoSignal[] = [];
  for (const file of SIGNAL_FILES) {
    if (existsSync(join(rootDir, file))) signals.push(file);
  }
  if (hasWorkspacesField(rootDir)) signals.push("package.json:workspaces");
  return { isMonorepo: signals.length > 0, signals };
}
