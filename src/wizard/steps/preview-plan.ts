import { resolvePacks } from "../../packs/resolve-packs.js";
import { computeRenderPlan } from "../../core/render-plan.js";
import type { AdapterType } from "../../types/adapter.js";
import type { RepoType } from "../../types/repo-type.js";
import type { SkillSelectionDeltas } from "../../types/skill-selection.js";

export interface PreviewPlanOptions {
  /** Single-project: `[repoType]`. Monorepo: the union of every confirmed target's repo type. */
  repoTypes: RepoType[];
  adapters: AdapterType[];
  monorepo: boolean;
  packsRoot?: string;
  /** Step 5's skill-selection deltas (decisions.md D19) — defaults to no deltas (required+default only) when omitted, same as before M7. */
  skillSelection?: SkillSelectionDeltas;
}

export interface PreviewPlan {
  installedPacks: string[];
  plannedPacks: { name: string; missingSkills: string[] }[];
  missingPacks: string[];
  /** Relative paths (e.g. ".claude/skills/paper-trail/SKILL.md"), sorted. */
  files: string[];
}

/**
 * Wizard step 5 (spec §7.1: "Preview generated files") — pure. Reuses the SAME machinery
 * `install`/`doctor` already use rather than reimplementing pack resolution or rendering:
 * `resolvePacks()` for the installable/planned/missing pack breakdown (D6 gate), and
 * `computeRenderPlan()` (src/core/render-plan.ts) for the exact file list — which renders into a
 * throwaway scratch dir and discards it, so calling this writes nothing to the real repo (safe
 * to call before the user has confirmed anything, spec §14).
 */
export function buildPreviewPlan(options: PreviewPlanOptions): PreviewPlan {
  const resolved = resolvePacks({
    requestedPacks: options.repoTypes,
    monorepo: options.monorepo,
    packsRoot: options.packsRoot,
  });
  const rendered = computeRenderPlan({
    repoTypes: options.repoTypes,
    adapters: options.adapters,
    monorepo: options.monorepo,
    packsRoot: options.packsRoot,
    skillSelection: options.skillSelection,
  });

  return {
    installedPacks: resolved.installable.map((p) => p.name).sort(),
    plannedPacks: resolved.planned.map((p) => ({
      name: p.name,
      missingSkills: p.skills.filter((s) => !s.hasContent).map((s) => s.name),
    })),
    missingPacks: resolved.missing,
    files: rendered.map((f) => f.relativePath).sort(),
  };
}

/** Pure text formatter for the wizard's preview step — human narration only, never used in `--json` mode. */
export function formatPreviewHuman(plan: PreviewPlan): string {
  const lines: string[] = [];
  lines.push(`Packs to install (${plan.installedPacks.length}): ${plan.installedPacks.join(", ") || "(none)"}`);
  if (plan.plannedPacks.length > 0) {
    lines.push(`Planned, no authored content yet (skipped): ${plan.plannedPacks.map((p) => p.name).join(", ")}`);
  }
  if (plan.missingPacks.length > 0) {
    lines.push(`Not found on disk: ${plan.missingPacks.join(", ")}`);
  }
  lines.push(`Files that will be generated (${plan.files.length}):`);
  for (const file of plan.files) lines.push(`  ${file}`);
  return lines.join("\n");
}
