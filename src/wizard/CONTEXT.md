# CONTEXT.md — src/wizard/

## Purpose

The interactive install wizard (spec §7.1, §11 `src/wizard/*`). Real as of Milestone 6 — was a
Milestone 1 print-only shell.

**D28 rebuild (2026-07-11) — strict Model–View–Controller.** The wizard was rebuilt end-to-end into
an MVC split so a future web presenter is a second View, not a second implementation, and so the
create→inject handoff (D29) has a clean preset seam. Read THIS section first — it supersedes the
per-Milestone narrative below wherever they conflict (that narrative is kept for history).

- **MODEL — `src/wizard/core/` (presenter-agnostic, fully serializable).**
  - `skill-offering.ts` — the offer/lock/applicability predicates (`isOfferable`,
    `isApplicableToRepoTypes`, `offerableEntries`, `isRazorEntry`, `clashIdToDisplayName`). MOVED
    here out of `steps/select-skills.ts` (prompt code) so both the CLI step and the schema compute
    offerability from ONE brain. `steps/select-skills.ts` now imports them (no logic dup; its
    legacy tests still pass unchanged).
  - `types.ts` — the serializable vocabulary: `StepModel`/`ChoiceModel`/`SectionModel`,
    `WizardSchema`, `WizardAnswers`, `InstallPlan`. Plain JSON only — no Maps/Sets/closures/Symbols
    — because a web page POSTs `WizardAnswers` back and fetches `WizardSchema`. **2026-07-11
    (reconciliation pass): `ChoiceModel` gained an optional `title` field**, set equal to `label`
    for repo-type/adapter rows only (skill/razor rows leave it unset — their `label` was already
    the clean skill name). `value` stays the raw `RepoType`/`AdapterType` enum everywhere — routing,
    `resolve()`, `--type`/`--adapters`, and render dispatch all key off it, unchanged. See
    `build-schema.ts`'s note below and `src/types/repo-type.ts`'s `REPO_TYPE_TITLES`/
    `REPO_TYPE_DESCRIPTIONS` + `src/types/adapter.ts`'s `ADAPTER_TITLES`/`ADAPTER_DESCRIPTIONS` —
    the single source for these owner-authored display strings.
    **2026-07-11 (razor-category-sections pass): `ChoiceModel` gained an optional `section` field
    and `SectionModel` gained an optional `key` field** — the actual grouping-match pair a
    presenter uses (`view/paginated-frame.ts`'s `buildRows()`), falling back to `pack` on both
    sides when absent. `pack` itself is now documented as staying the entry's REAL pack always —
    it is never repurposed as a grouping key, which is exactly the mistake that would have
    silently collapsed the razor step's new category sections back into one (every razor skill
    shares the one `razor` pack).
  - `build-schema.ts` — `buildWizardSchema(ctx)` returns the ordered, fully-resolved steps
    (tiers/locks/clash/razor applicability) as plain JSON; the per-step builders
    (`buildSkillsStep`/`buildRazorStep`/`buildRepoTypeStep`/`buildAdapterStep`/`buildTargetsStep`/
    `buildConfirmStep`) are what the CLI presenter AND the schema both render — one brain, two Views.
    The general skill step EXCLUDES razor and is sectioned by pack (common first); the razor step is
    its OWN step, razor-only, applicability-filtered (returns `null` when nothing applies → skipped).
    User-facing strings carry NO dev-speak (tiers live in structured fields, not `[default]` labels).
    **2026-07-11 (reconciliation pass): `buildRepoTypeStep()`/`buildAdapterStep()` now set
    `label`/`title` to a friendly display name** (`REPO_TYPE_TITLES`/`ADAPTER_TITLES` from
    `src/types/*`, e.g. `next` → "Next.js", `claude` → "Claude Code") and `description` to a
    consumer-facing one-liner (`REPO_TYPE_DESCRIPTIONS`/`ADAPTER_DESCRIPTIONS`, the old inline
    `ADAPTER_DESCRIPTIONS` partial map here was removed in favor of that single source); the
    repo-type step appends detection evidence to the base description when a guess exists, rather
    than replacing it. The enum stays in `value` — this is a DISPLAY-only change, both Views render
    it (see `view/paginated-frame.ts`'s two-pane box, which reads `choice.label`, and
    `src/web/page.ts`, which reads `choice.title ?? choice.label ?? choice.value`). `SKILL_PAGE_SIZE`
    bumped 10 → 20 (owner ask, up to 20 skills/page).
    **2026-07-13 ("phantom grilling" web-wizard fix): `buildWizardSchema()` now resolves each skill
    layer's dependency closure through `resolveSkillLayerRound` (the SAME resolver the CLI
    controller's lock/release loop uses)** rather than emitting the bare tier defaults — so a
    default skill that forces an optional one via `requires` (e.g. `grill-me` → `grilling`) is
    emitted LOCKED-ON (checked + disabled "needed by grill-me"), matching what the CLI wizard
    already renders. The answer set is the tier defaults adjusted by the new optional
    `ctx.excludeSkills`/`ctx.includeSkills` (the web flow's live selection), so the web page's
    `GET /schema` re-fetch releases the lock when the forcer is deselected; first paint /
    `--emit-schema` pass no deltas → pure defaults. This only touched `buildWizardSchema` (the
    schema/web + `--emit-schema` consumer); the CLI presenter's own loop is unchanged.
    **2026-07-11 (razor-category-sections pass): `buildRazorStep` now sections by the razor
    skill's `category` (`SkillCatalogEntry.category`, threaded from `skill.json` — see
    `src/packs/CONTEXT.md`), not `pack`** — every razor skill shares one pack, so pack-grouping
    had collapsed the step into a single flat section despite 61 skills carrying real per-skill
    categories on disk since the D26 import. `buildSkillChoiceModels` gained an optional 4th
    `grouping: { sectionKeyOf, sectionOrder }` parameter (defaults to the old pack-based behavior,
    so `buildSkillsStep`'s 3-arg call site is untouched/byte-identical); new `buildRazorSections()`
    emits the FIXED brief order — Core, Architecture, Security, Testing, Delivery, Data, Realtime,
    Tooling, Domain: React, Domain: Next.js, Domain: NestJS, Domain: Shopify, trailing "Other" only
    if needed — filtered down to categories actually present in the (already applicability-
    filtered) offerable set; an empty category is omitted, never shown as an empty section. Every
    section's `pack` stays `"razor"` (the entries' real pack, per the `types.ts` note above); `key`
    carries the category id. `buildWizardSchema()`'s emitted JSON (`--emit-schema`) carries this
    unchanged — verified via `--type next`: 8 sections (Core…Domain: Next.js), Data/Realtime/
    Domain: NestJS/Domain: Shopify correctly omitted (their applicability doesn't intersect
    `next`).
  - `resolve.ts` — `resolve(answers) → InstallPlan` (the plain option object `buildInstallResult()`
    executes; the web flow is literally `answers → resolve() → buildInstallResult(plan)`),
    `mergeSkillDeltas()` (general + razor → one exclude/include pair), and `resolveSkillLayerRound()`
    (one D21 lock/release round, reusing `core/skill-selection.ts`'s `resolveSkillSelection()`).
- **VIEW — `src/wizard/view/`.**
  - `presenter.ts` — the `Presenter` interface (`clear()`/`renderStep(step, prefill)→answer|BACK/
    `close()`). The Controller depends ONLY on this; the CLI prompts are ONE implementation, a web
    presenter drops in with zero Controller changes.
  - `paginated-frame.ts` — the PURE render layer (`buildRows`/`itemRowIndices`/`pageCount`/
    `renderPaginatedFrame`). **Two-pane master–detail box (2026-07-11 redesign).** Layout: title →
    two-pane body → full-width footer. LEFT pane = the paginated list (section headers, `Page X/Y`
    via footer, selection markers ◉/○, lock 🔒 on required rows, cursor ❯, and the skill NAME ONLY —
    the hovered description is NO LONGER inline in the row, which is what fixed the old per-keystroke
    reflow/mid-word-wrap bug). RIGHT pane = detail for the CURRENTLY HOVERED item, updating as ↑/↓
    move: its name, its word-wrapped `description`, plus a clash line and a lock reason when present.
    A dim `│` divides the panes. **Body height is fixed per render** at the page window
    (`min(pageSize, rows.length)` — a one-page short list is a tight box, a multi-page list keeps the
    full window and pads the last page), so the box NEVER jumps when the cursor moves or when
    descriptions differ in length; over-long detail truncates with `…`. Left ≈40% of terminal cols
    (clamped 32–60), right takes the remainder minus the divider gutter. **This is the shared box for
    EVERY list step** (repo-type, adapters, skills, razor) — not skill-specific; a choice with no
    `description` degrades cleanly (detail pane shows the hovered name only, never an empty/broken
    pane). Below ~80 cols (two panes can't fit) it falls back to a SINGLE column: the list plus a
    fixed, TRUNCATED detail block stacked beneath (still no reflow — the detail area is a fixed
    height, not an inline line). Defaults to 80 cols when `process.stdout.columns` is undefined.
    Snapshot-tested headlessly (the only automated coverage of the prompt's layout).
    **2026-07-11 (razor-category-sections pass) — bug found + fixed: `buildRows()` previously
    matched `choice.pack === section.pack`, a hardcoded one-section-per-pack assumption.** Since
    every razor skill shares the one `razor` pack, this would have silently collapsed the razor
    step's new category sections back into a single lumped bucket the moment `build-schema.ts`
    started emitting them. Fixed to match on `(choice.section ?? choice.pack) === (section.key ??
    section.pack)` — the general skills step (never sets `section`/`key`) falls through to the
    exact same `pack`-vs-`pack` comparison as before, unaffected; the razor step's category
    sections now group correctly. This was the one real presenter bug this pass found, not just
    plumbing — see `test/wizard-view.test.ts`'s new describe block, which constructs choices
    sharing one `pack` but distinct `section` values specifically to catch a regression back to
    the old pack-only match.
  - `width.ts` — ANSI-aware terminal-width primitives the two-pane layout needs so columns don't go
    ragged: `stripAnsi`, `visibleWidth` (strips SGR color escapes AND counts wide glyphs as 2 cells —
    🔒 is width 2, the ◉ ○ ❯ ⚠ markers width 1, via the classic wcwidth wide/zero-width tables),
    `truncateToWidth` (cell-aware `…` clamp), `padEndVisible` (pad to an exact visible width),
    `wordWrap` (break on word boundaries, hard-split an over-long word — never mid-word past the edge).
  - `paginated-multiselect.ts` — the custom `@inquirer/core` prompt (`createPrompt` + hooks), NOT
    stock `checkbox()`. Keys: ←/→ discrete page turns (no wrap), ↑/↓ move cursor within page, space
    toggle, ↵ confirm, `b` back. Selection Set held ABOVE the page view (persists across pages).
    Reused for BOTH the general skill step and the razor step.
  - `theme.ts` — picocolors palette (selected green, cursor cyan/bold, disabled dim, headers bold,
    footer dim) + markers; toggleable off for deterministic snapshots.
  - `cli-presenter.ts` — the CLI `Presenter`: routes multiselect/paginated → the custom prompt,
    confirm → a themed Yes/No/‹ Back select, targets → the monorepo sub-flow. `clear()` wipes the
    viewport between steps (clean-view).
- **CONTROLLER — `src/wizard/controller.ts`.** `runWizardController()` — the back-aware indexed
  step-loop: `{ index, answers }`; each step renders via the Presenter with current answers as
  presets; a step returns an answer (advance) or BACK (retreat, PRESERVING answers). Preset steps
  (D29: `--type`/`--adapters`/`--target`/`--exclude-skills`/`--include-skills`/`--yes` already given)
  are skipped forward AND backward. Owns the skill lock/release re-render loop (View-side) and the
  catalog memoization. Never writes files — produces a plain `WizardAnswers`.
- **`run-install-wizard.ts`** now only does step-1 detection + narration (the "root-is-a-project
  monorepo" override; the `decisions.md D22` citation was stripped from that consumer-facing line,
  the plain concept phrase kept), seeds `answers`/`presetSteps` from flags, builds the
  `ControllerContext` (catalog factory + preview text), runs the Controller, then `resolve() →
  buildInstallResult()` → extras. **Test seam:** `presenter?: Presenter` (scripted fake) replaces
  the old `prompts?` for the main flow; `prompts?: WizardPrompts` is RETAINED but used ONLY by the
  post-write extras step (not a back-nav wizard step).
- **Four web-prep seams landed (schema-only; NO server/HTML/`--web`):** (1) the `Presenter`
  interface; (2) `WizardAnswers` is JSON round-trippable; (3) `buildWizardSchema()` emits the wire
  Model; (4) `resolve()` accepts the plain answers object.
- **Tests:** `test/wizard-core.test.ts` (Model), `test/wizard-controller.test.ts` (Controller via a
  fake Presenter — back-nav/presets/lock-loop/serializable answers), `test/wizard-view.test.ts`
  (pure frame snapshots). `test/wizard-flow.test.ts` migrated to a scripted `Presenter`.
  `test/wizard-steps.test.ts`'s pure-planner blocks are UNCHANGED (those functions are retained as
  the CLI step's building blocks / legacy coverage). **2026-07-11 (razor-category-sections pass):**
  `wizard-core.test.ts` gained a describe block proving `--type next`'s 8 ordered category
  sections (with Data/Realtime/Domain: NestJS/Domain: Shopify correctly omitted) and the converse
  for `--type nest`, plus a `buildRows()`-level proof that the CLI row-builder actually groups by
  category; `wizard-view.test.ts` gained a describe block constructing same-pack/distinct-`section`
  choices to pin the `buildRows()` fix above. 536 -> 541 tests.
- **Known, deliberately deferred gap: `src/web/page.ts` was NOT touched this pass** (out of scope
  — a later pass owns it) and still matches sections via `c.pack === sec.pack`. `buildWizardSchema()`
  already serializes the razor step's category `sections`/`key`s correctly (verified via
  `--emit-schema`), but the web page's own matching logic doesn't read `key`/`section` yet — until
  it's updated, the `--web` razor step will not render its category headers correctly. Flag this
  before wiring the web page to the razor step's new category UI; see the package-root
  `context.md`'s matching addendum.

---

## Historical (pre-D28) notes

Real as of Milestone 6 — was a
Milestone 1 print-only shell (see root `context.md`'s Current State history). `run-install-
wizard.ts` now orchestrates the real 9 steps (Milestone 7 added step 5 "select skills", D19, and
renumbered the previously-8-step flow — the FINAL step, Extras, is now step 9, not step 8);
`steps/*.ts` implement each one, kept pure/testable wherever the step has no inherent need to
prompt, with prompting itself pushed behind a thin, injectable interface (`prompts.ts`) rather
than calling `@inquirer/prompts` directly. **Milestone 9 (decisions.md D21): step 5 gained the
skill-dependency lock/release UX** — see the dedicated Milestone 9 note below, after the
Milestone 7 note. **Milestone 10 (decisions.md D22): steps 2-3 became MULTI-select** — see the
dedicated Milestone 10 note below, after the Milestone 9 note. **Post-M8 (decisions.md D24): step
4 (`select-adapters.ts`) now offers a FOURTH adapter, `agent`** — the generic root `AGENTS.md`
surface — alongside claude/cursor/copilot, with a `description` on its choice explaining which
tools it covers (Codex/Antigravity-`agy`/Zed/Windsurf, secondarily Copilot); it joins
`AVAILABLE_ADAPTERS` and `defaultSelected` exactly like cursor/copilot did in M7 (it renders now,
not a "coming soon" placeholder).

**Milestone 10 (spec §7.1 steps 2-3, decisions.md D22): multi-type target selection.** The
repo-type step is now a CHECKBOX (was a single-select `select()`) — `selectRepoTypes()` in
`steps/select-repo-type.ts` — so a repo spanning multiple type domains (a Shopify Liquid theme
with a Vite/React asset frontend, D22's motivating example) can have BOTH types confirmed in one
step, producing `repoTypes: RepoType[]` instead of a single `RepoType`. Every detected candidate
(not just the top guess) is PRE-CHECKED by default — the "single-detected-type fast path" a
pre-D22 install still gets is simply the one-candidate case of the same mechanism, not a separate
code path. An explicit `--type` preset short-circuits WITHOUT prompting exactly as before,
generalized to accept a comma-separated list (`parseRepoTypesList()`, shared with the
non-interactive CLI's own `--type` parsing — see `src/core/CONTEXT.md`). Detection itself is now
the D22 workspace-walking aggregate (`core/detect-repo-type.ts`'s `detectRepoTypeAcrossWorkspace()`)
for the single-project branch — root signals AND every workspace sub-package's signals, ranked and
deduped by type — which is also what makes the D22 refinement's "root-is-a-project monorepo" case
work: `run-install-wizard.ts`'s step 1 now OVERRIDES an auto-detected monorepo signal (never an
explicit `--monorepo`/`--target`) when the root directory ALSO matches a repo-type signal of its
own, routing to the single-project multi-type branch instead of per-workspace target discovery —
see the dedicated Key Concepts bullet below for the exact decidability rule.

**Milestone 7 (this pass, spec §7.1 step 5, decisions.md D19): step 5, "Select skills".** Inserted
BETWEEN step 4 (select adapters) and step 6 (preview, was step 5 before this insertion) — a
navigable checkbox toggle list of every skill the resolved pack(s) provide, tagged with its tier
+ source pack in the label. Required entries are `checked: true` + `disabled: "..."` (the
standard `@inquirer/prompts` "locked on" combination — the user cannot uncheck them); default
entries start checked (togglable off); optional entries start unchecked (togglable on).
`steps/select-skills.ts` is a thin `WizardPrompts` wrapper (same split every other step follows,
plus one UX shortcut: when EVERY resolved skill is required — true of every bundled pack as of
this pass, spec §5.10 — the prompt is skipped entirely rather than showing an all-locked
checkbox); the actual tier/pack resolution logic (`resolveSkillSelection()`) lives in
`../core/skill-selection.ts`, NOT under `wizard/` — same one-directional-dependency reasoning as
`run-extras.ts` below, since `commands/install.ts`'s non-interactive `--exclude-skills`/
`--include-skills` path uses the identical resolver. Step 6's preview
(`steps/preview-plan.ts`) now takes the resulting deltas so the file list it shows already
reflects the user's selection. **Also this pass:** `steps/select-adapters.ts`'s offered-adapters
list widened from `["claude"]` to `["claude", "cursor", "copilot"]` — all three now have real
renderers (`src/adapters/cursor/`, `src/adapters/copilot/`), so nothing is disabled ("coming
soon") any longer.

**Milestone 7 (spec §7.10, decisions.md D17): step 9 (renumbered from step 8), "Optional
Extras".** The wizard's FINAL step — runs ONLY after step 8's write already succeeded, never on a
cancelled/failed install. First (only) entry: claude-mem, third-party personal tooling Nockta
suggests but does not own. `steps/extras.ts` is a thin `WizardPrompts` wrapper (same split every
other step follows); the actual detection/disclosure/execution logic lives in
`../core/run-extras.ts`, NOT under `wizard/` — deliberately, because it is also the exact logic
the non-interactive `--with-claude-mem` flag path uses (`commands/install.ts`), and
`commands/install.ts` must never import from `wizard/*` (see this doc's own "one-directional
dependency" note below, now also enforced by `core/run-extras.ts` being the shared neutral layer
both sides depend on instead). Key rules (D17, all enforced in `core/run-extras.ts`):
- Confirm prompt defaults to **No**; already-installed detection (`isClaudeMemAlreadyInstalled()`
  — `~/.claude/settings.json`'s `enabledPlugins` has a `"claude-mem@"`-prefixed key, OR
  `~/.claude/plugins/marketplaces/thedotmack` exists; any read/parse error -> "not installed")
  skips the prompt entirely — no `WizardPrompts.confirm` call at all in that case.
- Execution spawns `npx claude-mem install` with INHERITED stdio (a real, intentional exception
  to `--json`'s "single stdout line" contract when extras actually runs — same documented
  tension as this file's own "`--json` + wizard" boundary note below).
  `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN` swaps this for `node <path> install` in tests (mirrors
  `create-nockta-repo`'s `CREATE_NOCKTA_REPO_TEST_INJECT_BIN` convention) — never live `npx` in
  tests. Best-effort: a spawn error or nonzero exit -> `succeeded: false`, folded into
  `InstallData.warnings`, and **never** changes the install's own `ok`/`exitCode`.
- This is the SOLE, explicitly bounded exception to spec §14's safety rules (§14's own closing
  line + §7.10's closing line, both citing D17) — machine-scoped, opt-in, best-effort, and NEVER
  written to `.nockta` metadata; `doctor`/`repair`/`upgrade`/`sync` never look at any of it.
- The non-interactive `--with-claude-mem` flag (root command only, spec §7.10) is a completely
  separate trigger living in `commands/install.ts` — the wizard never sets or needs it; its own
  interactive step 9 IS the wizard's extras mechanism. See `src/CONTEXT.md`'s commander
  duplicate-flag note for why `--with-claude-mem` is declared only once, root-only, same reasoning
  as `--type`/`--target`/`--adapters`/`--yes`.

**Milestone 9 (spec §7.1 step 5, decisions.md D21): skill-dependency lock/release.** Enabling a
skill that `requires` others now auto-enables AND LOCKS them (checked+disabled, the SAME
combination step 5 already used for required-tier rows, now labeled `🔒 required by
<dependent>`); releasing the last dependent that needed a lock un-locks it. The real mechanics:
- **Why an iterative reprompt loop, not live per-keystroke locking.** `@inquirer/prompts`'
  `checkbox()` is one synchronous call with no hook to re-render `disabled`/`checked` state WHILE
  the user is still interacting — there is no live-locking primitive to reuse. `selectSkills()`
  instead reuses `core/skill-selection.ts`'s `resolveSkillSelection()` (the exact same closure
  engine the non-interactive `--include-skills`/`--exclude-skills` path uses — one validator, not
  a wizard-local reimplementation) as a FIXED-POINT loop: show the checkbox, derive
  `excluded`/`included` from what the user left checked, resolve it, and if the resolved effective
  set differs from what was just submitted (a dependency the user hadn't seen locked yet got
  pulled in), show the checkbox AGAIN with the new locks and ask once more. Converges in ONE round
  when a dependent's `requires` are already default-tier, already-checked skills the user never
  touched (the common case); a SECOND round only when enabling a dependent pulls in an
  optional-tier dependency the user hadn't separately checked (the `grill-me` -> `grilling`
  example, decisions.md D21's own "dangling dependency" case) or when a dependent's lock releases.
  Capped at 8 rounds as a defensive, never-expected-to-fire fallback — see `select-skills.ts`'s own
  doc comment for the full reasoning, including why a cycle can never actually reach this loop.
- **`resolveSkillSelection()`'s `blockedExclusions` is corrected in place, never surfaced as a
  hard error to the user.** If, in one round, the user checks a dependent while ALSO unchecking a
  default-tier dependency it still needs (a contradictory answer a live-updating UI would never
  have permitted), the wizard just re-locks that row and resolves again — exactly what the UI
  WOULD have prevented, rather than a confusing CLI-style error message mid-wizard.
- **Adapter-ineligible skills are OMITTED from the choice list, not shown disabled** (documented
  choice — the brief allowed either; required-tier skills are NEVER filtered this way — the
  pre-existing D8 per-adapter render-time skip still applies to them unchanged). A defensive
  `isOfferable()` check also omits a dependent whose OWN dependency chain is adapter-ineligible
  (brief item 5: "can't happen for our data — every real dependency is portable prose — but handle
  defensively").
- **`run-install-wizard.ts`'s `runSelectSkillsStep()`** gained one new parameter, `adapters:
  AdapterType[]` — both call sites (single-project and monorepo branches) already compute
  `adapters` from step 4 BEFORE calling step 5, so this is pure threading of an already-available
  value, same pattern as `core/skill-selection.ts`'s own callers (see `src/core/CONTEXT.md`).

## Dependencies

- `../commands/install.ts` — step 8 ("write metadata and adapter outputs") is NOT reimplemented
  here; `runWizardFlow()` delegates to the exact same `buildInstallResult()` the non-interactive
  `install`/`install --target` path already uses, and `runInstallWizard()`'s final human-mode
  output reuses `formatInstallHuman()`. This is a one-directional dependency —
  `commands/install.ts` does NOT import anything from `wizard/` (see `commands/install-entry.ts`
  for how the two are wired together without a cycle).
- `../core/detect-repo-type.ts` (M6, new; M10 gained `detectRepoTypeAcrossWorkspace()`) —
  single-project heuristic detection, wizard-only consumer of the per-directory `detectRepoType()`;
  `run-install-wizard.ts`'s single-project branch now calls the M10 workspace-walking aggregate
  instead.
- `../core/workspace-globs.ts` (M10, new) — `select-targets.ts`'s workspace-glob reading/expansion,
  EXTRACTED here so `detect-repo-type.ts`'s `detectRepoTypeAcrossWorkspace()` (`core/`, not
  `wizard/`) can share it without a `core/` -> `wizard/` dependency — see `src/core/CONTEXT.md`.
- `../core/detect-monorepo.ts`, `../core/parse-targets.ts` — reused verbatim (M5; `parse-
  targets.ts`'s `ParsedTarget.type` became `.types: RepoType[]` in M10, D22) — same as
  `commands/install.ts` already does for the non-interactive monorepo path.
- `../core/render-plan.ts`, `../packs/resolve-packs.ts` — reused verbatim (M4/M3) by
  `steps/preview-plan.ts` for step 6's "what will be generated" preview, via the exact same
  scratch-dir-render trick `doctor`/`repair`/`upgrade` already rely on (see
  `src/core/CONTEXT.md`) — nothing is written to the real repo before the user confirms.
- `@inquirer/prompts` — `prompts.ts`'s `defaultWizardPrompts`, lazily imported (same convention as
  `core/sync-orchestrator.ts`'s `defaultConfirm()`, its only other real caller). Never imported
  directly by any `steps/*.ts` file — they only see the `WizardPrompts` interface.
- `../types/repo-type.ts`, `../types/adapter.ts`, `../types/json-result.ts` — same shared
  vocabulary every other command uses.
- `../core/run-extras.ts` (Milestone 7, new) — `steps/extras.ts`'s ONLY dependency for detection/
  disclosure text/execution; see the Milestone 7 note above for why this lives under `core/` and
  not `wizard/`.
- `../core/skill-selection.ts`, `../packs/skill-catalog.ts` (Milestone 7, new) — `steps/select-
  skills.ts`'s dependencies for tier/pack labeling; `run-install-wizard.ts` itself calls
  `resolvePacks()` + `buildSkillCatalog()` directly (mirrors how `steps/preview-plan.ts` already
  calls `resolvePacks()`/`computeRenderPlan()`) to build the catalog step 5 needs, rather than
  pushing filesystem I/O into the thin step-5 wrapper.

## Dependents

- `src/commands/install-entry.ts` (M6, new) — the ONLY caller of `runInstallWizard()`. Decides
  whether to call it at all (TTY + insufficient flags) vs. the existing non-interactive
  `runInstallCommand()` path — see that file's own doc comment for the exact routing rule (spec
  §6, brief item 3) and `src/CONTEXT.md`'s Key Concepts for why root/`install` share one flag
  declaration.
- `src/cli.ts` — both the root program's bare action AND the `install` subcommand's action call
  the SAME `runInstallEntry()` (via `install-entry.ts`), which is what guarantees root-short-form/
  `install`-subcommand parity (spec §7.2, brief item 4) — see `src/CONTEXT.md`'s cli.ts note on
  why install's flags are declared ONCE, on the root command only.
- `test/wizard-steps.test.ts` — pure planning functions + `discoverWorkspaceCandidates()`, no
  prompts, no TTY.
- `test/wizard-flow.test.ts` — full `runWizardFlow()` runs with an injected, scripted
  `WizardPrompts` fake (canned answers in a fixed order) against real `mkdtemp` target dirs and
  the real bundled `packs/` — this is how the interactive flow is verified WITHOUT a real TTY
  (see "Known boundary" below).
- `test/install-entry-process.test.ts` — process-level, spawns the BUILT `dist/cli.js` with closed
  stdin (non-TTY by construction) to prove the wizard is never even reachable, let alone hung on,
  from a non-interactive process; also covers root-short-form/`install`-subcommand parity.
- `test/wizard-steps.test.ts` gained a Milestone 7 describe block for `steps/select-skills.ts`:
  `planSkillSelectionStep()`'s tier/pack labeling + locked-required shape, `selectSkills()`'s
  preset short-circuit (either flag present, including an explicitly empty array), the
  "nothing togglable" auto-skip, and a real injected-checkbox toggle-flow test (uncheck a
  default, check an optional). `test/wizard-flow.test.ts` gained a dedicated describe block
  using a SYNTHETIC `packsRoot` fixture (required+default+optional tiers — the real bundled
  `packs/common` has none of the latter two, all 3 skills are required) proving the full step-5
  flow round-trips into the written profile's `skillSelection` field, plus a preset-short-
  circuit case. `test/skill-selection.test.ts` (new) unit-tests `core/skill-selection.ts`'s
  `resolveSkillSelection()` directly (pure, no wizard/prompts involved) — the
  include/exclude/required-guard/unknown-name matrix. `test/skill-selection-e2e.test.ts` (new)
  and `test/multi-adapter-e2e.test.ts` (new) cover the non-interactive `--exclude-skills`/
  `--include-skills` path, doctor/upgrade merge-policy simulation, and cross-adapter (claude+
  cursor+copilot) install — see `src/core/CONTEXT.md` for the merge-policy write-up these tests
  exercise.
- `test/run-extras.test.ts` (Milestone 7, new) — unit-tests `core/run-extras.ts` directly:
  detection (present/absent/error, always against a fixture `homeDir`, never the real
  `os.homedir()`), command construction, and spawn/execution against local fixture scripts (never
  real `npx`). `test/wizard-steps.test.ts` gained a step-8 describe block (thin `WizardPrompts`
  wrapper behavior). `test/wizard-flow.test.ts` gained a dedicated step-8 describe block
  (declined/accepted/already-installed/cancelled-never-reaches-extras) AND had every PRE-EXISTING
  test transparently repointed at a shared "already installed" fixture `homeDir` (via a
  file-local wrapper shadowing the real `runWizardFlow` import) so step 9 silently no-ops for them
  without needing a new scripted answer in each one. `test/install-e2e.test.ts` gained
  `--with-claude-mem` non-interactive wiring coverage. `test/extras-process.test.ts` (Milestone 7,
  new) — process-level, built `dist/cli.js`, `--with-claude-mem` end to end; uses
  `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME` (an env-var twin of the `homeDir` parameter, since a
  spawned child process has no TS-level parameter to receive) to keep detection off the real
  `~/.claude` even at the process level.
- `test/detect-repo-type.test.ts` — `core/detect-repo-type.ts`'s heuristics in isolation (not
  wizard-specific, but its only consumer is this directory); gained a M10 (D22) describe block for
  `detectRepoTypeAcrossWorkspace()`, including a Grace-shaped fixture (root Shopify theme +
  `packages/*` workspace, one real vite-react-ts sub-package, one vite-only-no-react sub-package).
- **M10 additions:** `test/wizard-steps.test.ts`'s `select-repo-type.ts` describe block rewritten
  for the checkbox API (`planRepoTypeStep`'s `preChecked`/`checked` shape, `selectRepoTypes()`'s
  single- and multi-type comma-preset short-circuits, partially-invalid-preset fallthrough,
  multi-candidate pre-checked case). `test/wizard-flow.test.ts` gained a dedicated D22 describe
  block: single-project multi-select checkbox with two chosen types, a comma-form preset
  short-circuit, and the "root-is-a-project monorepo" override end to end (a Shopify-theme-shaped
  fixture with a `workspaces` field routes to a single multi-type install, not per-workspace
  targets — asserted via `result.data.isMonorepo === false`, both types in `repoTypes`, no
  per-workspace `.claude/`, and the override narration line). Every PRE-EXISTING scripted `select`
  answer for the repo-type step across both test files was mechanically converted to `checkbox`
  (the only prompt kind this step ever used `select` for) — no other step's scripting changed.
- **Milestone 9 additions:** `test/wizard-steps.test.ts` gained a dedicated D21 describe block
  (adapter-ineligible-skill omission from `planSkillSelectionStep()`'s choices, a dependent whose
  own dependency is ineligible being itself unofferable, one-round convergence when deps are
  already default-tier, two-round lock/release for `grill-me` -> `grilling`, diamond-dependency
  release-when-unshared) — extended `makeFakePrompts()`'s `checkbox` answer shape to optionally
  accept a QUEUE (`string[][]`, one array dequeued per `checkbox()` call) alongside its pre-existing
  constant-array form, since `selectSkills()` can now call `checkbox()` more than once per
  invocation. `test/wizard-flow.test.ts` gained one full `runWizardFlow()` round-trip (fixture
  packsRoot, `grill-me`/`grilling`) proving the real step-4-to-step-5 `adapters` wiring end to end,
  not just the step-level unit — using the file's PRE-EXISTING `scriptedPrompts()` helper
  unmodified (it already dequeues sequential `checkbox` answers per call, one per script entry, so
  no new test infrastructure was needed there).

## Directory Layout

```
src/wizard/
  run-install-wizard.ts   runWizardFlow() (pure-ish: awaits injected prompts, no process.stdout/
                           process.exit) + runInstallWizard() (the impure wrapper — prints
                           narration/preview + the final InstallResult, then process.exit).
  prompts.ts               WizardPrompts interface (confirm/select/checkbox/input) +
                            defaultWizardPrompts (real @inquirer/prompts, lazily imported).
  steps/
    detect-repo.ts          step 1 — wraps core/detect-monorepo.ts. No prompt (auto-detect).
    select-targets.ts        steps 2-3, monorepo branch — discoverWorkspaceCandidates(): M10
                             (D22) delegates its glob reading/expansion to the extracted
                             ../../core/workspace-globs.ts (`listWorkspacePackagePaths()`,
                             byte-for-byte the same logic this file used to own locally), then
                             runs core/detect-repo-type.ts per candidate — UNCHANGED behavior,
                             just de-duplicated against detectRepoTypeAcrossWorkspace()'s own
                             needs. Deliberately shallow (single-star, single-segment globs
                             only) — same "prefill, not a general solution" spirit as
                             monorepo-doctor-checks.ts's shallow plausibility check
                             (src/core/CONTEXT.md).
    select-repo-type.ts      steps 2-3, single-project branch (+ reused per-target in the
                             monorepo branch) — M10 (D22): planRepoTypeStep() (pure, now returns
                             `preChecked: RepoType[]` instead of a single `defaultType`, and
                             every choice carries a `checked` flag) + selectRepoTypes() (thin
                             prompt wrapper, RENAMED from selectRepoType() — now calls
                             `prompts.checkbox()`, not `prompts.select()`, and returns
                             `RepoType[]`). An explicit preset --type (comma-separated for
                             multiple types, via `parseRepoTypesList()`) short-circuits WITHOUT
                             even calling core/detect-repo-type.ts — the concrete mechanism
                             behind "detection never overrides an explicit --type" (brief item 1,
                             generalized to N types by D22). Every guessed candidate is
                             pre-checked (`checked: true` on its choice) — the single-guess case
                             is simply the one-item version of the same mechanism, not a distinct
                             "fast path" code branch.
    select-adapters.ts       step 4 — planAdapterStep() (pure) + selectAdapters(). As of D24
                             (post-M8), ALL FOUR adapters (claude/cursor/copilot/agent) are
                             offered — every one now has a real renderer (src/adapters/*).
                             AVAILABLE_ADAPTERS is still kept in sync BY HAND with
                             core/render-adapters.ts's actual dispatch, not derived from it
                             automatically (same convention, still an empty "coming soon" set).
                             `agent`'s choice carries a `description` (ADAPTER_DESCRIPTIONS map) —
                             the only adapter that needs one, since its bare value doesn't
                             self-explain which tools it covers the way claude/cursor/copilot do.
    select-skills.ts          step 5 (Milestone 7, new, spec §7.1/decisions.md D19; EXTENDED
                             Milestone 9, decisions.md D21) — planSkillSelectionStep() (pure) +
                             selectSkills(). Checkbox toggle list tagged with tier + source pack;
                             required entries locked (checked+disabled); a preset
                             (--exclude-skills/--include-skills, or an explicitly empty array)
                             short-circuits without prompting; when NOTHING OFFERABLE is togglable
                             (every offerable skill required) the prompt is skipped entirely. M9:
                             both functions gained a mandatory `adapters: AdapterType[]` parameter
                             (the wizard always knows this by step 5 — adapters is step 4) —
                             adapter-ineligible default/optional skills are OMITTED from the
                             choice list (a defensive `isOfferable()` check also omits a dependent
                             whose own dependency chain is ineligible); `selectSkills()` became an
                             ITERATIVE fixed-point reprompt loop for D21's lock/release UX — see
                             its own extensive doc comment (the "why an iterative loop, not live
                             locking" reasoning) and this file's own Milestone 9 note below.
                             **Post-D26 (2026-07-11):** both functions gained a mandatory
                             `repoTypes: RepoType[]` parameter — a razor-pack skill whose
                             `applicability` doesn't intersect it is OMITTED from the choice list
                             entirely (board decision d20, same "omitted not disabled" posture as
                             the adapter-ineligibility filter next to it). Every OFFERED choice's
                             `description` is now populated: the skill's `skill.json` description,
                             plus — when it declares `clashesWith` — a non-blocking
                             " ⚠ Overlaps with: ... — enable at your discretion." disclaimer
                             (`clashDisclaimer()`/`clashIdToDisplayName()`, owner's headline ask;
                             a `razor:`-prefixed clash id displays as `"<name> (razor)"`, a bare
                             id as-is). Never disables/blocks the choice — purely informational.
    preview-plan.ts          step 6 — buildPreviewPlan() (pure: resolvePacks() +
                             computeRenderPlan(), writes nothing) + formatPreviewHuman(). M7:
                             gained an optional skillSelection param so the file list reflects
                             step 5's deltas.
    confirm.ts                step 7 — confirmInstall(). A --yes preset short-circuits to true.
    extras.ts                 step 9 (Milestone 7, renumbered from step 8 by the new step 5,
                             spec §7.10/D17) — runExtrasWizardStep(), a thin WizardPrompts
                             wrapper around ../core/run-extras.ts. Run ONLY after step 8 succeeds
                             (see run-install-wizard.ts's withExtrasStep()).
```

## Key Concepts

- **Step 8 is not reimplemented — it's the SAME `buildInstallResult()` non-interactive `install`
  already uses.** Once the user confirms, `runWizardFlow()` assembles the exact same
  `InstallCliOptions` shape (`type`, or `targets: ["<path>:<type>", ...]` + `monorepo: true`,
  `adapters` joined into a comma string, `yes: true`) and calls `buildInstallResult()` directly.
  This guarantees a wizard-driven install has IDENTICAL exit codes, `InstallResult` JSON shape,
  and safety guarantees (spec §14) to the flag-driven path — there is no second write path to
  keep in sync.
- **Every step function is pure or thin-prompt-only, by design.** `planRepoTypeStep()`,
  `planAdapterStep()`, `buildPreviewPlan()`, and `discoverWorkspaceCandidates()` take plain data
  in and return plain data out — no `WizardPrompts`, no I/O beyond `discoverWorkspaceCandidates()`
  and `buildPreviewPlan()`'s own necessary filesystem reads (workspace globs; pack/skill
  resolution). The `select*()`/`confirm*()` wrapper functions are the ONLY place a `WizardPrompts`
  is touched, and they do nothing besides "check preset, else call one prompt method and return
  its answer" — this is what makes `test/wizard-steps.test.ts` possible without any prompt
  injection at all for half the suite.
- **`WizardPrompts` — an injectable interface, not a mocked library.** Mirrors
  `core/sync-orchestrator.ts`'s `confirmFn` injection point (its M4 precedent) generalized to
  `confirm`/`select`/`checkbox`/`input`. `defaultWizardPrompts` lazily imports
  `@inquirer/prompts` so importing `prompts.ts` never requires a TTY; tests supply a fake
  implementing the same 4 methods with scripted answers (`test/wizard-flow.test.ts`'s
  `scriptedPrompts()`) — this is the "injected prompt answers" mechanism the brief asked for as
  an alternative to `@inquirer/testing` (not installed in this package).
- **Presets short-circuit their step WITHOUT prompting, and (for `--type`) without even
  consulting detection.** `selectRepoTypes(prompts, guesses, preset)` returns the parsed preset
  immediately when every comma-separated name in it is a valid `RepoType` —
  `core/detect-repo-type.ts` is never even called by `runWizardFlow()` in that case
  (`presetTypesValid ? [] : workspaceDetection.guesses`). This is the literal enforcement of
  "heuristic detection never overrides an explicit --type" (brief item 1, generalized to N
  comma-separated types by D22) — not merely "detection loses a tie-break", but "detection never
  runs at all" when the answer is already known.
- **Monorepo target collection has three tiers, in order:** (1) preset `--target` values already
  given on the CLI (parsed via `core/parse-targets.ts`, colon+plus multi-type syntax supported
  since D22, used as-is — discovery is skipped entirely); (2) discovered workspace candidates
  (`select-targets.ts`), offered via a checkbox, with a per-selected-candidate `selectRepoTypes()`
  call to confirm/edit its guessed type(s) (spec §7.1's "review/edit detected targets", D22:
  now itself a checkbox too); (3) a bounded (5-attempt) manual `input()` fallback —
  space-separated `<path>:<type>[+<type>...]` — used when no workspace globs were found, OR when
  the user deselects every discovered candidate. Ending tier 3 with a blank answer, or exhausting
  the attempts, cancels the install (`InstallResult` with `ok:false`, `exitCode: 1`,
  `"no monorepo targets were selected"`) rather than proceeding with zero targets (which
  `buildInstallResult()` would reject anyway, spec §7.3).
- **D22's "root-is-a-project monorepo" override is a decidable, ONE-TIME check at step 1, not a
  fallback discovered mid-flow.** `runWizardFlow()` computes `rootIsAlsoAProject` from
  `detectRepoTypeAcrossWorkspace(targetDir).bySource.some(g => g.source === ".")` — true exactly
  when the ROOT directory itself (not a workspace sub-package) matches at least one repo-type
  signal. The override fires (routes to the single-project multi-type branch instead of the
  monorepo per-target branch) only when ALL THREE hold: an AUTO-DETECTED monorepo signal is
  present (`detection.isMonorepo`), the root itself is also a project
  (`rootIsAlsoAProject`), AND neither `--monorepo` nor any `--target` was explicitly given
  (`!explicitMonorepo`) — an explicit monorepo request always wins, matching every other
  "explicit flag beats heuristic" rule in this file. This is exactly the D22 refinement's own
  worked example (a Shopify theme at the repo root with a `packages/*` workspace) — the wizard's
  step-1 narration log names the override explicitly (`"...decisions.md D22 'root-is-a-project
  monorepo'..."`) so a human running the wizard interactively sees WHY it didn't ask for
  per-workspace targets.
- **A user-declined confirm is `exitCode: 1` (`INVALID_PROFILE_OR_TARGETS`), not a new code.**
  There is no dedicated "user cancelled" exit code in the spec §7.9 scheme; this package's own
  `sync` command maps its analogous "declined" case to `SYNC_ACTION_REQUIRED` (4) because sync's
  declining still leaves REAL WORK undone on an existing install. A wizard cancellation is
  different in kind — nothing was ever going to be written, there is no pending "action required"
  against an existing profile — so it is bucketed with "no valid install happened" instead
  (`emptyData()`, re-exported from `commands/install.ts` for exactly this reuse). Documented here
  as a considered choice, not an oversight, since the spec does not pin this case down explicitly.
- **`--json` + the wizard is a real but unusual combination — narration is suppressed, the
  underlying `@inquirer/prompts` UI is not.** Per D13 ("no other output goes to stdout" in
  `--json` mode), `runInstallWizard()`'s own narration (`options.log`) is a no-op when `json` is
  true — this package's OWN step-1/step-6 narration text never reaches stdout. It cannot also silence
  `@inquirer/prompts`' own interactive rendering, which is inherent to being on a real TTY at
  all — but that combination (`--json` AND a real TTY AND insufficient flags) is an edge case a
  human debugging on a real terminal might hit; a machine/agent consumer that wants the `--json`
  contract to hold is expected to also supply sufficient flags (spec §6's whole point), which
  routes to the non-interactive path and never reaches the wizard in the first place. The ONE
  hard guarantee — never prompting, never hanging, from a non-TTY process — is what's actually
  load-bearing (see the next bullet) and is what `test/install-entry-process.test.ts` verifies.
- **Known boundary: the real interactive TTY session itself cannot be demoed or tested
  headlessly.** `test/wizard-flow.test.ts` exercises the FULL step sequence (detection, planning,
  writing) with injected canned answers standing in for a human at a keyboard — this proves every
  step function and the overall orchestration logic are correct. It does NOT prove `@inquirer/
  prompts`' own terminal rendering works, because no CI environment or spawned-process test here
  has a real pty. `test/install-entry-process.test.ts`'s non-TTY matrix proves the wizard is
  never even REACHED without a real terminal — between the two, every code path up to and
  including "the interactive UI would now render" is covered; the UI rendering itself is not, and
  is not claimed to be.
