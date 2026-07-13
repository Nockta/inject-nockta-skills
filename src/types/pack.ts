import type { AdapterType } from "./adapter.js";
import type { RepoType } from "./repo-type.js";

/**
 * `pack.json` shape — the manifest bundled at `packs/<pack-name>/pack.json`.
 *
 * Spec: startup docs/inject-nockta-skills.updated.md §12 (Pack Architecture).
 */
export interface PackManifest {
  /** Pack directory name, e.g. "next". Matches the bundled `packs/<name>/` dir. */
  name: string;
  /** Human-facing name, e.g. "Next.js". */
  displayName: string;
  /** One-line description shown in `list` output. */
  description: string;
  /** Other pack names this pack depends on (followed transitively by resolve-packs). */
  requires: string[];
  /** Declared skill names this pack ships (each expected under `skills/<name>/`). */
  skills: string[];
  /** Adapters this pack renders for, structurally (see §8.1). */
  adapters: AdapterType[];
}

/**
 * Per-adapter output toggle inside a `skill.json` `outputs` map (spec §8.2).
 * `false` means the skill does not render for that adapter at all; an object
 * marks which output surfaces (the `skills/` dir, the `agents/` dir) render.
 */
export interface SkillAdapterOutput {
  skills?: boolean;
  agents?: boolean;
}

/** Per-adapter entry in a `skill.json` `outputs` map — spec §8.2. */
export type SkillOutputs = Partial<Record<AdapterType, SkillAdapterOutput | false>>;

/**
 * Three-tier skill enablement (decisions.md D19, spec §12): `"required"` is locked on and can
 * never be excluded; `"default"` is on but may be toggled off (`--exclude-skills`); `"optional"`
 * is off but may be toggled on (`--include-skills`). Absent in `skill.json` == `"default"` (see
 * `readSkillManifest()`'s fallback) — every skill authored before M7 is a `"default"` skill with
 * zero migration needed.
 */
export type SkillEnablement = "required" | "default" | "optional";

export const SKILL_ENABLEMENTS: readonly SkillEnablement[] = ["required", "default", "optional"];

export function isSkillEnablement(value: unknown): value is SkillEnablement {
  return typeof value === "string" && (SKILL_ENABLEMENTS as readonly string[]).includes(value);
}

/**
 * `skill.json` shape — per-skill manifest at
 * `packs/<pack>/skills/<skill-name>/skill.json` (decisions.md D8, spec §8.2/§12).
 *
 * `files` is the import-hygiene declaration (spec §12 "Import hygiene"): the
 * pack importer bundles only these declared files — `SKILL.md` is always
 * required/implicit, and everything else (`worker.md`, `references.md`,
 * `agents/*.md`, `examples/*`) must be listed here to survive import. This
 * is how gathered authoring scratch (`dist/`, `manifest.json`, `research/`,
 * notes) gets stripped.
 */
export interface SkillManifest {
  /** Skill name — matches the `skills/<name>/` directory. */
  name: string;
  /** Adapters this skill renders for at all (spec §8.2 adapter-restricted skills). */
  supportedAdapters: AdapterType[];
  /** Per-adapter output toggles — see `SkillOutputs`. */
  outputs: SkillOutputs;
  /** Declared files (beyond the always-required `SKILL.md`) the importer keeps. */
  files?: string[];
  /** Three-tier selection (decisions.md D19). Always present after `readSkillManifest()` — see `isSkillEnablement`/its fallback default `"default"`. */
  enablement: SkillEnablement;
  /**
   * Names of other skills THIS skill hard-depends on (decisions.md D21). Optional — absent/empty
   * means no dependencies (every skill authored before D21 needs zero migration). Enabling this
   * skill transitively auto-enables + locks every skill in its `requires` closure; resolved
   * against the SAME pack set this skill's own catalog was built from — a name that doesn't
   * resolve to a real skill there is a structured validation error (`core/skill-selection.ts`),
   * not a crash. Known real edges at record time (imported into packs/common this pass, see
   * `src/core/CONTEXT.md`): `improve-codebase-architecture` -> `["codebase-design", "grilling",
   * "domain-modeling"]`, `grill-me` -> `["grilling"]`.
   */
  requires?: string[];
  /**
   * One-line/short-paragraph description shown by the wizard and `list --json` (decisions.md
   * D26). Sourced verbatim from the skill's own `SKILL.md` YAML frontmatter `description:` field
   * at import time — never hand-authored separately, to avoid drift between the two. Optional —
   * absent for skills authored before this field existed (zero migration needed).
   */
  description?: string;
  /**
   * Advisory, non-blocking same-ground-overlap refs (decisions.md D26, sourced from
   * `planned skills/clash-map.json`) — other skill ids (bare pack-skill names, or
   * `razor:<name>` for the not-yet-imported Razor principles layer) this skill covers similar
   * ground to. Surfaced by the wizard as an informational "overlaps with X, Y, Z — enable at your
   * discretion" disclaimer, never a blocking condition. Optional — absent means no known clash.
   */
  clashesWith?: string[];
  /**
   * Repo types this skill is offered for (decisions.md D26, the razor principles layer's
   * per-category applicability table). Absent means "all repo types" — the convention every
   * pre-razor skill needs zero migration for. Populated today only by the `razor` pack's 61
   * skills; the resolver (`resolve-packs.ts`) always resolves `razor` regardless of this field —
   * `applicability` narrows what the WIZARD offers/what `--include-skills` accepts, not what
   * resolves. That wizard-time filter is Stage 4 (this pass only gets the data + parsing right).
   */
  applicability?: RepoType[];
  /**
   * Razor-layer principle category (e.g. "core", "architecture", "nextjs") — the wizard's razor
   * step groups its sections by this field instead of by pack (`wizard/core/build-schema.ts`'s
   * `buildRazorStep`). Optional — absent for every non-razor `skill.json` (zero migration needed);
   * populated today only by the `razor` pack's skill.json files, which already carry it on disk
   * (12 values: core, architecture, security, testing, delivery, data, realtime, tooling, react,
   * nextjs, nestjs, shopify).
   */
  category?: string;
}
