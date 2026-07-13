import { join } from "node:path";
import { listWorkspacePackagePaths } from "../../core/workspace-globs.js";
import { detectRepoType } from "../../core/detect-repo-type.js";
import type { RepoTypeGuess } from "../../core/detect-repo-type.js";

export interface WorkspaceCandidate {
  /** Path relative to the monorepo root, e.g. "apps/web". */
  path: string;
  guesses: RepoTypeGuess[];
}

/**
 * Wizard step 2 (monorepo branch, spec §7.1): discovers monorepo target CANDIDATES from the
 * workspace globs (`core/workspace-globs.ts`, shared with `detectRepoTypeAcrossWorkspace()`,
 * decisions.md D22), and runs `detectRepoType()` against each candidate so step 3 ("review/edit
 * detected targets") can offer a per-target type guess. Pure filesystem read — no prompting.
 * Returns an empty array when no workspace globs are found or none expand to a real
 * `package.json`-bearing directory; the wizard's manual target-entry fallback covers that case.
 */
export function discoverWorkspaceCandidates(targetDir: string): WorkspaceCandidate[] {
  return listWorkspacePackagePaths(targetDir).map((path) => ({
    path,
    guesses: detectRepoType(join(targetDir, path)).guesses,
  }));
}
