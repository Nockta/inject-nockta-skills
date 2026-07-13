import type { SkillCatalogEntry } from "../packs/skill-catalog.js";
import type { AdapterType } from "../types/adapter.js";
import type { RepoType } from "../types/repo-type.js";
import type { SkillSelectionDeltas } from "../types/skill-selection.js";

// Re-exported so every existing `core/*` caller can keep importing both the TYPE and the
// resolution logic from this one module — `types/skill-selection.ts` exists only to keep
// `types/profile.ts` a leaf (see that file's doc comment).
export type { SkillSelectionDeltas };
export { EMPTY_SKILL_SELECTION } from "../types/skill-selection.js";

export interface ResolveSkillSelectionOptions {
  catalog: SkillCatalogEntry[];
  /** Raw `--exclude-skills`/wizard-deselected-defaults input — may contain unknown/invalid names (validated here). */
  excluded?: string[];
  /** Raw `--include-skills`/wizard-selected-optionals input — may contain unknown/invalid names (validated here). */
  included?: string[];
  /**
   * Selected adapters (decisions.md D21 — generalizes D8's per-adapter render skip to
   * SELECTION time). Drives:
   *   - `--include-skills X` where X's `supportedAdapters` don't intersect `adapters` -> error.
   *   - a `requires` closure dependency that isn't adapter-eligible -> error (the dependency
   *     cannot be satisfied at all under the selected adapters).
   * Omitted (`undefined`) means "no adapter gating" — every catalog skill is treated as eligible.
   * This is a deliberate back-compat default: call sites that don't yet care about adapter
   * gating (e.g. plain unit tests against a bare catalog) keep working unchanged. Every REAL
   * caller in this package (install, dry-run, doctor/repair/upgrade's maintenance recompute, the
   * wizard) always has its selected adapters in scope and passes them.
   */
  adapters?: AdapterType[];
  /**
   * Repo type(s) this run targets (decisions.md D26 razor-layer applicability, generalizes the
   * `adapters` gating above to a second axis). Drives:
   *   - `--include-skills X` where X's `applicability` doesn't intersect `repoTypes` -> error
   *     (non-interactive parity for the wizard's razor-layer offer filter, brief item 7).
   * A catalog entry with no `applicability` (every pre-razor skill) is always applicable —
   * omitted `applicability` means "all repo types" (see `SkillCatalogEntry`'s own doc comment).
   * Omitted (`undefined`) `repoTypes` means "no applicability gating" — same back-compat default
   * posture as `adapters` above (plain unit tests against a bare catalog keep working unchanged).
   */
  repoTypes?: RepoType[];
}

export interface ResolveSkillSelectionResult {
  /** `false` when `excluded`/`included` named an unknown skill, `excluded` named a required skill, an `--include-skills` name (or a `requires` closure dependency) is adapter-ineligible, a `requires` name is dangling (does not resolve to a real skill in the catalog), a dependency cycle was detected, or `excluded` named a skill still required by an enabled/default/included skill. */
  ok: boolean;
  /** Skill names that are actually part of this run's install: `(required ∪ default ∪ includedOptionals) ∖ excludedDefaults`, then closed over `requires` (decisions.md D21) — an enabled skill's full dependency closure is always in here too. Empty (not meaningful) when `ok` is `false`. */
  effective: Set<string>;
  /** Normalized (deduped, sorted) deltas — `included` is DEPENDENCY-CLOSED (D21, spec §10.1): an optional-tier skill forced on because some enabled skill requires it is recorded here too, not just explicit `--include-skills` names, so a later re-resolution against the same catalog reproduces the identical effective set without needing to know WHY a skill was included. Only entries that actually move a skill off its tier default are kept (excluding an already-off optional, or including an already-on default/required, is a harmless no-op and is not recorded). Always returned, even when `ok` is `false` (echoes back the raw input, deduped/sorted, for error messages) — `included`'s closure additions are NOT echoed back on the error path (an invalid request's deltas are not something a caller should persist). */
  deltas: SkillSelectionDeltas;
  errors: string[];
  /**
   * D21 — raw `--exclude-skills`/wizard-deselected names that were rejected specifically because
   * the named skill is still required by another enabled/default/included skill (a SUBSET of what
   * produced `errors`, exposed separately and structurally so callers — chiefly the wizard's
   * lock/release loop, `wizard/steps/select-skills.ts` — can react to this ONE failure mode (e.g.
   * "just re-lock it and reprompt") without parsing `errors`' free-text messages). Empty on the
   * success path.
   */
  blockedExclusions: string[];
  /**
   * D21 — dependency name -> sorted list of EFFECTIVE skill names that directly `requires` it.
   * Non-empty for any skill currently "locked on" by the closure (it cannot be excluded — see
   * `blockedExclusions` above). Always reflects the FINAL, successfully-resolved closure, even
   * when some OTHER unrelated skill's request failed — i.e. this map is best-effort/informational
   * and should not be trusted when `ok` is `false` for a reason unrelated to the specific skill
   * being inspected (mirrors `deltas`' own "echoed back for error messages" posture).
   */
  requiredBy: Map<string, string[]>;
}

