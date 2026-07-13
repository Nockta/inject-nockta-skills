import { join } from "node:path";
import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { renderAdapters } from "./render-adapters.js";
import { writeGeneratedManifest } from "./write-manifest.js";
import { writeMonorepoSkillsProfile } from "./write-profile.js";
import { writeTargetsFile } from "./write-targets.js";
import { InvalidSkillSelectionError, resolveSkillSelection } from "./skill-selection.js";
import { applyStandingMode } from "./standing-mode.js";
import { sha256File } from "../utils/hash.js";
import type { AdapterType } from "../types/adapter.js";
import type { GeneratedFileRecord } from "../types/generated-manifest.js";
import type { RepoType } from "../types/repo-type.js";
import type { TargetRecord } from "../types/target.js";
import type { SkippedSkill } from "../adapters/types.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";

export interface MonorepoInstallTarget {
  name: string;
  path: string;
  /** decisions.md D22 — one or more repo types; a single-type target still passes a one-element array. */
  repoTypes: RepoType[];
}

export interface InjectSkillsMonorepoOptions {
  targets: MonorepoInstallTarget[];
  adapters: AdapterType[];
  /** Monorepo root. */
  targetDir: string;
  packsRoot?: string;
  packageVersion: string;
  /** Raw `--exclude-skills` names (decisions.md D19), root-scoped (spec §9.4 — one root-rendered set). */
  excludeSkills?: string[];
  /** Raw `--include-skills` names (decisions.md D19), root-scoped. */
  includeSkills?: string[];
}

export interface MonorepoSkippedPack {
  name: string;
  missingSkills: string[];
}

export interface InjectSkillsMonorepoResult {
  /** Union of installable pack names across every target, rendered once at root (spec §9.4). */
  installedPacks: string[];
  skippedPacks: MonorepoSkippedPack[];
  missingPacks: string[];
  renderedFiles: GeneratedFileRecord[];
  skippedSkills: SkippedSkill[];
  /** Per-target records for `.nockta/targets.json` (spec §9.3). */
  targetRecords: TargetRecord[];
  profilePath: string;
  manifestPath: string;
  targetsPath: string;
  /** The VALIDATED, normalized deltas actually applied this run (decisions.md D19). */
  skillSelection: SkillSelectionDeltas;
}

/**
 * Monorepo install orchestrator (spec §7.3, §9, §11 — mirrors `inject-skills.ts`'s
 * single-project shape). Root adapter placement (spec §9.4): packs across ALL targets are
 * resolved into ONE union set and rendered ONCE at the monorepo root — there is no per-target
 * `.claude/` output. `common` + `monorepo` are always included (spec §5.2/§5.3, via
 * `resolvePacks({ monorepo: true })`), plus each target's own repo-type pack when installable
 * (D6 gate — unauthored packs are reported in `skippedPacks`, never silently dropped).
 *
 * `targetRecords[i].installedPacks` is each target's OWN resolved+installable pack list (spec
 * §9.3 example: `["common", "monorepo", "next"]`) — narrower than the union `installedPacks`
 * returned above whenever targets have different repo types, by design (spec §9.3's own
 * example shows this: the `api` target's `installedPacks` doesn't list `next`).
 */
export function injectSkillsMonorepo(options: InjectSkillsMonorepoOptions): InjectSkillsMonorepoResult {
  // D22 union resolution: flatten every target's repoTypes[] into one deduped set before
  // resolving packs — `resolvePacks()` already treats `requestedPacks` as a set (dedups
  // internally), so a type named by two different targets, or by one multi-type target, still
  // only ever resolves its pack once.
  const distinctRepoTypes = [...new Set(options.targets.flatMap((t) => t.repoTypes))];

  const unionResolved = resolvePacks({
    requestedPacks: distinctRepoTypes,
    monorepo: true,
    packsRoot: options.packsRoot,
  });

  const packsRoot = options.packsRoot ?? getPacksPath();
  const catalog = buildSkillCatalog(unionResolved.installable, packsRoot);
  const selection = resolveSkillSelection({
    catalog,
    excluded: options.excludeSkills,
    included: options.includeSkills,
    adapters: options.adapters,
    repoTypes: distinctRepoTypes,
  });
  if (!selection.ok) {
    throw new InvalidSkillSelectionError(selection.errors);
  }

  const { written, skipped } = renderAdapters({
    targetDir: options.targetDir,
    adapters: options.adapters,
    packs: unionResolved.installable,
    packsRoot: options.packsRoot,
    effectiveSkills: selection.effective,
  });

  const generatedAt = new Date().toISOString();
  // D34 addendum (model b): a root AGENTS.md merged into pre-existing consumer content is an
  // untracked side-effect (see `inject-skills.ts` for the full rationale) — dropped from the
  // manifest so a consumer's own edits never trip doctor.
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

  const targetRecords: TargetRecord[] = options.targets.map((target) => {
    const perTargetResolved = resolvePacks({
      requestedPacks: target.repoTypes,
      monorepo: true,
      packsRoot: options.packsRoot,
    });
    return {
      name: target.name,
      path: target.path,
      repoTypes: target.repoTypes,
      installedPacks: perTargetResolved.installable.map((p) => p.name).sort(),
    };
  });

  writeMonorepoSkillsProfile({
    targetDir: options.targetDir,
    installedPacks: unionResolved.installable.map((p) => p.name).sort(),
    installedAdapters: options.adapters,
    packageVersion: options.packageVersion,
    skillSelection: selection.deltas,
  });

  writeTargetsFile(options.targetDir, targetRecords);
  writeGeneratedManifest(options.targetDir, renderedFiles);

  // Standing-mode contract side effects (decisions.md D34) at the monorepo ROOT — spec §9.4's
  // "one adapter output set at root" applies to AGENTS.md/CLAUDE.md too. Untracked, existing-repo-
  // safe, idempotent (see `core/standing-mode.ts`).
  applyStandingMode({ targetDir: options.targetDir, adapters: options.adapters });

  return {
    installedPacks: unionResolved.installable.map((p) => p.name).sort(),
    skippedPacks: unionResolved.planned.map((p) => ({
      name: p.name,
      missingSkills: p.skills.filter((s) => !s.hasContent).map((s) => s.name),
    })),
    missingPacks: unionResolved.missing,
    renderedFiles,
    skippedSkills: skipped,
    targetRecords,
    profilePath: join(options.targetDir, ".nockta", "skills-profile.json"),
    manifestPath: join(options.targetDir, ".nockta", "generated-manifest.json"),
    targetsPath: join(options.targetDir, ".nockta", "targets.json"),
    skillSelection: selection.deltas,
  };
}
