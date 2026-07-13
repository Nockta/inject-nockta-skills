/**
 * Programmatic surface of inject-nockta-skills.
 *
 * Note (decisions.md D7 / spec §11.1): `create-nockta-repo` does NOT
 * depend on this package or import from here — it spawns the CLI as a
 * child process. This entry point exists for this package's own tests
 * and any future internal reuse, not as an external integration point.
 */
export type { RepoType } from "./types/repo-type.js";
export { REPO_TYPES, isRepoType } from "./types/repo-type.js";

export type { AdapterType } from "./types/adapter.js";
export { ADAPTER_TYPES, isAdapterType } from "./types/adapter.js";

export type { CliCommandName, JsonResult, ExitCode } from "./types/json-result.js";
export { EXIT_CODES } from "./types/json-result.js";

// D21 proof-of-done surface: the pure, `packsRoot`-injectable command builders
// (`test/skill-selection-e2e.test.ts`'s own mechanism) re-exported here so they are reachable
// from the BUILT `dist/index.js` too, not just unbuilt `src/` under vitest — see this file's own
// top-of-file doc comment ("this package's own tests and any future internal reuse").
export { buildInstallResult } from "./commands/install.js";
export type { InstallCliOptions, InstallResult } from "./commands/install.js";
export { buildDoctorResult } from "./commands/doctor.js";
export { buildUpgradeResult } from "./commands/upgrade.js";

// D22 proof-of-done surface: workspace-walking repo-type detection, reachable from the BUILT
// `dist/index.js` for the same reason as the D21 exports above (demo/reuse without a second
// unbuilt-vs-built code path).
export { detectRepoType, detectRepoTypeAcrossWorkspace } from "./core/detect-repo-type.js";
export type { RepoTypeGuess, WorkspaceRepoTypeGuess, DetectRepoTypeWorkspaceResult } from "./core/detect-repo-type.js";
