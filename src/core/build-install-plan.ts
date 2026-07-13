import { resolvePacks } from "../packs/resolve-packs.js";
import { buildSkillCatalog } from "../packs/skill-catalog.js";
import { getPacksPath } from "../packs/get-pack-path.js";
import { computeRenderPlan } from "./render-plan.js";
import { resolveSkillSelection } from "./skill-selection.js";
import type { SkillSelectionDeltas } from "./skill-selection.js";
import type { AdapterType } from "../types/adapter.js";
import type { RepoType } from "../types/repo-type.js";
import type { SkillEnablement } from "../types/pack.js";

export interface BuildInstallPlanOptions {
  repoTypes: RepoType[];
  monorepo: boolean;
  adapters: AdapterType[];
  packsRoot?: string;
  excludeSkills?: string[];
  includeSkills?: string[];
}

export interface InstallPlanSkillEntry {
  pack: string;
  skill: string;
  enablement: SkillEnablement;
  /** Whether this skill is actually part of THIS run's effective set (decisions.md D19). */
  selected: boolean;
  /** D21 — sorted names of EFFECTIVE skills that directly `requires` this one; empty when this skill is not a dependency of anything enabled this run. A non-empty list means this skill is "locked on" — it could not have been excluded (see `resolveSkillSelection()`'s `blockedExclusions`). */
  requiredBy: string[];
  /** D26 — verbatim `skill.json` description, when present. */
  description?: string;
  /** D26 — count of `clashesWith` refs, when non-empty ("overlaps N" marker for `--details`/dry-run display). Absent when zero. */
  overlaps?: number;
}

export interface InstallPlanPack {
  name: string;
  missingSkills: string[];
}

export interface InstallPlanResult {
  /** `false` when `excludeSkills`/`includeSkills` failed validation (unknown name, or excluding a required skill) — see `resolveSkillSelection()`. */
  ok: boolean;
  errors: string[];
  installedPacks: string[];
  plannedPacks: InstallPlanPack[];
  missingPacks: string[];
  skills: InstallPlanSkillEntry[];
  /** Relative paths (e.g. ".claude/skills/paper-trail/SKILL.md"), sorted. Empty when `ok` is `false` (an invalid selection renders nothing). */
  files: string[];
  skillSelection: SkillSelectionDeltas;
}

/**
 * Computes the FULLY RESOLVED install plan (spec §7.3 `install --dry-run`) — packs installable/
 * planned/missing, every skill tagged with its tier + whether IT would actually be selected this
 * run, and the exact file list `computeRenderPlan()` would produce — WITHOUT writing anything.
 * Shared by `commands/install.ts`'s `--dry-run` branch (this is what D18's create-nockta-repo
 * wizard preview will consume via `install --dry-run --json`) — not currently reused by the
 * wizard's OWN preview step (`wizard/steps/preview-plan.ts`) to avoid touching that already-
 * tested M6 code path; both ultimately call the same `resolvePacks()`/`buildSkillCatalog()`/
 * `computeRenderPlan()` primitives, so they cannot structurally drift even though the two
 * functions are not literally the same call.
 */
export function buildInstallPlan(options: BuildInstallPlanOptions): InstallPlanResult {
  const resolved = resolvePacks({
    requestedPacks: options.repoTypes,
    monorepo: options.monorepo,
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

  const skills: InstallPlanSkillEntry[] = catalog.map((entry) => ({
    pack: entry.pack,
    skill: entry.skill,
    enablement: entry.enablement,
    selected: selection.effective.has(entry.skill),
    requiredBy: selection.requiredBy.get(entry.skill) ?? [],
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    ...(entry.clashesWith && entry.clashesWith.length > 0 ? { overlaps: entry.clashesWith.length } : {}),
  }));

  const files = selection.ok
    ? computeRenderPlan({
        repoTypes: options.repoTypes,
        adapters: options.adapters,
        monorepo: options.monorepo,
        packsRoot: options.packsRoot,
        skillSelection: selection.deltas,
      })
        .map((f) => f.relativePath)
        .sort()
    : [];

  return {
    ok: selection.ok,
    errors: selection.errors,
    installedPacks: resolved.installable.map((p) => p.name).sort(),
    plannedPacks: resolved.planned.map((p) => ({
      name: p.name,
      missingSkills: p.skills.filter((s) => !s.hasContent).map((s) => s.name),
    })),
    missingPacks: resolved.missing,
    skills,
    files,
    skillSelection: selection.deltas,
  };
}
