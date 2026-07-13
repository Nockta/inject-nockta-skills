import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared npm-workspace glob reading/expansion — extracted from `wizard/steps/select-targets.ts`
 * (M6) so `core/detect-repo-type.ts`'s D22 workspace-walking detection
 * (`detectRepoTypeAcrossWorkspace()`) can reuse the SAME glob-reading/expansion logic instead of
 * a second copy that could drift. Both callers get identical "which sub-package directories does
 * this repo declare" answers.
 */

/** Reads workspace globs from `package.json` `workspaces` and/or `pnpm-workspace.yaml`'s `packages:` list. Never throws. */
export function readWorkspaceGlobs(targetDir: string): string[] {
  const globs: string[] = [];

  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
      if (Array.isArray(pkg.workspaces)) {
        globs.push(...pkg.workspaces.filter((g): g is string => typeof g === "string"));
      } else if (pkg.workspaces && typeof pkg.workspaces === "object") {
        const packages = (pkg.workspaces as { packages?: unknown }).packages;
        if (Array.isArray(packages)) globs.push(...packages.filter((g): g is string => typeof g === "string"));
      }
    } catch {
      // ignore — mirrors detect-monorepo.ts's never-throws convention
    }
  }

  // Minimal, deliberately simple YAML reader for pnpm-workspace.yaml's `packages:` list —
  // NOT a general YAML parser (no dependency added for this). Handles the shape every fixture
  // and real pnpm-workspace.yaml in this repo family uses:
  //   packages:
  //     - apps/*
  //     - packages/*
  const yamlPath = join(targetDir, "pnpm-workspace.yaml");
  if (existsSync(yamlPath)) {
    try {
      const lines = readFileSync(yamlPath, "utf8").split("\n");
      let inPackages = false;
      for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, "");
        if (/^packages\s*:/.test(line.trim())) {
          inPackages = true;
          continue;
        }
        if (!inPackages) continue;
        if (line.trim() === "") continue;
        const item = line.match(/^\s*-\s*["']?([^"'\s]+)["']?\s*$/);
        if (item) {
          globs.push(item[1] as string);
          continue;
        }
        if (!/^\s/.test(rawLine)) inPackages = false; // dedent — left the packages: block
      }
    } catch {
      // ignore
    }
  }

  return [...new Set(globs)];
}

function isDir(absPath: string): boolean {
  try {
    return existsSync(absPath) && statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Expands ONE workspace glob into existing candidate directories. Deliberately shallow (wizard
 * prefill only, same spirit as `monorepo-doctor-checks.ts`'s "deliberately shallow" plausibility
 * check): supports a literal path, or a single trailing `<prefix>/*` wildcard segment (covers
 * every example in spec §9.2 — `apps/*`, `packages/*`). Multi-segment or `**` globs are not
 * expanded (returns nothing for that glob rather than guessing wrong). Only directories that
 * themselves look like a project (contain a `package.json`) are returned.
 */
export function expandWorkspaceGlob(targetDir: string, glob: string): string[] {
  const normalized = glob.trim().replace(/\/+$/, "");
  if (!normalized) return [];

  if (!normalized.includes("*")) {
    const abs = join(targetDir, normalized);
    return isDir(abs) ? [normalized] : [];
  }

  const starIdx = normalized.indexOf("*");
  const prefix = normalized.slice(0, starIdx).replace(/\/$/, "");
  const rest = normalized.slice(starIdx);
  if (rest !== "*") return []; // unsupported shape — skip rather than mis-expand

  const prefixAbs = join(targetDir, prefix);
  if (!isDir(prefixAbs)) return [];

  return readdirSync(prefixAbs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => (prefix ? `${prefix}/${entry.name}` : entry.name))
    .filter((relPath) => existsSync(join(targetDir, relPath, "package.json")))
    .sort();
}

/**
 * Lists every declared npm-workspace sub-package path (relative to `targetDir`) that resolves to
 * a real, `package.json`-bearing directory. Convenience wrapper combining
 * `readWorkspaceGlobs()` + `expandWorkspaceGlob()` — the exact pair `detectRepoTypeAcrossWorkspace()`
 * (decisions.md D22) and `wizard/steps/select-targets.ts`'s `discoverWorkspaceCandidates()` both
 * need. Never throws; returns `[]` when no workspace globs are declared or none expand.
 */
export function listWorkspacePackagePaths(targetDir: string): string[] {
  const globs = readWorkspaceGlobs(targetDir);
  const paths = new Set<string>();
  for (const glob of globs) {
    for (const path of expandWorkspaceGlob(targetDir, glob)) paths.add(path);
  }
  return [...paths].sort();
}
