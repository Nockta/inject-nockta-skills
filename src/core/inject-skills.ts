import { join } from "node:path";
import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { renderAdapters } from "./render-adapters.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { writeSkillsProfile } from "./write-profile.js";
import { InvalidSkillSelectionError, resolveSkillSelection } from "./skill-selection.js";
import { applyStandingMode } from "./standing-mode.js";
import { sha256File } from "../utils/hash.js";
import type { GeneratedFileRecord } from "../types/generated-manifest.js";
import type { InstallOptions } from "../types/install-options.js";
import type { SkippedSkill } from "../adapters/types.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";

export interface SkippedPack {
  name: string;
  missingSkills: string[];
}

export interface InjectSkillsResult {
  /** Installable pack names actually rendered this run. */
  installedPacks: string[];
  /** Planned packs (D6 gate) — reported, not errored (spec §5.10). */
  skippedPacks: SkippedPack[];
  /** Requested/`requires`-chained pack names with no matching pack directory at all. */
  missingPacks: string[];
  renderedFiles: GeneratedFileRecord[];
  /** Adapter-restricted OR selection-excluded skills within a rendered pack (spec §8.2, decisions.md D19). */
  skippedSkills: SkippedSkill[];
  profilePath: string;
  manifestPath: string;
  /** The VALIDATED, normalized deltas actually applied this run (decisions.md D19) — written into the profile verbatim. */
  skillSelection: SkillSelectionDeltas;
}

/**
 * Top-level install orchestrator (spec §11 `src/core/inject-skills.ts`,
 * §13.1 Install): resolves packs for the requested repo type, renders the
 * requested adapters for installable packs only, hashes every generated
 * file (D3), and writes `.nockta/skills-profile.json` +
 * `.nockta/generated-manifest.json`.
 *
 * Safety (spec §14): the only paths ever written are under `.claude/`
 * (via the adapter renderer) and `.nockta/` (profile + manifest) inside
 * `options.targetDir`. Nothing outside those two directories is touched.
 *
 * Callers are expected to check `missingPacks` before trusting
 * `installedPacks`/`renderedFiles` — a non-empty `missingPacks` means the
 * requested repo type's pack (or one of its `requires`) does not exist on
 * disk at all, distinct from a `skippedPacks` entry (pack exists, just not
 * installable yet per D6). This function still writes the profile/manifest
 * in that case (reflecting whatever *did* resolve, e.g. `common`), leaving
 * the exit-code decision to the caller (`commands/install.ts`, spec §7.9
 * exit code 2).
 */
export function injectSkills(options: InstallOptions & { packageVersion: string }): InjectSkillsResult {
  const resolved = resolvePacks({
    requestedPacks: options.repoTypes,
    monorepo: false,
    packsRoot: options.packsRoot,
  });

  const packsRoot = options.packsRoot ?? getPacksPath();
  const catalog = buildSkillCatalog(resolved.installable, packsRoot);
  const selection = resolveSkillSelection({
    catalog,
    excluded: options.excludeSkills,
    included: options.includeSkills,
    adapters: options.adapters,
    repoTypes: options.repoTypes,
  });
  if (!selection.ok) {
    // Caller (`commands/install.ts`) catches this and maps it to exit 1 — see
    // `InvalidSkillSelectionError`'s own doc comment.
    throw new InvalidSkillSelectionError(selection.errors);
  }

  const { written, skipped } = renderAdapters({
    targetDir: options.targetDir,
    adapters: options.adapters,
    packs: resolved.installable,
    packsRoot: options.packsRoot,
    effectiveSkills: selection.effective,
  });

  const generatedAt = new Date().toISOString();
  // D34 addendum (model b): when the agent renderer MERGED its region into a pre-existing consumer
  // AGENTS.md, that file is an untracked, existing-repo-safe side-effect (like the CLAUDE.md /
  // agent-not-selected AGENTS.md side-effects) — never hash-tracked as if we owned it, so a consumer
  // editing their own content never trips doctor's "modified". A wholly-Nockta AGENTS.md stays
  // tracked. Correctness of the untracked case is guaranteed by the idempotent re-merge on every run.
  const renderedFiles: GeneratedFileRecord[] = written
    .filter((file) => !file.mergedIntoConsumerContent)
    .map((file) => ({
      path: file.relativePath,
      adapter: file.adapter,
      pack: file.pack,
      skill: file.skill,
      sourceHash: file.sourceContentHash ?? sha256File(file.sourcePath),
      outputHash: sha256File(file.outputPath),
      generatedAt,
      generatorVersion: options.packageVersion,
    }));

  writeSkillsProfile({
    targetDir: options.targetDir,
    repoTypes: options.repoTypes,
    installedPacks: resolved.installable.map((p) => p.name),
    installedAdapters: options.adapters,
    packageVersion: options.packageVersion,
    skillSelection: selection.deltas,
  });

  writeGeneratedManifest(options.targetDir, renderedFiles);

  // Standing-mode contract side effects (decisions.md D34) — root AGENTS.md (when the agent adapter
  // is not selected) + CLAUDE.md @import (when claude is selected). Untracked, existing-repo-safe,
  // idempotent — see `core/standing-mode.ts`. Runs on the REAL target only (never in
  // `computeRenderPlan()`'s scratch dir).
  applyStandingMode({ targetDir: options.targetDir, adapters: options.adapters });

  return {
    installedPacks: resolved.installable.map((p) => p.name).sort(),
    skippedPacks: resolved.planned.map((p) => ({
      name: p.name,
      missingSkills: p.skills.filter((s) => !s.hasContent).map((s) => s.name),
    })),
    missingPacks: resolved.missing,
    renderedFiles,
    skippedSkills: skipped,
    profilePath: join(options.targetDir, ".nockta", "skills-profile.json"),
    manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json"),
    skillSelection: selection.deltas,
  };
}
