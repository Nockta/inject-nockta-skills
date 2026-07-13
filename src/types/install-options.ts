import type { AdapterType } from "./adapter.js";
import type { RepoType } from "./repo-type.js";

/**
 * Resolved, validated options for a non-interactive single-project install
 * (spec §7.2, §13.1). Monorepo `--target` install (spec §7.3) is out of
 * scope for Milestone 3 — this shape covers the `--type`/`--adapters`/`--yes`
 * path only; see src/CONTEXT.md for the recorded scope note.
 */
export interface InstallOptions {
  /** decisions.md D22 — one or more repo types; a single-type install still passes a one-element array. */
  repoTypes: RepoType[];
  adapters: AdapterType[];
  /** Non-interactive confirmation — required in M3 (no wizard confirm step exists yet). */
  yes: boolean;
  /** Repo root to install into. Defaults to `process.cwd()` at the CLI boundary. */
  targetDir: string;
  /** Override for tests; defaults to the bundled `packs/`. */
  packsRoot?: string;
  /** Raw `--exclude-skills` names (decisions.md D19) — validated by `core/skill-selection.ts`. */
  excludeSkills?: string[];
  /** Raw `--include-skills` names (decisions.md D19) — validated by `core/skill-selection.ts`. */
  includeSkills?: string[];
}
