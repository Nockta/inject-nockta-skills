import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPacksPath } from "./get-pack-path.js";
import { listPacks } from "./list-packs.js";
import type { PackEntry } from "./list-packs.js";

export interface SkillContentEntry {
  name: string;
  /** True when `<packPath>/skills/<name>/SKILL.md` exists on disk. */
  hasContent: boolean;
}

export interface ResolvedPackEntry extends PackEntry {
  /** D6 gate result: true only when every declared skill has content. */
  installable: boolean;
  skills: SkillContentEntry[];
}

export interface ResolvePacksOptions {
  /** Pack names explicitly requested (e.g. the selected repo type's pack). */
  requestedPacks?: string[];
  /** Include the `monorepo` pack even when not explicitly requested (spec §5.3). */
  monorepo?: boolean;
  /** Override the packs root directory. Tests only; defaults to the bundled `packs/`. */
  packsRoot?: string;
}

export interface ResolvePacksResult {
  /** Resolved packs that pass the D6 content gate — safe to offer/install. */
  installable: ResolvedPackEntry[];
  /** Resolved packs that do NOT pass the D6 content gate — reported, never offered. */
  planned: ResolvedPackEntry[];
  /** Requested or `requires`-chained pack names with no matching pack directory at all. */
  missing: string[];
}

/**
 * D6 content gate (decisions.md D6, spec §5.10): a pack is only installable
 * when every skill it declares in `pack.json` has real authored content on
 * disk — i.e. `packs/<pack>/skills/<skill>/SKILL.md` exists. A pack with a
 * declared-but-empty skill list, or any missing `SKILL.md`, is not
 * installable — it is reported as planned instead.
 */
export function evaluatePackContent(entry: PackEntry): {
  installable: boolean;
  skills: SkillContentEntry[];
} {
  const skills: SkillContentEntry[] = entry.manifest.skills.map((skillName) => ({
    name: skillName,
    hasContent: existsSync(join(entry.path, "skills", skillName, "SKILL.md")),
  }));
  const installable = skills.length > 0 && skills.every((skill) => skill.hasContent);
  return { installable, skills };
}

/**
 * Resolves the full set of packs implied by a request: `common` and `razor`
 * are always included, `monorepo` is added when monorepo mode is requested,
 * and `requires` chains declared in each pack's `pack.json` are followed
 * transitively. Every resolved pack is then run through the D6 content gate
 * and bucketed into `installable` or `planned`.
 *
 * `razor` joins the always-included set alongside `common` (decisions.md
 * D26): the razor principles layer is offered for ANY project regardless of
 * requested repo type, same as common. This is safe because every razor
 * skill imports at `enablement: "optional"` — being always-RESOLVED only
 * makes its 61 skills available to select (`--include-skills`, and later
 * the wizard); nothing in it auto-installs. Per-repo-type narrowing of
 * WHICH razor skills are offered (`skill.json`'s `applicability` field) is
 * a wizard-time filter, not a resolver concern — see `types/pack.ts`'s
 * `applicability` doc comment; that filter is Stage 4, not implemented here.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §11
 * (`src/packs/resolve-packs.ts`), §5.2 (common always included), §5.3
 * (monorepo pack), §5.10 (D6 gate), §12 (`requires`).
 */
export function resolvePacks(options: ResolvePacksOptions = {}): ResolvePacksResult {
  const packsRoot = options.packsRoot ?? getPacksPath();
  const entries = listPacks(packsRoot);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const queue: string[] = ["common", "razor"];
  if (options.monorepo) queue.push("monorepo");
  for (const name of options.requestedPacks ?? []) queue.push(name);

  const resolvedNames = new Set<string>();
  const missing = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (resolvedNames.has(name)) continue;

    const entry = byName.get(name);
    if (!entry) {
      missing.add(name);
      continue;
    }

    resolvedNames.add(name);
    for (const required of entry.manifest.requires) {
      if (!resolvedNames.has(required)) queue.push(required);
    }
  }

  const installable: ResolvedPackEntry[] = [];
  const planned: ResolvedPackEntry[] = [];

  for (const name of [...resolvedNames].sort()) {
    const entry = byName.get(name) as PackEntry;
    const { installable: isInstallable, skills } = evaluatePackContent(entry);
    const resolved: ResolvedPackEntry = { ...entry, installable: isInstallable, skills };
    (isInstallable ? installable : planned).push(resolved);
  }

  return { installable, planned, missing: [...missing].sort() };
}