function emptyResult(deltas: SkillSelectionDeltas, errors: string[]): ResolveSkillSelectionResult {
  return { ok: false, effective: new Set(), deltas, errors, blockedExclusions: [], requiredBy: new Map() };
}

/**
 * Pure, NEVER-THROWING resolver for the D19 three-tier model, extended by D21's skill-level
 * `requires` dependencies and adapter-gated selectability:
 * `effective = closure((required ∪ default ∪ includedOptionals) ∖ excludedDefaults)`; required
 * can never be excluded; the closure is computed BEFORE the exclude/include tier logic settles
 * (a `requires` edge always wins over an attempted exclusion — see `blockedExclusions`).
 *
 * Two call sites, two different tolerance postures — both go through this SAME function, never a
 * second copy:
 *   - CLI validation (install time, `core/inject-skills.ts`/`core/inject-skills-monorepo.ts`,
 *     `core/build-install-plan.ts`'s dry-run path, the wizard's `select-skills.ts`): caller CHECKS
 *     `.ok`/`.errors` and rejects the request (exit 1) when either is non-empty/`false` — unknown
 *     skill names, excluding a required skill, excluding a skill still required by an enabled
 *     skill, an adapter-ineligible `--include-skills`/closure dependency, a dangling `requires`
 *     name, or a dependency cycle are all real input/content errors here.
 *   - Maintenance recompute (doctor/repair/upgrade, via `core/render-plan.ts`'s
 *     `computeRenderPlan()`): caller passes the STORED profile deltas against the CURRENTLY
 *     bundled catalog and only ever reads `.effective` — `.errors`/`.ok` are deliberately
 *     ignored. A delta entry naming a skill that no longer exists in the current catalog is a
 *     silent, harmless no-op here, not a crash — this is the documented merge policy (see
 *     `src/core/CONTEXT.md`). Because D21's `included` deltas are dependency-closed at write
 *     time (see `deltas` above), a stored closure dependency is never spuriously "missing" or
 *     "unknown" on recompute — it is simply an ordinary `included` name like any other.
 *
 * **D21 cycle policy (documented choice, brief: "pick one"): cycles are DETECTED AND ERRORED.**
 * A DFS with a recursion stack walks every `requires` edge reachable from the tentative effective
 * set; encountering a name already on the current path always breaks that branch's further
 * expansion (this part is not optional — it is the only way to avoid an infinite loop/stack
 * overflow on a self-referential pack) AND always records a structured error. The tolerant
 * maintenance posture above still ignores that error as usual, so a cyclic pack cannot brick an
 * existing install's doctor/repair/upgrade; any STRICT caller (install-time CLI, the wizard) sees
 * it and refuses the request.
 */
