# CONTEXT.md — src/core/

## Purpose

Orchestration logic that sits between the CLI command layer (`src/commands/`) and the
lower-level pack/adapter modules (`src/packs/`, `src/adapters/`). M3 landed the install
pipeline; M4 added the maintenance pipeline — doctor/repair/upgrade/sync — reusing the M3
renderer rather than duplicating its D1-override-aware source resolution. M5 added monorepo
install + monorepo-aware maintenance, reusing M4's classification engine the same way M4 reused
M3's renderer. M6 added `detect-repo-type.ts` (single-project heuristic detection, wizard-prefill
only) and `run-extras.ts` (spec §7.10 Extras core — see the doc comment on that file). **M7 (this
pass) adds `skill-selection.ts` and `build-install-plan.ts`** — the D19 three-tier skill-selection
resolver and the `install --dry-run` plan builder, both consumed by `commands/install.ts` AND
threaded through `render-plan.ts` (so doctor/repair/upgrade compute the SAME effective set the
renderers use) — see "Key Concepts" for the full merge-policy write-up, the single most important
new concept this pass adds.

This module never decides CLI exit codes or shapes `JsonResult` — that is `src/commands/*.ts`'s
job. Everything here returns plain result objects.

## Dependencies

- `../packs/resolve-packs.ts`, `../adapters/claude/render.ts` (via `render-adapters.ts`) — the
  M3 renderer this module's maintenance functions reuse, never reimplement.
- `../types/adapter.ts`, `../types/repo-type.ts`, `../types/profile.ts`,
  `../types/generated-manifest.ts`, `../types/doctor.ts` (M4; gained `DoctorReport`/
  `TargetCheckResult` in M5), `../types/target.ts` (M5, new) — shapes everything here
  reads/writes/classifies.
- Node builtins only: `node:fs`, `node:path`, `node:os`, `node:crypto` (via `../utils/hash.ts`).

## Dependents

- `src/commands/install.ts` — `inject-skills.ts` (M3, single-project, unchanged) OR (M5, new)
  `detect-monorepo.ts` + `parse-targets.ts` + `inject-skills-monorepo.ts` for the monorepo path.
