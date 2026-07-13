import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPackagePath } from "../packs/get-pack-path.js";

/**
 * Reads the running `inject-nockta-skills` package's own version from its
 * `package.json` (via `getPackagePath()`'s package-root resolution — works
 * from both `dist/cli.js` and unbuilt `src/`). Used by every command that
 * needs "the currently running package version" (spec §10.3, §13.4
 * Upgrade): `install`, `doctor`, `repair`, `upgrade`.
 *
 * Extracted from `commands/install.ts`'s previously-local
 * `readPackageVersion()` (Milestone 3) so M4's maintenance commands do not
 * duplicate it — same behavior, same package-root resolution.
 */
export function readRunningPackageVersion(): string {
  const pkgPath = join(getPackagePath(), "package.json");
  return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
}