export function resolveSkillSelection(options: ResolveSkillSelectionOptions): ResolveSkillSelectionResult {
  const catalog = options.catalog;
  const adapters = options.adapters;
  const repoTypes = options.repoTypes;
  const rawExcluded = [...new Set(options.excluded ?? [])].sort();
  const rawIncluded = [...new Set(options.included ?? [])].sort();

  const byName = new Map(catalog.map((e) => [e.skill, e]));
  const catalogNames = new Set(catalog.map((e) => e.skill));
  const requiredNames = new Set(catalog.filter((e) => e.enablement === "required").map((e) => e.skill));
  const defaultNames = new Set(catalog.filter((e) => e.enablement === "default").map((e) => e.skill));
  const optionalNames = new Set(catalog.filter((e) => e.enablement === "optional").map((e) => e.skill));

  const errors: string[] = [];

  // D21: a skill is adapter-eligible when its supportedAdapters intersects the selected adapters.
  // `adapters` omitted -> no gating at all (every catalog skill eligible) -- see the option's own
  // doc comment for why this is a safe default.
  const isAdapterEligible = (name: string): boolean => {
    if (!adapters) return true;
    const entry = byName.get(name);
    if (!entry) return false;
    return entry.supportedAdapters.some((a) => adapters.includes(a));
  };

  // D26: a skill with a declared `applicability` (today, only the razor pack's 61 skills) is
  // only applicable when it intersects the current run's repo type(s); a skill with no
  // `applicability` at all (every pre-razor skill) is always applicable — see
  // `SkillCatalogEntry.applicability`'s own doc comment. `repoTypes` omitted -> no gating, same
  // back-compat posture as `isAdapterEligible` above.
  const isApplicable = (name: string): boolean => {
    if (!repoTypes) return true;
    const entry = byName.get(name);
    if (!entry) return false;
    if (!entry.applicability) return true;
    return entry.applicability.some((t) => repoTypes.includes(t));
  };

  const isEligible = (name: string): boolean => isAdapterEligible(name) && isApplicable(name);

  // D21: validate every `requires` edge in the WHOLE catalog resolves to a real skill — a pack-
  // authoring correctness check, independent of what THIS run happens to select (see this
  // function's own doc comment on why this differs from the "unknown --exclude/--include name"
  // checks below, which ARE about this run's input).
  for (const entry of catalog) {
    for (const depName of entry.requires) {
      if (!catalogNames.has(depName)) {
        errors.push(`skill "${entry.skill}" requires unknown skill "${depName}" (not found in the resolved packs)`);
      }
    }
  }

  const unknownExcluded = rawExcluded.filter((n) => !catalogNames.has(n));
  const unknownIncluded = rawIncluded.filter((n) => !catalogNames.has(n));
  if (unknownExcluded.length > 0) {
    errors.push(`--exclude-skills: unknown skill name(s): ${unknownExcluded.join(", ")}`);
  }
  if (unknownIncluded.length > 0) {
    errors.push(`--include-skills: unknown skill name(s): ${unknownIncluded.join(", ")}`);
  }

  const excludedRequired = rawExcluded.filter((n) => requiredNames.has(n));
  if (excludedRequired.length > 0) {
    errors.push(`cannot exclude required skill(s): ${excludedRequired.join(", ")}`);
  }

  // D21: an explicit --include-skills name that IS a known skill but isn't adapter-eligible under
  // the selected adapters can never be satisfied — e.g. improve-codebase-architecture (claude-only)
  // without --adapters claude.
  const ineligibleAdapterIncluded = rawIncluded.filter((n) => catalogNames.has(n) && !isAdapterEligible(n));
  if (ineligibleAdapterIncluded.length > 0) {
    errors.push(
      `--include-skills: not supported by the selected adapter(s): ${ineligibleAdapterIncluded.join(", ")}`,
    );
  }

  // D26: an explicit --include-skills name that IS a known, adapter-eligible skill but whose
  // declared `applicability` (razor layer) doesn't intersect the current run's repo type(s) —
  // non-interactive parity for the wizard's razor-layer offer filter (brief item 7). Reported
  // separately from the adapter-ineligibility bucket above for a clear, specific message.
  const ineligibleApplicabilityIncluded = rawIncluded.filter(
    (n) => catalogNames.has(n) && isAdapterEligible(n) && !isApplicable(n),
  );
  if (ineligibleApplicabilityIncluded.length > 0) {
    const repoTypesLabel = repoTypes && repoTypes.length > 0 ? repoTypes.join(", ") : "(none)";
    errors.push(
      `--include-skills: not applicable to the selected repo type(s) [${repoTypesLabel}]: ${ineligibleApplicabilityIncluded.join(", ")}`,
    );
  }

  // Normalized deltas (pre-closure): only entries that actually move a skill off its tier default
  // are kept — excluding an already-off optional, or including an already-on required/default
  // skill, is a no-op and would only add noise to the recorded profile. Ineligible includes are
  // dropped here too (already errored above).
  const excludedDelta = rawExcluded.filter((n) => defaultNames.has(n));
  const includedDelta = rawIncluded.filter((n) => optionalNames.has(n) && isEligible(n));

  if (errors.length > 0) {
    return emptyResult({ excluded: excludedDelta, included: includedDelta }, errors);
  }

  // Tentative base effective set, BEFORE the requires closure — plain D19 tier logic.
  const excludedSet = new Set(excludedDelta);
  const includedSet = new Set(includedDelta);
  const closureSet = new Set<string>();
  for (const entry of catalog) {
    if (entry.enablement === "required") closureSet.add(entry.skill);
    else if (entry.enablement === "default" && !excludedSet.has(entry.skill)) closureSet.add(entry.skill);
    else if (entry.enablement === "optional" && includedSet.has(entry.skill)) closureSet.add(entry.skill);
  }

  // D21 closure expansion: DFS every `requires` edge reachable from the tentative effective set.
  const requiredByMap = new Map<string, Set<string>>();
  const closureIncludedAdds = new Set<string>();
  const blockedExclusionsSet = new Set<string>();
  const unsatisfiableDeps: { dependent: string; dep: string }[] = [];
  const cycleNames = new Set<string>();
  const visited = new Set<string>();
  const onStack = new Set<string>();

  function expand(name: string): void {
    if (visited.has(name)) return;
    if (onStack.has(name)) {
      cycleNames.add(name);
      return;
    }
    onStack.add(name);
    const entry = byName.get(name);
    for (const depName of entry?.requires ?? []) {
      if (!catalogNames.has(depName)) continue; // dangling — already reported above, catalog-wide.

      if (!requiredByMap.has(depName)) requiredByMap.set(depName, new Set());
      requiredByMap.get(depName)!.add(name);

      if (!isEligible(depName)) {
        unsatisfiableDeps.push({ dependent: name, dep: depName });
        continue; // cannot satisfy this edge — do not add it to the closure.
      }

      if (excludedSet.has(depName)) {
        blockedExclusionsSet.add(depName);
      }

      if (!closureSet.has(depName)) {
        closureSet.add(depName);
        if (optionalNames.has(depName)) closureIncludedAdds.add(depName);
      }
      expand(depName);
    }
    onStack.delete(name);
    visited.add(name);
  }

  for (const name of [...closureSet]) expand(name);

  if (unsatisfiableDeps.length > 0) {
    for (const { dependent, dep } of unsatisfiableDeps) {
      errors.push(
        `cannot satisfy dependency: "${dependent}" requires "${dep}", which is not supported by the selected adapter(s)`,
      );
    }
  }
  if (cycleNames.size > 0) {
    errors.push(`dependency cycle detected involving skill(s): ${[...cycleNames].sort().join(", ")}`);
  }
  if (blockedExclusionsSet.size > 0) {
    for (const depName of [...blockedExclusionsSet].sort()) {
      const dependents = [...(requiredByMap.get(depName) ?? [])].sort();
      errors.push(`cannot exclude "${depName}": still required by ${dependents.join(", ")}`);
    }
  }

  const requiredBy = new Map<string, string[]>();
  for (const [dep, dependents] of requiredByMap) {
    requiredBy.set(dep, [...dependents].sort());
  }

  if (errors.length > 0) {
    return {
      ok: false,
      effective: new Set(),
      deltas: { excluded: excludedDelta, included: includedDelta },
      errors,
      blockedExclusions: [...blockedExclusionsSet].sort(),
      requiredBy,
    };
  }

  const finalIncluded = [...new Set([...includedDelta, ...closureIncludedAdds])].sort();

  return {
    ok: true,
    effective: closureSet,
    deltas: { excluded: excludedDelta, included: finalIncluded },
    errors: [],
    blockedExclusions: [],
    requiredBy,
  };
}

/**
 * Thrown by `core/inject-skills.ts`/`core/inject-skills-monorepo.ts` when
 * `resolveSkillSelection()` fails validation (unknown skill name, excluding a required skill,
 * excluding a skill still required by an enabled skill, an adapter-ineligible `--include-skills`/
 * closure dependency, a dangling `requires` name, or a dependency cycle — decisions.md D19/D21) —
 * caught by `commands/install.ts` and mapped to exit 1 (`INVALID_PROFILE_OR_TARGETS`, this
 * package's general "invalid input" bucket — same bucket malformed `--target` already uses), same
 * "core throws typed errors, commands map them to exit codes" pattern as
 * `AdapterNotImplementedError`.
 */
export class InvalidSkillSelectionError extends Error {
  constructor(public readonly issues: string[]) {
    super(`invalid skill selection: ${issues.join("; ")}`);
    this.name = "InvalidSkillSelectionError";
  }
}