- `src/wizard/steps/select-repo-type.ts` (M6, new) — `detect-repo-type.ts`, the ONLY consumer.
  `src/wizard/steps/select-targets.ts` (M6, new) — also calls `detect-repo-type.ts` (once per
  discovered monorepo target candidate) and re-reads `detect-monorepo.ts`'s underlying signal
  files itself for workspace-glob discovery (a separate, narrower read than
  `detect-monorepo.ts`'s own signal scan — see `src/wizard/CONTEXT.md`). `src/wizard/steps/
  preview-plan.ts` (M6, new) — `resolve-packs.ts` + `render-plan.ts`, reused verbatim, same
  scratch-dir-render trick M4/M5 already established.
- `src/commands/doctor.ts` — `doctor-checks.ts`, `profile-guard.ts` (M4). `doctor-checks.ts`
  itself now dispatches to `monorepo-doctor-checks.ts` internally (M5) — `commands/doctor.ts`'s
  own call site is UNCHANGED.
- `src/commands/repair.ts` — `repair-adapters.ts`, `profile-guard.ts` (M4), + (M5, new)
  `repair-adapters-monorepo.ts` and `read-targets.ts` when the guard is `"ok-monorepo"`.
- `src/commands/upgrade.ts` — `upgrade-adapters.ts`, `profile-guard.ts` (M4), + (M5, new)
  `upgrade-adapters-monorepo.ts` and `read-targets.ts`, same pattern as repair.ts.
- `src/commands/sync.ts` — `sync-orchestrator.ts` (M4, async — the only async command core).
  `sync-orchestrator.ts` itself now dispatches to the monorepo repair/upgrade cores internally
  (M5) — `commands/sync.ts`'s own call site is UNCHANGED (it still just calls
  `runSyncOrchestration()`).
- `test/doctor.test.ts`, `test/repair.test.ts`, `test/upgrade.test.ts`, `test/sync.test.ts`,
  `test/sync-process.test.ts` (M4) exercise this module both directly (doctor/repair/
  upgrade, via the `commands/*.ts` pure builders) and, for sync's non-interactive paths, as a
  spawned child process against the **built** `dist/cli.js` (see "Key Concepts" below).
- `test/detect-monorepo.test.ts`, `test/parse-targets.test.ts`, `test/install-monorepo-
  e2e.test.ts`, `test/monorepo-doctor.test.ts`, `test/monorepo-maintenance.test.ts`,
  `test/monorepo-process.test.ts` (M5, new) — same conventions as their M4 counterparts,
  extended to the monorepo path.

## Directory Layout

```
src/core/
  inject-skills.ts        M3, unchanged. Install orchestrator: resolvePacks() ->
                           renderAdapters() -> hash (D3) -> write profile + manifest.
  render-adapters.ts       M3, unchanged. Adapter dispatch; AdapterNotImplementedError.
  write-profile.ts         M3, unchanged (now also called by upgrade-adapters.ts).
  write-manifest.ts        M3, unchanged (now also called by repair/upgrade-adapters.ts).
  read-profile.ts          M3, unchanged. Never-throws profile reader (used by write-profile.ts
                            to preserve createdAt, and by profile-guard.ts, M4).
  package-manager.ts        M3, unchanged.
  read-package-version.ts   M4, new. Extracted from install.ts's previously-local
                             readPackageVersion() — the running package's own version, read
                             from its own package.json via getPackagePath(). install.ts,
                             doctor.ts, repair.ts, upgrade.ts, sync.ts all use this one function
                             now instead of each having their own copy.
  read-manifest.ts          M4, new. Never-throws reader for
                             .nockta/generated-manifest.json — mirrors read-profile.ts's
                             convention. No reader existed before M4 (M3 only ever wrote a
                             fresh manifest during install).
  profile-guard.ts          M4; REPLACED in M5. readProfileForMaintenance(targetDir): a
                             discriminated {status: "missing"|"invalid"|"ok"|"ok-monorepo",
                             profile?} result shared by doctor/repair/upgrade/sync. M4's
                             `"monorepo-unsupported"` status is GONE — a monorepo profile is now
                             validated against the real `NocktaMonorepoSkillsProfile` shape
                             (spec §10.2) and, if valid, returned as `"ok-monorepo"` carrying the
                             parsed profile (see "Key Concepts").
  render-plan.ts             M4; extended in M5, M7, M10 (D22). computeRenderPlan(): the shared
                             engine behind doctor's staleness/unknown detection and repair/
                             upgrade's "what to (re)write" set. `ComputeRenderPlanOptions` gained
                             an optional `repoTypes: RepoType[]` (M5) alongside the-then-existing
                             singular `repoType: RepoType`. **M10 (D22): the singular `repoType`
                             option is GONE** — every caller (single-project AND monorepo) now
                             passes `repoTypes: RepoType[]`, a one-element array for the
                             pre-D22-equivalent single-type case. No behavior change for any
                             existing single-type caller, just one shape instead of two. M7:
                             gained an optional `skillSelection`
                             (SkillSelectionDeltas, default EMPTY_SKILL_SELECTION) — internally
                             resolves `resolvePacks() -> buildSkillCatalog() ->
                             resolveSkillSelection()` (ignoring `.errors`/`.ok`, THE maintenance
                             posture — see skill-selection.ts) and threads the resulting
                             `effective` set into `renderAdapters()`. This is the ONE place the
                             D19 effective set gets computed for doctor/repair/upgrade — see "Key
                             Concepts", the scratch-dir reuse trick, which is now ALSO how the
                             effective set stays in sync with the renderer without a second copy.
  classify-manifest.ts       M5, new — EXTRACTED from doctor-checks.ts's inline classification
                             loop (byte-for-byte identical logic, single-project behavior
                             unchanged). classifyManifestRecords(): the shared per-record
                             intact/missing/modified/stale + unknown-scan engine now called by
                             BOTH doctor-checks.ts (one `repoType`) and monorepo-doctor-
                             checks.ts (a UNION `canonicalPlan`) — see "Key Concepts". M7: the
                             staleness check's `currentSourceHash` now reads
                             `canonical.sourceContentHash ?? sha256File(canonical.sourcePath)` —
                             same fallback reasoning as apply-render-plan.ts above.
  apply-render-plan.ts       M4, new; reused unmodified by monorepo repair/upgrade in M5; M7
                             gained content/hash fallbacks (see below), single-project AND
                             monorepo behavior otherwise UNCHANGED. applyRenderPlan(): the shared
                             per-file decision engine behind BOTH repair and upgrade (mode:
                             "repair" | "upgrade") — restore missing / refresh stale-safe /
                             warn-skip-or-force modified. Never writes a path outside
                             `canonicalPlan` (source of the "repair/upgrade never touch unknown
                             files" guarantee) — this guarantee holds for monorepo too, since the
                             monorepo cores feed it the exact same kind of `canonicalPlan`, just
                             computed from a union of repo types. M7: `writeFreshRecord()` now
                             writes `entry.content ?? readFileSync(entry.sourcePath)` (was
                             unconditionally `readFileSync`) and hashes `entry.sourceContentHash
                             ?? sha256File(entry.sourcePath)` for `sourceHash` (two call sites,
                             including the staleness check) — see `src/adapters/types.ts`'s
                             `RenderedFile.content`/`.sourceContentHash` doc comment for why:
                             cursor/copilot's CONSTRUCTED output has no single `sourcePath` file
                             whose raw bytes equal the rendered output, unlike claude's straight
                             copy. Both fields are `undefined` for claude, so every fallback here
                             is a no-op for it — zero behavior change for the M3-M6 claude-only
                             path.
  repair-adapters.ts         M4, new, single-project, UNCHANGED in M5. repairAdapters(): thin
                             orchestrator — computeRenderPlan() + readGeneratedManifest() ->
                             applyRenderPlan(mode: "repair") -> writeGeneratedManifest(). Does
                             NOT touch skills-profile.json.
  repair-adapters-monorepo.ts M5, new. repairMonorepoAdapters(): IDENTICAL shape to
                             repair-adapters.ts — the only difference is `computeRenderPlan()`
                             is called with `repoTypes` (the union across `targets.targets`)
                             instead of a single `repoType`. Does NOT touch targets.json either.
  upgrade-adapters.ts        M4, new, single-project, UNCHANGED in M5. upgradeAdapters(): same
                             shape as repair-adapters.ts but mode: "upgrade" (refreshes
                             intact-and-current files too, not just stale/missing ones) AND
                             writes a fresh skills-profile.json (version/source.version/
                             updatedAt bumped, createdAt/repoType/installedPacks/
                             installedAdapters preserved).
  upgrade-adapters-monorepo.ts M5, new. upgradeMonorepoAdapters(): same relationship to
                             upgrade-adapters.ts as repair-adapters-monorepo.ts has to
                             repair-adapters.ts, PLUS writes the profile via
                             write-profile.ts's writeMonorepoSkillsProfile() instead of
                             writeSkillsProfile(). Does NOT touch targets.json.
  inject-skills-monorepo.ts  M5, new; extended M10 (D22). injectSkillsMonorepo(): the monorepo
                             install orchestrator — mirrors inject-skills.ts's shape
                             (resolvePacks -> renderAdapters -> hash -> write profile+manifest)
                             but resolves the UNION of every target's repo type(s) ONCE and
                             renders ONCE at the repo root (spec §9.4), while ALSO computing each
                             target's own narrower installedPacks list for targets.json (spec
                             §9.3) via a second, non-rendering resolvePacks() call per target.
                             Also writes targets.json via write-targets.ts. **M10 (D22):
                             `MonorepoInstallTarget.repoType: RepoType` -> `repoTypes:
                             RepoType[]`** (a target may itself span multiple types, colon+plus
                             syntax); the root-level union is now `flatMap()` over every target's
                             `repoTypes` before deduping (was `map()` over a single field) —
                             `resolvePacks()`'s own Set-based `requestedPacks` resolution needed
                             no change at all, since it already treated its input as a set (see
                             the D22 Key Concepts bullet below).
  write-targets.ts           M5, new. writeTargetsFile(): writes .nockta/targets.json (spec
                             §9.3, decisions.md D5) — same "full replacement set per run"
                             convention as write-manifest.ts.
  read-targets.ts            M5, new. readTargetsFile(): never-throws, SCHEMA-VALIDATING reader
                             for .nockta/targets.json (via types/target.ts's
                             isValidTargetsFile()) — stricter than read-profile.ts/
                             read-manifest.ts's shape checks, since a malformed targets.json
                             would otherwise corrupt the union canonicalPlan silently.
  doctor-checks.ts           M4, new; REFACTORED in M5 (single-project behavior unchanged); M7:
                             `computeRenderPlan()` call now passes `skillSelection:
                             profile.skillSelection` (and `monorepo-doctor-checks.ts`/
                             `repair-adapters(-monorepo).ts`/`upgrade-adapters(-monorepo).ts` all
                             gained the identical one-line addition) — see the D19 merge-policy
                             bullet above, this is the literal wiring behind it.
                             runDoctorChecks(): profile-guard -> dispatch to
                             monorepo-doctor-checks.ts when guard.status is "ok-monorepo" (M5) ->
                             otherwise (unchanged M4 logic) read manifest -> computeRenderPlan()
                             -> classifyManifestRecords() (M5: delegated to classify-
                             manifest.ts instead of inlined) -> build DoctorReport. See "Key
                             Concepts" for the classification precedence rules and the
                             healthy/current split.
  monorepo-doctor-checks.ts  M5, new (spec §9.5). runMonorepoDoctorChecks(): validates
                             targets.json exists + is schema-valid; every target directory
                             exists + passes a DELIBERATELY SHALLOW plausibility check
                             (existence + a package.json present — NOT deep framework
                             re-detection, out of scope this milestone, documented in-code);
                             computes the UNION canonicalPlan across every distinct target
                             repoType and classifies via the SAME classify-manifest.ts engine
                             doctor-checks.ts uses. Returns the same DoctorReport shape.
  sync-orchestrator.ts       M4, new; extended in M5 (single-project control flow unchanged).
                             decideSyncMode() (pure decision function, spec §7.7/D10) +
                             runSyncOrchestration() (async — the only async function in
                             src/core/, because interactive mode awaits a confirm() prompt).
                             buildSyncPlan() (M5) gained one branch: a monorepo profile with
                             `targetsStatus !== "ok"` folds into `needsInstall` (repair/upgrade
                             cannot recreate targets.json). The apply step (M5) branches on
                             `doctorBefore.isMonorepo` to call the monorepo repair/upgrade cores
                             instead of the single-project ones — everything else (mode
                             decision, confirm-prompt injection, no-op/dry-run/plan-only early
                             returns) is untouched M4 code.
  detect-repo-type.ts        M6, new (spec §11's `src/core/detect-repo-type.ts`); EXTENDED in M10
                             (decisions.md D22 refinement, "Detection walks workspace
                             sub-packages") and again this pass (decisions.md D25, react-native +
                             expo). detectRepoType(): heuristic single-project
                             repo-type detection from a target dir's files — package.json deps
                             for next/nest/vite-react-ts/shopify-headless, `shopify.app.toml` for
                             shopify-app, the sections/+templates/+config/ directory shape (or a
                             bare .shopify/) for shopify-theme, and now (D25, this pass) the
                             `react-native` dependency as the RN-vs-web discriminator, sub-classified
                             `expo` (an `expo` dep, OR `app.json`'s top-level `"expo"` key, OR
                             app.config.js/ts) vs. bare `react-native` (none of those). Deliberately
                             does NOT gate on bare `react` or on `metro.config.js`/`eas.json` — the
                             current SDK 57 Expo default template ships without either (see
                             `scratchpad/react-native-tooling-research.md`). Returns a RANKED guess list
                             (confidence + evidence per guess, ties broken alphabetically), or an
                             empty list ("unknown"). Pure filesystem reads only, no fs writes,
                             never throws (unparsable package.json -> empty guess list, not an
                             error). UNCHANGED by M10 — still the per-directory primitive.
                             **M10 addition: `detectRepoTypeAcrossWorkspace(targetDir)`** —
                             workspace-walking aggregation: runs `detectRepoType()` against the
                             root AND every declared npm `workspaces` sub-package (via
                             `workspace-globs.ts`'s `listWorkspacePackagePaths()`, shared with
                             `wizard/steps/select-targets.ts`'s discovery), then dedupes the
                             combined guess list BY TYPE — the highest-confidence guess for a
                             given type wins and its evidence is tagged with its source
                             (`"(root) ..."` or `"(packages/x) ..."`); a weaker same-type guess
                             from another source is folded into that entry's evidence, never
                             surfaced as a separate lower-ranked candidate (this is the concrete
                             mechanism behind the D22 refinement's "a sub-signal that matches no
                             stack pack ... contributes nothing"). Returns `{guesses, bySource}` —
                             `bySource` keeps every per-source guess, unaggregated, for
                             detail/debug output. Degrades to exactly `detectRepoType()`'s own
                             result when `targetDir` declares no workspaces at all — safe to call
                             unconditionally. Consumers: `wizard/run-install-wizard.ts`'s
                             single-project branch (feeds the D22 multi-select type step, and is
                             what surfaces both a root repo-type signal AND a workspace
                             sub-package's signal for the "root-is-a-project monorepo" case — see
                             `src/wizard/CONTEXT.md`). See `detectRepoType()`'s own doc comment
                             for the "never overrides an explicit --type" contract (brief item 1,
                             unchanged by D22 beyond generalizing to N comma-separated types) —
                             enforced by the WIZARD skipping the call entirely when a preset is
                             already valid, not by anything in this file.
  workspace-globs.ts          M10, new (D22). readWorkspaceGlobs()/expandWorkspaceGlob()/
                             listWorkspacePackagePaths() — EXTRACTED verbatim from
                             `wizard/steps/select-targets.ts` (M6) so
                             `detectRepoTypeAcrossWorkspace()` (above) and
                             `select-targets.ts`'s `discoverWorkspaceCandidates()` share the
                             identical glob-reading/expansion logic instead of two copies that
                             could drift on "which sub-package directories does this repo
                             declare". Reads `package.json` `workspaces` (array or `{packages:
                             []}`) and a minimal, deliberately non-general `pnpm-workspace.yaml`
                             `packages:` list reader; expands a literal path or a single trailing
                             `<prefix>/*` glob segment; only returns directories that themselves
                             contain a `package.json`. Never throws.
  run-extras.ts               M7, new (spec §7.10, decisions.md D17). isClaudeMemAlreadyInstalled()
                             (pure detection) + CLAUDE_MEM_DISCLOSURE + buildExtrasInstallCommand()/
                             runClaudeMemInstall() (npx claude-mem install, or its
                             INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN override) + runExtrasNonInteractive().
                             Lives here (not `wizard/`) specifically so BOTH `commands/install.ts`'s
                             `--with-claude-mem` path AND the wizard's own interactive step 9
                             (`wizard/steps/extras.ts`) can depend on it without `commands/install.ts`
                             ever importing from `wizard/*` — see `src/wizard/CONTEXT.md`'s
                             Milestone 7 note.
  skill-selection.ts          M7, new (spec §12, decisions.md D19); EXTENDED in M9 (decisions.md
                             D21) — same function, not replaced. resolveSkillSelection(): the ONE
                             resolver behind the three-tier model AND (M9) the `requires`
                             dependency closure — pure, NEVER throws, returns {ok, effective,
                             deltas, errors, blockedExclusions, requiredBy} (the last two fields
                             are M9, new). Two call postures against the SAME function (see "Key
                             Concepts" — this was the crux of M7 and remains so for M9's additions):
                             install-time CLI validation CHECKS `.ok`/`.errors` and rejects bad
                             input (InvalidSkillSelectionError, thrown by inject-skills.ts/
                             inject-skills-monorepo.ts, caught by commands/install.ts -> exit 1);
                             maintenance recompute (render-plan.ts, on doctor/repair/upgrade's
                             behalf) IGNORES `.errors`/`.ok` and only reads `.effective` — a stored
                             delta referencing a skill that no longer exists in the CURRENT catalog
                             is a silent no-op there, not a crash. EMPTY_SKILL_SELECTION
                             (re-exported from types/skill-selection.ts) is the "no deltas" default
                             every pre-M7 profile/call site implicitly behaves as.

                             **M9 addition — the `requires` closure (D21).** Computation order:
                             plain D19 tier logic runs FIRST to produce a tentative base effective
                             set, THEN a DFS over every base member's `requires` edges expands it
                             (a dependency of an effective skill is always force-added, regardless
                             of its own tier — an optional-tier dependency gets materialized into
                             `deltas.included` too, so a later re-resolution against the same
                             catalog reproduces the identical effective set without needing to know
                             WHY a skill was included; a default-tier dependency that was already
                             on needs no delta at all). Three new validation layers, all before the
                             DFS even starts EXCEPT the two below the line, which the DFS itself
                             discovers:
                             - a `requires` name that doesn't resolve to a real skill ANYWHERE in
                               the catalog (checked catalog-wide, independent of what this run
                               selects — a pack-authoring correctness check, not a per-run input
                               check) -> structured error.
                             - an explicit `--include-skills` name that IS real but isn't
                               adapter-eligible under the new `adapters?: AdapterType[]` resolver
                               option (D21 generalizes D8 from render-time to SELECTION-time;
                               omitted `adapters` = no gating, the back-compat default every
                               pre-D21 caller implicitly used) -> structured error.
                             - (discovered during the DFS) a closure dependency edge that isn't
                               adapter-eligible -> "cannot satisfy dependency" error (defensive;
                               cannot happen with any currently-bundled skill — every real
                               dependency is portable prose).
                             - (discovered during the DFS) a name already on the current DFS
                               recursion stack -> a dependency CYCLE — detected, the branch is
                               broken (mandatory, to never hang/stack-overflow), and an error is
                               ALWAYS recorded (documented choice: "detect and error", not "break
                               safely + warn" — the brief allowed either).
                             - (discovered during the DFS) an `--exclude-skills` name that turns
                               out to be a dependency of some other enabled/default/included skill
                               -> a BLOCKED EXCLUSION error naming the dependent, ALSO exposed
                               structurally via the new `blockedExclusions: string[]` result field
                               (not just free text) specifically so `wizard/steps/select-skills.ts`
                               can react to this ONE failure mode programmatically — see that
                               file's own doc comment for why (the wizard's iterative lock/release
                               loop treats this as "re-lock it and reprompt", never a hard error the
                               user sees).
                             `requiredBy: Map<string, string[]>` (dependency name -> sorted
                             dependent names, always reflecting the FINAL successful closure) feeds
                             both `build-install-plan.ts`'s `InstallPlanSkillEntry.requiredBy` (the
                             dry-run JSON's visible "who locked this" column) and the wizard's
                             lock-row labeling.
  build-install-plan.ts       M7, new (spec §7.3, decisions.md D18). buildInstallPlan(): resolves
                             packs -> catalog -> effective set -> computeRenderPlan(), all WITHOUT
                             writing — the engine behind `install --dry-run`
                             (commands/install.ts). Deliberately a SEPARATE function from
                             wizard/steps/preview-plan.ts's buildPreviewPlan() (which serves a
                             different caller with a different shape need — see that file) rather
                             than a shared one; both ultimately call the same
                             resolvePacks()/buildSkillCatalog()/computeRenderPlan() primitives so
                             they cannot structurally drift even though they are not literally
                             the same function.
```

`src/packs/skill-catalog.ts` (M7, new, NOT under `core/` — pure pack/skill catalog knowledge,
same layering as `resolve-packs.ts`) is `skill-selection.ts`'s only real dependency:
`buildSkillCatalog()` reads every installable pack's skills' `skill.json` (via
`read-skill-manifest.ts`, unchanged) and tags each with its `enablement` tier.

`detect-monorepo.ts` (M5) is used by BOTH non-interactive `install`'s warning logic AND (M6,
new) the wizard's step 1 (`src/wizard/steps/detect-repo.ts` wraps it verbatim) — no longer
single-consumer as of this pass.

## Key Concepts

- **The D19 skill-selection MERGE POLICY (M7, brief item 6) — the single most important new
  concept this pass adds.** The effective skill set for ANY run (install, doctor, repair,
  upgrade) is ALWAYS computed FRESH as `resolveSkillSelection({catalog, excluded, included})`,
  where `catalog` comes from the CURRENTLY bundled packs (read live off disk every time, via
  `buildSkillCatalog()`) and `excluded`/`included` come from the STORED profile deltas
  (`skills-profile.json`'s `skillSelection` field) — NEVER the other way around, and the two
  inputs are never cached or persisted together as a combined "effective set" anywhere. This one
  design choice is what makes every part of the D19 requirement true simultaneously, by
  construction rather than by four separate special cases:
  - **Deselected skills are never "missing".** A default skill the user excluded was never part
    of `computeRenderPlan()`'s `canonicalPlan` for this run, so it was never rendered and never
    added to `.nockta/generated-manifest.json` — `classify-manifest.ts` has nothing to classify
    for it at all. Doctor's `healthy` is unaffected; there is no "this file should exist but
    doesn't" case to accidentally trigger.
  - **New default skills in a newer pack version join automatically on upgrade.** Because the
    catalog is rebuilt from the CURRENT pack contents every time, a brand-new default-tier skill
    that didn't exist when the profile's deltas were recorded is simply not in `excluded` (it
    couldn't have been — it didn't exist yet) — so `resolveSkillSelection()` includes it in
    `effective` the same as any other default skill, and the next repair/upgrade renders it for
    the first time. No migration code, no "diff the old and new skill list" logic anywhere.
  - **New optional skills stay off.** Same mechanism, mirrored: a new optional-tier skill is not
    in `included`, so it stays excluded from `effective` until a human explicitly opts in via
    `--include-skills` or the wizard's step 5, same as any other optional skill.
  - **Toggles are preserved, not recomputed.** `upgrade-adapters.ts`/`upgrade-adapters-monorepo.ts`
    pass `options.profile.skillSelection` STRAIGHT THROUGH to `writeSkillsProfile()`/
    `writeMonorepoSkillsProfile()` unchanged — upgrade re-renders content, it never touches the
    deltas themselves (mirrors the pre-existing "upgrade never adds/removes packs" scope
    boundary, just applied one level down at skill granularity).
  - **A delta referencing a skill that no longer exists in the current catalog is a silent,
    harmless no-op**, not a crash — this is `resolveSkillSelection()`'s maintenance-recompute
    posture (its `.errors`/`.ok` are deliberately ignored by `render-plan.ts`, see
    `skill-selection.ts`'s own doc comment) — a pack author removing a skill between versions
    does not brick an existing install's doctor/repair/upgrade.
  See `test/skill-selection-e2e.test.ts`'s "upgrade merge policy" describe block for the
  verbatim simulation (a fixture pack gains a new default + new optional skill between an install
  and an upgrade call) that exercises every bullet above in one test.
- **`computeRenderPlan()` reuses the M3 renderer via a scratch `mkdtemp` dir, on purpose.**
  Doctor/repair/upgrade all need to know, for the profile's `repoType`/`installedAdapters`,
  "what would a fresh install produce right now" — including the D1 override-wins resolution
  and `skill.json` adapter-restriction logic `renderClaudeAdapter()` already implements. Rather
  than reimplementing that source resolution here, `render-plan.ts` calls the real
  `renderAdapters()` against a throwaway temp directory, captures each `RenderedFile`'s
  `relativePath` (target-dir-independent — `relative(scratchDir, output)` yields the same
  `.claude/...` string regardless of which absolute dir was used) and `sourcePath` (always
  under the real bundled `packs/`, never the scratch dir), then deletes the scratch dir before
  returning. Callers never touch scratch-dir bytes; `sourcePath` is all they need to (re)write
  the real target file. This keeps D1/D8 logic in exactly one place (`src/adapters/claude/
  render.ts`) instead of two.
- **`applyRenderPlan()` is the ONE place repair and upgrade actually decide per-file fate.**
  Given a canonical plan entry and (if any) its prior manifest record:
  - not on disk -> always **restored** (regardless of mode).
  - on disk AND its hash matches the prior record's `outputHash` -> "safe": repair only
    **refreshes** it when stale (`generatorVersion` or `sourceHash` drift vs. the *current*
    bundled source); upgrade **always** refreshes it (spec §13.4 "re-renders ALL generated
    output").
  - on disk but hash does NOT match the prior record (or there is no prior record at all —
    unknown provenance) -> **skipped, with a warning**, unless `force`, in which case
    **force-overwritten**. Never blind-overwritten (spec §14) either way.
  A file's manifest record is preserved untouched when skipped, so a re-run of `doctor`
  correctly still reports it `modified` — nothing is silently marked clean.
- **Repair vs. upgrade is a `mode` flag into the SAME engine, not two implementations.** The
  only branch that differs is: repair leaves already-current, non-stale files alone; upgrade
  re-writes them anyway (fresh `generatedAt`/`generatorVersion`) because its whole point is
  guaranteeing the tree reflects the running version. Both obey the identical
  modified-file-protection rule above.
- **"unknown" files are never in `canonicalPlan`, so they are never at risk — by construction,
  not by a special-case check.** Doctor's unknown scan (`.claude/skills/` + `.claude/agents/`
  ONLY, per the M4 brief — not `.cursor/`/`.github/`, which don't exist yet, spec §8.3/§8.4)
  is informational-only and does not affect `healthy` — see the next bullet.
- **`healthy` = per-file classification clean AND profile-level "current".** Doctor originally
  computed `healthy` from file counts alone; a defensive fix (this pass) folds in
  `profile.source.version === packageVersion` too (`current`, spec §7.7/§13.5/§18's own
  language: "no-op when healthy AND current" — read as one combined gate for exit-code
  purposes here). In the realistic drift case, a package version bump touches per-file
  `generatorVersion` too (profile + manifest are always written together, see
  `write-profile.ts`/`write-manifest.ts`), so `stale` counts already catch it — the `current`
  check is belt-and-suspenders for the edge case where only the profile's own version field
  was touched (e.g. `upgrade.test.ts`'s temp-edit-based version-delta simulation, per the M4
  brief's suggested test technique) without a matching manifest edit.
- **`decideSyncMode()` is a pure function — the ENTIRE sync mode matrix in one place.**
  `healthy` wins over every flag (`--dry-run`/`--yes`/TTY) — a current, healthy repo is always
  `"no-op"`. Otherwise: `--dry-run` always wins next (plan only, regardless of TTY/`--yes`);
  then a real TTY means `"interactive"` (regardless of `--yes` — confirmation still happens);
  then non-interactive `--yes` means `"auto-apply"`; otherwise `"plan-only"` (D10: never
  silently rewrite). `test/sync.test.ts` exercises every branch directly, with no TTY/prompt
  involved — this is exactly the "orchestrator's decision function" the M4 brief calls out for
  unit-level interactive-path coverage.
- **Sync applies upgrade INSTEAD OF repair when both would otherwise fire, not both.** An
  upgrade re-render (mode `"upgrade"`) already restores missing files and refreshes stale ones
  as a side effect of "re-render everything" — running repair afterward would find nothing left
  to do. This is `runSyncOrchestration()`'s reading of spec §13.5's "minimum necessary action".
- **`sync-orchestrator.ts`'s `confirmFn` injection point exists specifically so the interactive
  path never needs a real TTY or a real `@inquirer/prompts` call in tests.** `runSyncCommand`'s
  default (`defaultConfirm`, lazy `import("@inquirer/prompts")`) is the only place that package
  is actually used in this codebase so far (it was an installed-but-unused dependency through
  M3 — see root `context.md`'s M3 note). `test/sync-process.test.ts` (process-level, built
  `dist/cli.js`, closed stdin so `isTTY` is false) never reaches the interactive branch at all
  by construction; it exists to catch a REGRESSION into that branch — if `sync` ever
  incorrectly decided to prompt in a closed-stdin process, `spawnSync`'s `timeout` option turns
  a hang into a fast, loud test failure (`signal === "SIGTERM"`, asserted against) instead of
  hanging CI.
- **Scope boundary superseded (M5): monorepo is now real, not a guarded-off later milestone.**
  `profile-guard.ts`'s M4 `"monorepo-unsupported"` status is GONE. A monorepo profile is now
  validated against the real `NocktaMonorepoSkillsProfile` shape and, if valid, returned as
  `"ok-monorepo"` — doctor/repair/upgrade/sync all branch on it to run the monorepo-aware path
  instead of refusing. `"invalid"` is still returned for an `isMonorepo: true` object that does
  NOT match the real shape (e.g. missing `targetsFile`) — this is a genuinely different failure
  mode than "unsupported", and one M4 test was updated (not broken) to assert it — see root
  `context.md`'s Current State.
- **`classify-manifest.ts` is to M5's monorepo doctor what `render-plan.ts` already was to M4's
  doctor/repair/upgrade — the SAME reuse-not-reimplement pattern, one level up.** M4's
  `doctor-checks.ts` originally inlined its manifest-record classification loop; M5 extracted it
  verbatim into `classify-manifest.ts` so `monorepo-doctor-checks.ts` could call the identical
  logic against a UNION `canonicalPlan` (built from every distinct target `repoType`) instead of
  forking a second copy that could silently drift from the single-project rules. Single-project
  `doctor-checks.ts` now calls `classify-manifest.ts` too — its own classification BEHAVIOR is
  byte-for-byte unchanged (verified: all 12 pre-existing `test/doctor.test.ts` cases still pass
  unmodified except the one deliberately-superseded monorepo-status assertion).
- **`render-plan.ts`'s `repoTypes: RepoType[]` is a UNION across targets, computed once, shared
  by every root-rendered file — not one plan per target.** Monorepo install renders ONCE at the
  repo root (spec §9.4): `injectSkillsMonorepo()` calls `resolvePacks({requestedPacks:
  distinctRepoTypes, monorepo: true})` a SINGLE time to get the pack set actually rendered, then
  calls `resolvePacks()` AGAIN per-target (cheap — no I/O, no rendering) purely to compute each
  target's own narrower `installedPacks` list for `targets.json` (spec §9.3's worked example:
  the `api` target's `installedPacks` doesn't include `next`, even though `next` WAS rendered at
  root because the sibling `web` target needed it). `monorepo-doctor-checks.ts`/
  `repair-adapters-monorepo.ts`/`upgrade-adapters-monorepo.ts` all derive the SAME union from
  `targets.json`'s `targets[].repoTypes` (flattened, D22) at read time — the union is never
  itself persisted, by design, so there is only one source of truth (`targets.json`) to keep
  consistent.
- **Monorepo doctor's target plausibility check is DELIBERATELY SHALLOW — existence + a
  `package.json` present, nothing more.** Spec §9.5 says doctor must check "target paths still
  match expected repo types"; a real implementation of that would need to run the same
  framework-signal heuristics `create-nockta-repo` uses at scaffold time. That is explicitly OUT
  OF SCOPE for this milestone (per the M5 brief: "existence + basic plausibility only — deep
  re-detection heuristics are NOT this milestone") — documented here and in
  `monorepo-doctor-checks.ts`'s own doc comment as a known, intentional gap, not a silently
  skipped check.
- **A missing target directory has NO fix within `SyncPlan`'s 3-flag vocabulary
  (`needsInstall`/`needsUpgrade`/`needsRepair`) — `sync` reports this honestly rather than lying
  or crashing.** Repair/upgrade only ever touch root-rendered adapter output, never target app
  directories (this milestone's own scope statement: "repair/upgrade operate on the
  root-rendered outputs ... exactly as single-project mode does"). If a target dir vanishes but
  every root file is still intact/current, `doctor.healthy` is `false` (target plausibility folds
  in) yet `buildSyncPlan()` finds nothing to repair or upgrade — `runSyncOrchestration()` still
  runs its apply step (mode `"auto-apply"`, `applied: true`) but neither `repairResult` nor
  `upgradeResult` gets set, so the final `doctorAfter` is unchanged and `sync` correctly reports
  `ok: false` / exit `4`. See `test/monorepo-maintenance.test.ts`'s last sync case for the
  verbatim assertions on this behavior.
- **D21's closure runs INSIDE `resolveSkillSelection()`, so every existing caller gets it for
  free by threading one already-in-scope value.** `render-plan.ts`, `build-install-plan.ts`,
  `inject-skills.ts`, `inject-skills-monorepo.ts` each already HAD `adapters: AdapterType[]` in
  their own options (needed for rendering, long before D21) — M9 added exactly one line to each
  (`adapters: options.adapters` on the `resolveSkillSelection()` call). No new I/O, no new
  options threading beyond that one field, no change to any of these files' own control flow.
  This mirrors M7's own "one place the effective set gets computed" design goal one level deeper:
  D21 doesn't add a second resolution step after D19's, it makes D19's ONE step do more.
- **Import-time authoring note (D21, for the eventual content-import pass): `requires` is a
  one-line addition to an already-real `skill.json`, nothing structural.** When
  `improve-codebase-architecture`/`codebase-design`/`grilling`/`domain-modeling` (mattpocock
  cluster) and `grill-me` are eventually imported from `planned skills/` into `packs/common/`
  (separate, still-parked milestone — see root `context.md`'s "What's not here yet"),
  `improve-codebase-architecture`'s skill.json needs `"requires": ["codebase-design", "grilling",
  "domain-modeling"]` and `grill-me`'s needs `"requires": ["grilling"]` — both `"enablement":
  "optional"` (matching D21's own framing: locked/auto-enabled only while their dependent is on,
  never on by default themselves), `improve-codebase-architecture` keeping
  `"supportedAdapters": ["claude"]` (D8, unchanged) while its three dependencies stay portable
  (`["claude", "cursor", "copilot"]` or whatever the eventual import settles on). No importer code
  change is needed — `scripts/import-skill.ts` already passes `skill.json` through; `requires` is
  simply one more field an author sets by hand, same as `enablement`.
- **D22 union resolution needed almost NO new merge logic — `resolvePacks()`'s
  `requestedPacks` was ALREADY a list resolved through an internal `Set`.** A multi-type target's
  `repoTypes: RepoType[]` (or a monorepo's flattened UNION across every target) is fed to
  `resolvePacks({requestedPacks: repoTypes, ...})` completely unchanged from how a single-element
  array was fed before D22 — `resolvedNames` was always a `Set<string>`, so `common` still
  resolves exactly once regardless of how many requested types (or how many targets) name it as
  a `requires` dependency, and a type named twice (explicit dedup upstream in
  `parseRepoTypesList()`, or two different multi-type targets both naming the same type) still
  only resolves its pack once. This is why D22's "union resolution" milestone item is almost
  entirely a TYPE change (`RepoType` -> `RepoType[]` at every call site) rather than new
  resolution logic — see `types/repo-type.ts`'s `parseRepoTypesList()` (comma or `+` separator,
  shared by the CLI's `--type` comma form and `parse-targets.ts`'s colon-form `+`-joined type
  list) for where the actual multi-type PARSING lives.
- **An "unmapped" repo type never reaches `resolvePacks()` at all — it is rejected at the parse
  boundary, not silently absorbed.** The D22 refinement's "a sub-signal that matches no stack
  pack ... contributes nothing beyond common" describes a HYPOTHETICAL future type (e.g. a
  dedicated `vite-vanilla-ts`) that does not exist in `REPO_TYPES` today — `parseRepoTypesList()`
  and `detectRepoType()`'s guess `type` field are both scoped to the six real `RepoType` values,
  so there is no code path today where an actually-unmapped name flows into `requestedPacks`.
  What DOES happen defensively (tested in `test/resolve-packs.test.ts`): a syntactically-valid-
  but-pack-missing-on-disk requested name (or a `requires` chain naming one) is reported in
  `resolvePacks()`'s pre-existing `missing: string[]` bucket, exactly as it always was — D22 adds
  no new "missing" semantics, it just means that bucket can now be reached from a multi-type
  request too.
- **Legacy `repoType` (singular) read-shim lives at the parse/normalize boundary, not scattered
  across every reader.** `types/profile.ts`'s `normalizeLegacyRepoType()` (called once, inside
  `profile-guard.ts`'s `readProfileForMaintenance()`, BEFORE shape validation) and
  `types/target.ts`'s `normalizeTargetRecord()` (called once, inside `read-targets.ts`'s
  `readTargetsFile()`, per record) are the ONLY two places a legacy singular field is ever
  consulted — every downstream consumer (doctor, repair, upgrade, sync, the wizard) only ever
  sees the current `repoTypes: RepoType[]` shape. Every WRITE path (`write-profile.ts`,
  `write-targets.ts`) always emits the new shape — the shim is read-only, one-directional, and
  (per decisions.md D22's own "Why") purely defensive: no published version of this package ever
  wrote the old shape.
- **D21's cycle/dangling-requires validation is catalog-wide, not run-specific — a genuine
  pack-authoring correctness check, deliberately checked before anything about THIS run's
  `--exclude-skills`/`--include-skills` input.** A dangling `requires` name is flagged even for a
  skill that isn't part of this run's effective set at all; this differs from the unknown-name
  checks on `--exclude-skills`/`--include-skills` (which only ever look at what THIS run's input
  actually names). Both feed the same `errors` array and both use the exact same tolerant-vs-strict
  posture split described above — a pack-authoring bug doesn't crash maintenance recompute any
  more than a stale delta does.

## Current state (as of Milestone 7, 2026-07-10)

All files above are real, for both single-project AND monorepo repos, across all THREE MVP
adapters (claude/cursor/copilot, M7). `doctor`/`repair`/`upgrade`/`sync` have graduated off the
`runNotImplemented` placeholder pattern. M4's single-project demo run (install -> doctor healthy
-> delete a file -> doctor missing/exit 4 -> repair restored -> tamper -> repair warned+skipped
-> `--force` -> `sync --dry-run` -> `sync --yes` applies upgrade on a simulated stale version ->
final doctor healthy) is unchanged and still passes. M5 adds the monorepo equivalent. M6 adds
`detect-repo-type.ts`. **M7 (this pass) adds `skill-selection.ts` + `build-install-plan.ts`** (D19
three-tier selection resolver + `install --dry-run` plan builder — see the D19 merge-policy Key
Concepts bullet above, the substantive new content in this directory this pass) — every other
core file gained, at most, a one-line `skillSelection`/`effectiveSkills` threading addition (see
each file's own Directory Layout entry above for exactly which). See root `context.md`'s "Current
state" for the M7 demo transcript (all-3-adapters install, exclude/include-skills, dry-run,
repair restoring a deleted `.mdc`) and this milestone's worker report for the full verbatim
output.

## Current state addendum (Milestone 9, 2026-07-11 — D21 skill-level dependencies)

`skill-selection.ts` gained the `requires` closure (see its Directory Layout entry and the three
new Key Concepts bullets above) — EXTENDED, not replaced; every pre-existing D19 test in
`test/skill-selection.test.ts` still passes unmodified. `render-plan.ts`, `build-install-plan.ts`,
`inject-skills.ts`, `inject-skills-monorepo.ts` each gained exactly one line
(`adapters: options.adapters`, threading an already-in-scope value). `build-install-plan.ts`'s
`InstallPlanSkillEntry` gained `requiredBy: string[]`. No other file in this directory changed.
See root `context.md`'s M9 "Current state" for the demo transcript (closure pull+lock in the
dry-run plan, adapter-gating exit 1, blocked-exclusion exit 1, grill-me/grilling auto-satisfaction
+ doctor/upgrade dependency-closed verification) and this milestone's worker report for the full
verbatim output.

## Current state addendum (Milestone 10, 2026-07-11 — D22 multi-type targets)

`RepoType` -> `RepoType[]` at every call site that used to carry a single repo type:
`InstallOptions.repoType` -> `.repoTypes`, `MonorepoInstallTarget.repoType` -> `.repoTypes`,
`ParsedTarget.type` -> `.types`, `ComputeRenderPlanOptions.repoType` (removed) ->
`.repoTypes` (now the only option), `TargetRecord.repoType` -> `.repoTypes`,
`NocktaSkillsProfile.repoType` -> `.repoTypes`. Every internal `[...new Set(targets.map(t =>
t.repoType))]` union computation became `[...new Set(targets.flatMap(t => t.repoTypes))]` — same
Set-based dedup, just flattening one more level (see the Key Concepts bullet above on why
`resolvePacks()` itself needed zero change). Two genuinely NEW pieces: `types/repo-type.ts`'s
`parseRepoTypesList()` (comma/`+`-separated multi-type parsing, shared by `commands/install.ts`'s
`--type` and `core/parse-targets.ts`'s colon-form) and `detect-repo-type.ts`'s
`detectRepoTypeAcrossWorkspace()` + the new `workspace-globs.ts` extraction it shares with the
wizard (see their own Directory Layout entries above). Read-shim normalization
(`types/profile.ts`/`types/target.ts`, see Key Concepts) means a hand-authored or pre-D22-shaped
`repoType: "next"` on disk still reads back as `repoTypes: ["next"]` everywhere. See root
`context.md`'s D22 entry for the demo transcript (comma `--type`, colon+plus `--target`, the Grace-
shaped workspace-walking detection output, and the legacy read-shim) and `src/wizard/CONTEXT.md`
for the wizard-side multi-select + "root-is-a-project monorepo" override.

## Current state addendum (post-D26 pass, 2026-07-11 — razor applicability gating in `resolveSkillSelection()`)

`skill-selection.ts`'s `resolveSkillSelection()` gained a second, orthogonal eligibility axis
alongside D21's existing `adapters` gating: an optional `repoTypes?: RepoType[]` option, driving
`isApplicable(name)` (a catalog entry's `applicability` — populated only by the razor pack's 61
skills — must intersect `repoTypes`, or the entry is inapplicable; a catalog entry with no
`applicability` at all is always applicable, same "absent means unrestricted" convention as every
other optional skill.json field). `isEligible()` is now `isAdapterEligible() && isApplicable()`.
A separate `ineligibleApplicabilityIncluded` check (mirroring the pre-existing
`ineligibleAdapterIncluded` bucket, kept distinct for a clearer error message) rejects
`--include-skills <razorSkill>` when its `applicability` excludes the given `repoTypes` — non-
interactive parity for the wizard's D26 offer filter (`src/wizard/CONTEXT.md`). `repoTypes` is
threaded from every REAL install-time caller that already has repo types in scope:
`inject-skills.ts`, `inject-skills-monorepo.ts` (its own `distinctRepoTypes` union), and
`build-install-plan.ts`'s dry-run path. `render-plan.ts`'s `computeRenderPlan()` — the tolerant
doctor/repair/upgrade maintenance-recompute call site that already deliberately ignores `.ok`/
`.errors` — is DELIBERATELY left NOT passing `repoTypes`, same reasoning as why it does not gate
on other request-time-only validation: a stale/curation-changed applicability should not
retroactively zero out an existing install's effective set on recompute. `build-install-plan.ts`'s
`InstallPlanSkillEntry` also gained `description`/`overlaps` (bonus item 8 — the dry-run plan
surfaces each skill's D26 description and a same-ground-overlap count), read straight off the
catalog entry, zero extra I/O.

## Current state addendum (post-Milestone 8, 2026-07-11 — D24 `agent` adapter, D23 subagent-delegation reclassification)

**Zero core changes needed beyond a one-block dispatch case.** `render-adapters.ts` gained
`if (adapter === "agent") { renderAgentAdapter(...) }` (same shape as the other three) and that is
the ONLY `src/core/` file touched by this pass. Everything else here is already adapter-agnostic
by construction (see "Key Concepts" above): `render-plan.ts`'s `computeRenderPlan()` threads
whatever `adapters: AdapterType[]` it's given straight through to `renderAdapters()` with no
per-adapter branching of its own; `classify-manifest.ts`'s `classifyManifestRecords()` classifies
every `GeneratedFileRecord` by `path` lookup against the canonical plan, never by adapter
identity; `apply-render-plan.ts`'s repair/upgrade restore path reads `entry.content`/
`entry.sourceContentHash` when present (true for agent, same constructed-output mechanism as
cursor/copilot, `src/adapters/types.ts`) with no adapter-specific fallback. This is exactly the
"manifest-driven, not adapter-hardcoded" design `src/adapters/CONTEXT.md`'s D20 note already
proved out for cursor's filename rename — verified again here by `test/multi-adapter-e2e.test.ts`'s
4-adapter `describe` block (install with `claude,cursor,copilot,agent` -> rm `AGENTS.md` -> doctor
exit 4, `missing`, `adapter: "agent"` -> repair restores -> doctor exit 0 again), with no code
change required to make that pass. `MANAGED_SCAN_ROOTS` (`classify-manifest.ts`) stays
`.claude/skills` + `.claude/agents` only, unchanged — it drives "unknown" (untracked) file
detection, pre-existing scope that already excluded `.cursor/rules`/`.github/instructions` before
this pass; `AGENTS.md`'s own missing/modified/stale detection goes through the manifest-records
loop, not this scan, so it needs no entry there.

## Current state addendum (2026-07-13 — D34 standing-mode contract, `standing-mode.ts`)

**New module `src/core/standing-mode.ts` — the single source of truth for the working-mode
contract** (the three required owner skills govern all agent work). The contract TEXT is authored
once here (`renderStandingModeContract()`/`renderStandingModeSection()`) and rendered at runtime
into exactly one file: root `AGENTS.md`. Two kinds of consumers:
- **Renderers (pure, no FS side effects beyond their own output):** `adapters/agent/render.ts`
  embeds `renderStandingModeSection()` as the `AGENTS.md` preamble; `adapters/cursor|copilot/
  render.ts` prepend the `STANDING_MODE_REFERENCE` one-liner. These flow through the existing
  hash/manifest/doctor pipeline unchanged (the block/reference is just part of the generated bytes).
- **Orchestrator side effects (real target only):** `applyStandingMode({targetDir, adapters})` is
  called by `inject-skills.ts`, `inject-skills-monorepo.ts`, `repair-adapters.ts`,
  `upgrade-adapters.ts`, and the two monorepo maintenance siblings — AFTER their render/apply step.
  It runs `ensureAgentsMdStandingMode()` (only when `agent` NOT in adapters) and
  `ensureClaudeMdReference()` (only when `claude` in adapters). **Critically it is NEVER called from
  `render-plan.ts`'s `computeRenderPlan()`** — that renders into a throwaway scratch dir, so putting
  existing-repo/CLAUDE.md logic there would target the scratch path, not the repo. Keeping it in the
  orchestrators (which always operate on the real target) is what makes the existing-repo-safe
  create/refresh/append idempotence correct across install/repair/upgrade.

**Doctor semantics (decisions.md D34, chosen model (b)).** `CLAUDE.md` and the *side-effect*
`AGENTS.md` (agent adapter not selected) are consumer-shared files — they are NEVER written into
`.nockta/generated-manifest.json`, so `classify-manifest.ts` never classifies them, and both sit
OUTSIDE `MANAGED_SCAN_ROOTS` (`.claude/skills` + `.claude/agents`) so they are never flagged
`unknown` either. This is deliberate: doctor's model is "our generated files only", and these are
not ours to own — correctness is guaranteed by the idempotent `applyStandingMode()` re-run on every
maintenance command, not by hash tracking. The ONE tracked case is unchanged: when the `agent`
adapter IS selected, `AGENTS.md` is the agent renderer's normal manifest record and doctor covers
it (missing/modified/stale) exactly as before. No changes were needed to `classify-manifest.ts`,
`doctor-checks.ts`, `apply-render-plan.ts`, or the `DoctorReport` type — option (b) fits the
existing model with no new mechanism (option (a)'s "lightweight note" was rejected precisely because
it would have required extending that model). Full suite 578/578 green.

## Current state addendum (2026-07-13 — D34 addendum: agent-adapter AGENTS.md clobber CLOSED)

**Boundary closed.** The agent adapter previously blind-overwrote a pre-existing consumer `AGENTS.md`
(the D34 "Known boundary"). It now MERGES via one shared `mergeAgentsMd()` in `standing-mode.ts`
(alongside new `wrapAgentsRegion`/`unwrapAgentsRegion` and the `AGENTS_REGION_START/END` markers):
the whole Nockta payload (intro + standing preamble + skill bodies) lives inside an outer guard
region; consumer content outside it is preserved verbatim (create / refresh-in-place / append).

**Two write sites, one merge:**
- **Install** — `adapters/agent/render.ts` reads the on-disk `AGENTS.md`, merges, writes. Its
  `RenderedFile.content` stays the target-INDEPENDENT canonical region (so `computeRenderPlan()`'s
  scratch render is unaffected and the plan stays pure), and `mergedIntoConsumerContent` reports
  whether consumer content was present. `inject-skills.ts` / `inject-skills-monorepo.ts` FILTER out
  that entry's manifest record when the flag is set (untracked side-effect, model b).
- **Repair/upgrade** — `apply-render-plan.ts` special-cases the root `AGENTS.md` agent entry
  (`isAgentsRootEntry()`, narrowly scoped): it unwraps the plan's canonical region to recover the
  Nockta body, merges into the on-disk file, and tracks a manifest record ONLY when the result is
  wholly Nockta's. This deliberately BYPASSES the generic user-modified guard for `AGENTS.md` — bytes
  outside our region are always the consumer's (kept), bytes inside are always ours (restored), so
  there is nothing to "skip and warn" about; `repair` restores our region without touching theirs.
  Because `AGENTS.md` is in the canonical plan, the tail "preserve records outside the plan" loop
  never re-adds a dropped (now-untracked) record.

**Adapter-selection-flip rule (owner follow-up, same day).** Anything between our own markers is OURS
to reconcile, everything else is the consumer's. Before merging, `mergeAgentsMd()` runs
`exciseOwnedRegions()` over the bytes it is about to treat as consumer content: every complete bare
`nockta:standing-mode` region (what `ensureAgentsMdStandingMode()` wrote when agent was NOT selected)
and every stray/duplicate `nockta:agents` region is removed (looped, so multiples all go), whitespace
holes collapsed. Consequences: a no-agent → agent reinstall yields exactly ONE `nockta:agents` region
with the standing region nested inside (never a duplicate bare block); a file wholly ours after
excision collapses to the pure TRACKED region. The reverse flip (agent → no-agent) was already safe —
`ensureAgentsMdStandingMode()`'s `upsertGuardedRegion()` finds the standing markers nested inside the
agents region and refreshes in place — now pinned by test. (The stale agents region deliberately
remains on the reverse flip, consistent with the existing model of not deleting deselected adapters'
outputs.) One accepted nuance: the unmarked prose header `ensureAgentsMdStandingMode()` writes on a
FRESH file is not marker-identified, so after a flip it counts as consumer content (file untracked) —
per the markers-only ownership ruling.

**Manifest model b, extended honestly.** Wholly-Nockta `AGENTS.md` (fresh repo) → tracked, doctor
covers missing/modified/stale exactly as before. Merged-into-consumer `AGENTS.md` → untracked; it
sits outside `MANAGED_SCAN_ROOTS`, so doctor neither classifies nor flags it `unknown`, and a
consumer editing their own bytes never trips `modified`. Correctness of the untracked case rests on
the idempotent re-merge on every install/repair/upgrade — the same reliance as the non-agent
side-effect files. Fresh output is byte-identical to before except the two outer marker lines. Full
suite 597/597 green (+18: `mergeAgentsMd` unit incl. flip/stray-remnant excision + agent-render
merge/flag + `clobber boundary CLOSED` e2e incl. both flip directions). See decisions.md D34
addendum.
