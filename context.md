# context.md — inject-nockta-skills

Root documentation map for this package. Index only — takeaways and pointers, not content. Read
the linked doc before acting on a takeaway.

**Layout profile:** Federated. `CONTEXT.md`/`USAGE.md` live inside each module directory next to
the code they describe.

**Decision records:** live at the workspace root, one level up:
`../decisions.md` (rolling decision log, D1–D22 as of this pass — D22 is multi-type targets [union
of skill packs, single primary scaffolder], recorded 2026-07-11, the subject of this pass;
`decisions.md` itself stays off-limits to this worker — it was already authored before this pass
began). Read it before any architecture-touching change in this package — do not re-litigate a
decision already recorded there; if a new decision contradicts one, update the record in the same
pass.

**Canonical spec (source of truth for scope/behavior, not this package's own doc):**
`../startup docs/inject-nockta-skills.updated.md`.

## Index

| Doc | Takeaway |
|---|---|
| `src/CONTEXT.md` | Source layout, module purpose/dependencies, key concepts (commander CLI, `list`/`install` real since M2/M3, `doctor`/`repair`/`upgrade`/`sync` real as of M4, monorepo support real as of M5, the wizard real as of M6, all THREE MVP adapters + D19 skill selection real as of M7, exit-code philosophy, JsonResult contract, spec §14 safety boundary, the M6 AND M7 commander parent/child-option-collision gotchas and their fix). M8: cursor filename rename noted, no orchestration change. M10: multi-type targets (D22) — `RepoType` -> `RepoType[]` at every call site, `repoType`/`repoTypes` legacy read-shim, new `workspace-globs.ts`. **D24 (post-M8, this pass): a FOURTH adapter, `agent` (generic root `AGENTS.md`), joins claude/cursor/copilot — `AdapterType` now four-valued.** Read first when touching `src/`. |
| `src/packs/CONTEXT.md` | Pack manifest/resolution system: `get-pack-path`, `read-pack-manifest`, `read-skill-manifest` (M3, gained `enablement` M7, gained `requires` M9, gained `description`/`clashesWith` D26, gained `applicability` D26 razor pass, **gained `category` this pass — was pass-through-only, now typed on `SkillManifest` and consumed by the wizard's razor step**), `list-packs`, `resolve-packs`, `skill-catalog` (M7, new — D19 tier tagging; M9: gained `supportedAdapters`/`requires` passthrough; D26 Stage 4: gained `description`/`clashesWith`/`applicability` passthrough, consumed by the wizard's clash disclaimer + razor offer filter and by `core/skill-selection.ts`'s matching non-interactive gate; **this pass: gained `category` passthrough**, consumed by `wizard/core/build-schema.ts`'s `buildRazorStep` to section by category instead of pack). Package-root resolution gotcha, D6 content gate, `packsRoot` test-injection pattern, `resolvePacks()` accepting multiple `requestedPacks` at once — this Set-based resolution is WHY M10's D22 multi-type union needed zero new merge logic (see `src/core/CONTEXT.md`'s D22 Key Concepts bullet). D25: 10 packs — `react-native`/`expo` new, `expo requires react-native`. D26 (common-import pass): `common` flips `planned` -> `installable`. D26 razor pass: 11th pack, `razor` — `resolvePacks()`'s always-included queue is `["common", "razor"]`; `razor` is installable (61 imported skills, all `enablement: "optional"`) so it resolves and renders zero files by default — nothing auto-installs. Read before touching pack/skill manifests or resolution logic. |
| `src/adapters/CONTEXT.md` | **All FOUR adapters are real as of the D24 pass (post-M8):** `claude` (M3), `cursor` + `copilot` (M7), `agent` (D24, new — generic root `AGENTS.md`, spec §8.5). Output shape per adapter, adapter-restricted-skill skip behavior, D19 selection-exclusion (checked first, in every renderer), D1 override-wins mechanism at each adapter's own output granularity, the M7 `RenderedFile.content`/`.sourceContentHash` mechanism (agent reuses it, same as copilot). M8: cursor's output filename renamed to `nockta-<pack>.mdc` (decisions.md D20). M9/M10: no changes. D24: `subagent-delegation` reclassified adapter-portable (D23) — prose now renders for cursor/copilot/agent, only its `worker.md` agent artifact stays claude-only. **D26 Stage 4 (this pass): claude's skill-dir copy went from an allowlist to a BLOCKLIST** (`skill.json`/`.DS_Store` excluded, everything else — companion docs, `scripts/`, gz-only `assets/` — ships) so heavy skills render fully self-contained; cursor/copilot/agent unaffected (they never copy skill dirs). Read before touching rendering logic or adding a new adapter. |
| `src/core/CONTEXT.md` | Install orchestration (M3) + maintenance orchestration (M4) + monorepo support (M5) + single-project repo-type detection (M6) + Extras (M6) + **D19 three-tier skill selection (M7)** + **D21 skill-level dependency closure + adapter-gated selectability (M9)** + **D22 multi-type targets + workspace-walking detection (M10)**: every `RepoType` call-site shape became `RepoType[]`; `resolve-packs.ts` needed no new merge logic (its `requestedPacks` was already Set-resolved); `detect-repo-type.ts` gained `detectRepoTypeAcrossWorkspace()` (new shared `workspace-globs.ts`); a legacy singular `repoType` on disk normalizes to `repoTypes` at the profile-guard/read-targets boundary, read-only. D24 (post-M8): `render-adapters.ts` gained a one-block `agent` dispatch case — the ONLY `src/core/` file touched that pass. D25: `detect-repo-type.ts` gained a `react-native`/`expo` heuristic block. **D26 Stage 4 (this pass): `skill-selection.ts`'s `resolveSkillSelection()` gained a second, `repoTypes`-driven eligibility axis alongside D21's adapter gating** — razor-skill applicability enforced non-interactively for `--include-skills`, threaded from every real install-time caller (`inject-skills.ts`, `inject-skills-monorepo.ts`, `build-install-plan.ts`); deliberately NOT threaded into `render-plan.ts`'s tolerant maintenance-recompute call site. `build-install-plan.ts`'s dry-run plan also gained per-skill `description`/`overlaps`. Read its dedicated D22/D24/D25/D26 Key Concepts/addendum bullets before touching multi-type resolution, detection, the legacy shim, adapter dispatch, or skill-selection gating. |
| `src/wizard/CONTEXT.md` | The interactive install wizard (M6, new): the spec §7.1 flow, 9 steps as of M7 (D19's step 5 "select skills"). M9: step 5 extended for D21 (lock/release UX). M10: steps 2-3 became MULTI-select (D22) — `selectRepoType()` -> `selectRepoTypes()` (checkbox, not select), the "root-is-a-project monorepo" override. D24 (post-M8): step 4 (`select-adapters.ts`) offers a FOURTH adapter, `agent`, with its own `description`. D26 Stage 4: step 5 (`select-skills.ts`) gained a mandatory `repoTypes` parameter — a razor skill not applicable to it is OMITTED from the choice list entirely (board decision d20); every offered choice's `description` now carries its `skill.json` description plus a non-blocking clash-overlap disclaimer when `clashesWith` is set (owner's headline ask). 2026-07-11 reconciliation pass (D30 addendum): `build-schema.ts`'s `buildRepoTypeStep()`/`buildAdapterStep()` now attach friendly `ChoiceModel.title`/`label` and a consumer-facing `description`; `SKILL_PAGE_SIZE` 10 -> 20. **This pass: the razor step (`buildRazorStep`) sections by CATEGORY, not pack** — `ChoiceModel.section`/`SectionModel.key` are new, additive grouping fields (fall back to `pack` when absent, so the general skills step is unaffected); `paginated-frame.ts`'s `buildRows()` fixed to match on the generic `section`/`key` pair instead of a hardcoded `choice.pack === section.pack` (which would have collapsed the razor step's 12 category sections back into one, since every razor skill shares one pack). Read before touching any wizard step or the prompt-injection pattern. |
| `src/web/CONTEXT.md` | **D30 (this pass): standalone `inject --web` + the `--emit-schema` composition contract — the FIRST web milestone.** A whole-form browser wizard (NOT the CLI step loop) reusing the D28 seams verbatim: `buildWizardSchema` -> serve a self-contained page (inline CSS/JS, no CDN) -> receive a plain `WizardAnswers` -> `resolve()` -> the existing `buildInstallResult()` write path. Security: 127.0.0.1-only, OS-random port, one-time crypto token (every request 403s without it). Precedence resolver (`--web` if display > CLI if TTY > `--yes` headless > clean error; `--web` outranks `--yes`, which only pre-seeds the page). `cli.ts` gains `--web`/`--cli`/`--no-open`/`--emit-schema` (root-only) + a `wizard` subcommand; `commands/install-entry.ts` routes to it. NEVER modifies `wizard/view|core` or `controller.ts` — imports their exports only. Page visual adapted from the owner's curation board; still a first draft for owner aesthetic iteration (browser visual NOT self-certified). **2026-07-11 reconciliation pass: `choice.title` is now actually populated** (repo-type/adapter rows) — the page's `choice.title ?? choice.label ?? choice.value` read was written ahead of the field, now shows friendly names + descriptions; extras/claude-mem and monorepo-target selection remain deferred, not wired into the web flow. **2026-07-13 ("phantom grilling" web-wizard fix):** the emitted schema now resolves each skill layer's `requires` dependency closure through the shared `resolveSkillLayerRound` (in `buildWizardSchema`), so a default skill that forces an optional one (`grill-me` → `grilling`) renders it LOCKED-ON (matching the CLI wizard) instead of a bare "Off" toggle the install silently pulled in; skill/razor toggles now refetch `GET /schema` with the live `excluded`/`included` deltas so the lock releases when its forcer is deselected. Same pass, residual client leak fixed: `deltasFor` no longer scrapes LOCKED rows' forced checked state as user intent (it leaked `grilling` into `included` on refetch + submit, so the released skill came back ON and still installed) — a name-keyed `userIntent` map written only by click handlers governs locked rows, and explicit toggles survive a forcer's lock/release cycle; client JS now driven headlessly via `node:vm` (`test/web-page-client.test.ts`). Display-truthfulness only — the install-side inclusion (`grill-me` intentionally forces `grilling`) and the `included:["grilling"]` profile delta are unchanged and correct. **Same day, zero-type + false-Done fix:** `POST /submit` now validates answers against the TTY cancel rules (zero repo types/targets → 400) and runs the REAL install inside the handler via the new server `onSubmit` option, responding with the actual outcome (422 + reason on a failed install, submit stays retryable; mirrors create's server, which never had the false-success path) — before, the server answered `{ok:true}` unconditionally and installed after close, so an un-installable submit showed the "Done" page while the backend rejected with "missing required --type" and wrote nothing; the page also gates Confirm (disabled + reason hint) until at least one project type/target is selected, mirroring the TTY cancel rule. Read before touching `src/web/`. |
| `README.md` | User-facing usage doc: full command reference incl. `--target` syntax (colon+plus multi-type), skill-selection flags, skill dependencies (D21), `--dry-run`, per-adapter output shapes (now FOUR: claude/cursor/copilot/agent), the wizard's 9 steps + Extras, the machine interface, content status, License and Publish-readiness sections. **D24 (this pass): `agent` adapter + root `AGENTS.md` documented alongside claude/cursor/copilot.** Multi-type targets (D22) section unchanged. Current status: post-Milestone 8 — D24 generic `agent` adapter + D23 subagent-delegation reclassification; no new commands, `AdapterType` gains `"agent"`. |
| `RELEASING.md` | Maintainer release process: tag push -> `release.yml` -> OIDC trusted publishing -> `npm publish --provenance`; first-release bootstrap (npm has no pending-publisher mechanism for an unpublished name — verified mid-2026 against npm's official docs); troubleshooting; owner-vs-Fable step split. Not in the npm `files` whitelist — doesn't ship in the tarball. |
| `../decisions.md` | Canonical decision log for both Nockta scaffolder packages. D1: hybrid adapter pipeline. D3: generated-file manifest shape. D5: root `.nockta/` owns `targets.json` + `skills-profile.json`. D6: a pack is only installable with real authored content. D7: this package owns `RepoType`/`AdapterType` semantics. D8: `skill.json` shape + adapter restriction (generalized by D21 to selection time, not just render time; refined by D23 to distinguish artifact-restriction from portable capability-gating guidance). D9: `--target <path>:<type>` canonical target syntax (extended by D22 to `<path>:<type>[+<type>...]`). D10: sync never silently rewrites non-interactively. D13: `--json` + exit codes are the public contract. D17: the wizard's Extras step is the sole, explicitly bounded exception to spec §14. D18: `install --dry-run` exists for `create-nockta-repo`'s wizard preview. D19: the three-tier skill-enablement model. D20 (M8): Cursor adapter output files renamed to `nockta-<pack>.mdc`. D21 (M9): skill-level `requires` dependencies with auto-enable + lock. D22 (M10): multi-type targets — a target/standalone root may name multiple repo types, installing the UNION of their skill packs; profile/targets schema `repoType` -> `repoTypes: string[]`. **D23 (new, this pass): capability-self-gating skills (e.g. `subagent-delegation`) are adapter-portable** — restriction applies to ARTIFACTS one adapter can host (its `worker.md`), not to portable prose guidance; corrects D8's earlier claude-only classification. **D24 (new, this pass): generic `agent` adapter** — a fourth `AdapterType` rendering one root `AGENTS.md`, covering Codex/Antigravity-`agy`/Cursor/Zed/Windsurf (+ secondarily Copilot) in one shot; agent-artifact skills never emit `agents/*.md` under it (no registration mechanism). D25: two new repo types/packs, `react-native` + `expo` (`expo requires react-native`). **D26 (already recorded pre-pass, IMPLEMENTED this pass): finalized curation + the CONTENT-IMPORT milestone** — `curation-decisions.json` is the authoritative tier map; `skill.json` gains `description`/`clashesWith`; `common` imported (18 skills, 2 dropped) and flips to `installable`; the Razor principles layer and the wizard's clash-disclaimer UX remain future work, not this pass. Consult before any design change here. |
| `../startup docs/inject-nockta-skills.updated.md` | Full product spec. §11 Package Architecture is the target file tree; §12 Pack Architecture; §8.2/§8.3/§8.4/§8.5 Claude/Cursor/Copilot/Agent adapter output shapes (§8.1 `AdapterType` now four-valued); §9 Monorepo Support; §10 profile/manifest schemas (§10.1/§9.3 now describe `repoTypes: string[]`, D22); §7.3 multi-type target syntax + `--exclude-skills`/`--include-skills`/`--dry-run`; §7.9/§13.1 machine interface + install; §14 safety rules; §5.1/§5.10 pack/skill lists + MVP content scope. |

**Milestone numbering note:** this package's docs follow the workspace convention **M6 = wizard
core (spec §7.1 steps 1–4/6–8) + its Extras step (spec §7.10, D17) bundled together** — both
landed as one continuous piece of wizard work — **M7 = cursor/copilot renderers + D19 skill
selection**, **M8 = publish preparation** (cursor filename rename per D20, package
publish-readiness, README finalization — no new commands/orchestration behavior), **M9 = D21
skill-level dependencies** (`requires` in `skill.json`, closure resolution, adapter-gated
selectability, the wizard's lock/release loop — no new commands, one new `skill.json` field), and
**M10 = this pass, D22 multi-type targets** (comma `--type`/colon+plus `--target` multi-type
parsing, union pack resolution, `repoType` -> `repoTypes` profile/targets schema + legacy
read-shim, workspace-walking detection, the wizard's multi-select type step + "root-is-a-project
monorepo" override — no new commands, no new `skill.json`/`pack.json` fields). A few
pre-existing inline comments deep inside source files authored during the Extras sub-pass
(`core/run-extras.ts`, `wizard/steps/extras.ts`, and similar) still literally say "Milestone 7" in
their own doc comments from when they were written, under the OLDER numbering M7's own pass
superseded — those were not swept for a global rename (low value, real risk of introducing drift
against decisions.md D17's own "(M7)" heading text, which is off-limits and keeps its original
wording) — this note is the canonical disambiguation; `git blame`/the file's own dated prose is
more reliable than any single "M7" string found in an old comment.

## Current state (as of this pass — 2026-07-13, test suite decoupled from the `../planned skills/` sibling)

`test/import-skill.test.ts`'s one real-content describe block (`importRazorPack` against the razor
principles layer) read its source fixture from `../planned skills/razor/...` — a sibling of this
package inside the Nockta scaffolders workspace, dev-machine-only, never part of the published npm
tree. That broke the suite (and `prepublishOnly`, and any future CI publish) anywhere that sibling
doesn't exist — surfaced by a batch verifier's ENOENT. Fix, owner-ruled: the describe block now
derives its categorized source fixture (and a matching `curation-decisions.json`/`clash-map.json`)
FROM this package's OWN bundled `packs/razor/skills/` (already-imported output, shipped in `files`,
identical content) instead, and round-trips every real skill's `skill.json` through
`importRazorPack()` — asserting byte-identical output (real-content transformation parity, no
sibling dependency). Per-skill clutter-stripping (`PROVENANCE.md`/`research/`/etc — absent from
`packs/razor` since it's already-stripped output) and the license-bearing-file guard matrix stay
covered by the pre-existing synthetic-fixture tests earlier in the same file (unchanged, still
exercise the full blocklist against a fake skill dir with `PROVENANCE.md`, `research/`, `LICENSE`,
`dist/`, etc.) — coverage is equal, not weakened. `grep -rn "planned skills" test/` now only matches
this describe block's own prose explaining what it no longer depends on — no functional path
resolution into the sibling remains. Verified: full suite green from the package dir (43 files /
579 tests, +1 net over the pre-fix 578 — two new assertions replacing one removed), AND green when
run from a scratch copy of the package with no `planned skills/` sibling present at all (the point
of the fix). No other file references the sibling from inside the test suite.

## Current state (as of the previous pass — 2026-07-11, razor step CATEGORY sections — the wizard's razor step groups by principle category, not pack)

The wizard's razor step (spec §7.1's dedicated razor step, D28) was a single flat section
(`buildRazorStep` grouped by `pack`, and every razor skill shares the ONE `razor` pack — so the
grouping collapsed to one section, "razor," regardless of the 61 skills' real per-skill
`category` field already sitting on disk/in the catalog since the D26 razor-import pass). This
pass threads that `category` the rest of the way through to the wizard's Model and BOTH Views
(CLI + `--emit-schema`), so the razor step now renders 12 fixed, ordered category sections
instead of one lump. `src/web/*` deliberately untouched (its pack-keyed section-matching logic —
`page.ts`'s `c.pack === sec.pack` — is a follow-up pass; the schema it consumes already carries
the category data, see below).

**Schema (`src/types/pack.ts`):** `SkillManifest` gains `category?: string` — previously
razor-only presentational metadata deliberately kept OUT of the typed manifest (see the D26 razor
pass addendum below, now superseded on this point). `read-skill-manifest.ts` parses/validates it
(shape-only: non-empty string when present) and carries it through; `skill-catalog.ts`'s
`SkillCatalogEntry` gained the matching `category?: string` passthrough field. No re-import
needed — every razor `skill.json` already had `category` on disk from the D26 import; only the
reader was ignoring it.

**Wizard core (`src/wizard/core/`):**
- `types.ts` — `ChoiceModel` gained `section?: string` and `SectionModel` gained `key?: string`,
  BOTH additive and optional. `section`/`key` are the actual grouping-match pair a presenter uses
  (falling back to `pack` when absent, so the general skills step — never sets either — renders
  byte-identical to before). `pack` on both types is now documented as staying the entry's REAL
  pack always, never repurposed as a grouping key — `section`/`key` exist precisely so a step CAN
  section by something other than pack without lying about which pack a skill ships from.
- `build-schema.ts`'s `buildRazorStep` now groups by `razorCategoryKey(entry)` (the skill's
  `category`, or `"other"` if absent/unrecognized — never crashes) instead of `entry.pack`, via a
  new optional 4th parameter on `buildSkillChoiceModels` (`grouping: { sectionKeyOf, sectionOrder
  }`, defaulted to the old pack-based behavior so `buildSkillsStep`'s call site — 3 args, unchanged
  — is byte-identical). Sections come from the new `buildRazorSections()`, in the FIXED brief order
  (principles first, then `Domain: *`): Core, Architecture, Security, Testing, Delivery, Data,
  Realtime, Tooling, Domain: React, Domain: Next.js, Domain: NestJS, Domain: Shopify, with a
  trailing "Other" only if some entry actually needs it. A category absent from the offerable set
  (already applicability-filtered — unchanged logic) is simply omitted, never shown empty.
  `buildSkillSections`/`buildSkillsStep`/the general pack-grouping logic are completely unchanged.

**CLI View fix (`src/wizard/view/paginated-frame.ts`):** `buildRows()` previously matched
`choice.pack === section.pack` — a hardcoded one-section-per-pack assumption that would have
silently collapsed the razor step's new category sections back into a single lumped bucket (every
razor choice's `pack` is `"razor"`, same as every section's `pack` would have needed to be). Fixed
to match on `(choice.section ?? choice.pack) === (section.key ?? section.pack)` — the general
step (never sets `section`/`key`) falls through to the exact same `pack`-vs-`pack` comparison as
before; the razor step's category sections now group correctly. This was the one real bug this
pass found and fixed, not just plumbing.

**`src/web/*` — explicitly NOT touched this pass.** `buildWizardSchema()`'s razor step already
serializes the new `sections` (with `key`+`label`) and `choices` (with `section`) — verified via
`--emit-schema --type next`, round-trips through JSON. `src/web/page.ts`'s own section-matching
(`c.pack === sec.pack`) was NOT updated to read `key`/`section` — a follow-up pass's job. Until
then, the web page's razor step will not render its new category headers correctly (each would
match zero or all choices, since every razor choice's real `pack` is uniformly `"razor"` while the
new sections' `pack` is also left `"razor"` for honesty — see `buildRazorSections`'s doc comment);
this is a known, deliberately deferred gap, not an oversight — flag it before wiring `--web` to
the razor step's category UI.

Tests: 536 -> 541 (5 new — `wizard-core.test.ts` gained a describe block proving `--type next`
sections in the fixed order with Data/Realtime/Domain:NestJS/Domain:Shopify omitted (razor's
"data"/"realtime" categories' applicability is nest/shopify-only, not just the domain categories
naming those types), `--type nest` proving the converse, and a `buildRows()` proof that the CLI
row-builder actually groups by category, not one pack bucket; `wizard-view.test.ts` gained a
describe block constructing choices that share ONE pack but distinct `section` values, proving
`buildRows()` does not collapse them). Full suite green, `tsc --noEmit` clean.

## Current state (as of the previous pass — 2026-07-11, D26 Stage 4 — renderer completeness + the wizard mechanism)

Two independent deliverables, both decisions.md D26: **Part A, renderer completeness** — the
claude renderer's skill-dir copy changed from a narrow ALLOWLIST to a BLOCKLIST
(`src/adapters/claude/render.ts`'s `collectSkillDirFiles()`, replacing
`collectAllowlistedSkillFiles()`): every file under a skill's bundled directory ships EXCEPT
`skill.json` (Nockta-internal) and `.DS_Store` (OS clutter), so companion docs, `scripts/`, and
gz-only `assets/` type trees all land in the target — a heavy skill (e.g.
`shopify-polaris-admin-extensions`) is now fully self-contained at
`<targetDir>/.claude/skills/<skill>/`: proven by installing it into a scratch target, `npm
install`-ing its own shipped `package.json` there, and running `validate.mjs` from that location
alone (real TypeScript validation, pass/fail both observed). cursor/copilot/agent renderers are
unaffected (they never copy skill directories, only concatenate prose). **Part B, the Stage 4
wizard mechanism** the previous pass explicitly deferred (see the entry directly below — "What
this pass deliberately does NOT do"): `wizard/steps/select-skills.ts`'s choices now carry a
`description` (verbatim `skill.json` description) plus, for any skill with a non-empty
`clashesWith`, a non-blocking " ⚠ Overlaps with: ... — enable at your discretion." disclaimer
(owner's headline ask); a razor-pack skill whose `applicability` doesn't intersect the current
project's repo type(s) is OMITTED from the wizard entirely (board decision d20); `core/
skill-selection.ts`'s `resolveSkillSelection()` gained the matching non-interactive
`repoTypes`-gated `--include-skills` validation (a second eligibility axis alongside D21's
existing adapter gating). `core/build-install-plan.ts`'s dry-run plan bonus: each skill entry now
also carries `description`/an `overlaps` count. `src/packs/skill-catalog.ts`'s
`SkillCatalogEntry` is the plumbing — `description`/`clashesWith`/`applicability` threaded
verbatim from `read-skill-manifest.ts` (unchanged this pass) through to both the wizard and the
resolver. **`list --details` was NOT extended with per-skill description/overlaps** (deviation,
noted as low-priority "bonus, if low-cost" in the brief — `list.ts` has no skill.json-reading
machinery today; the dry-run plan already covers the same bonus ask at lower cost, reusing
`skill-catalog.ts`'s already-parsed data instead of adding a new read path).

Tests: 454 -> 465 (11 new: 1 claude-render blocklist-mechanics fixture case; 2 install-e2e
real-bundled-packs completeness cases — companion skill (`codebase-design`) + heavy skill
(`shopify-polaris-admin-extensions`, including a doctor-tracks-the-extras check); 3 install-e2e
real-bundled-`packs/razor` non-interactive applicability-validation cases (nest-only-for-`next`
rejected, nest-only-for-`nest` accepted, universal-for-any-type accepted); 3 wizard-steps
synthetic-catalog description/clash-disclaimer cases; 2 wizard-steps real-bundled-`packs/razor`
offer-filter cases, both directions — `nest` install offers nest+universal razor skills and omits
next-only ones, and vice versa). `npm run typecheck`/`npm run build` both clean. See
`src/adapters/CONTEXT.md`, `src/core/CONTEXT.md`, `src/wizard/CONTEXT.md`, and
`src/packs/CONTEXT.md`'s own new "Current state addendum" sections for the per-module detail.

## Current state (as of the previous pass — 2026-07-11, D26 razor pass — the razor principles layer imported as an always-available optional pack)

Imports the razor principles layer (61 skills, `planned skills/razor/packs/razor-principles/skills/<category>/<name>/`)
into a new 11th pack, `packs/razor/`, per `curation-decisions.json`'s `razor` object + `clash-map.json`
(decisions.md D26). Builds on the D26 curation-aware importer from the previous pass
(`importPackByCuration()`), adding a parallel batch-import path shaped for the razor layer's
different source geometry and field set.

**Schema (`src/types/pack.ts`):** `SkillManifest` gains `applicability?: RepoType[]` — the repo
types a skill is offered for; absent means "all repo types" (every pre-razor skill needs zero
migration). `read-skill-manifest.ts` parses + validates it (each entry must be a real `RepoType`).
`category` (razor's per-skill source-category metadata: core/architecture/security/testing/
delivery/tooling/data/realtime/nestjs/nextjs/shopify/react) is deliberately NOT part of the typed
`SkillManifest` — it is razor-only presentational metadata for a future wizard grouping UI, not
something the resolver/selection engine reads today, so it stays a plain pass-through JSON field
written by the importer rather than widening the core type.

**Resolver (`resolve-packs.ts`):** the always-included queue is now `["common", "razor"]`, not
just `["common"]` — `razor` resolves for EVERY project regardless of requested repo type, exactly
like `common`. Safe because every razor skill imports at `enablement: "optional"` (D19) — being
always-*resolved* only makes the 61 skills selectable (`--include-skills`, later the wizard);
nothing in the pack auto-installs. `doctor`/`list`/`sync` treat `razor` as a normal pack — no
special-casing needed beyond the resolver change, since everything downstream (`buildSkillCatalog`,
`buildListResult`, `evaluatePackContent`) already operates on whatever `resolvePacks()` hands back.

**Importer (`scripts/import-skill.ts`):** new `importRazorPack()`, parallel to
`importPackByCuration()` — NOT a parametrization of it, because the razor layer's shape differs in
three structural ways: (1) source is CATEGORIZED (`skills/<category>/<name>/`), destination is
FLAT (`skills/<name>/`, category demoted to `skill.json` metadata); (2) every entry carries
`applicability` (no other pack's curation entries do); (3) uniformly `enablement: "optional"` with
no tier variance and no `requiredBy` chains (razor skills don't depend on each other). Reuses
`importSkill()`'s D8 stripping/idempotent-rebuild core (unchanged) via two new pass-through options,
`applicability` and `category`. `clashesWith` is looked up by the `razor:<name>` id in
`clash-map.json` and written out bare (external ids as-is) — verified bidirectionally consistent
against a sample pair (`razor:state-has-an-owner` <-> `react-best-practices`,
`razor:modules-follow-authority` <-> `nestjs-best-practices`/`nestjs-expert`) since both sides are
sourced from the same `clash-map.json`. CLI: `import-skill --curate razor` /
`pnpm import-razor-skills`.

**What this pass deliberately does NOT do (Stage 4, per decisions.md D26's own text):** the
wizard-time applicability FILTER (only offer a razor skill for a repo type it applies to) and
`--include-skills` applicability validation. Right now `applicability` is data-only — parsed,
persisted, provable — but nothing reads it to narrow what's offered; a non-applicable
`--include-skills` name still succeeds (e.g. `nest`'s catalog technically accepts
`state-has-an-owner` even though its `applicability` excludes `nest`). Do not assume the filter
exists when reasoning about wizard behavior until Stage 4 lands.

Tests: 433 -> 454 (21 new — `applicability` parsing in `read-skill-manifest.test.ts`, razor
always-resolved + real-bundled-pack installability in `resolve-packs.test.ts`, `importRazorPack()`
shape/stripping/real-source coverage in `import-skill.test.ts`). Every pre-existing e2e/wizard test
asserting an exact `installedPacks`/pack-name list against the REAL bundled `packs/` needed a
`"razor"` entry added (it's now always-resolved+installable there); every synthetic-`packsRoot`
fixture feeding `buildInstallResult`/`runWizardFlow` needed a declared-only (no `SKILL.md`) `razor`
pack.json added, matching the pre-existing "`next`: declared, no content, stays planned" convention
already used for the same reason — otherwise the fixture pack tree reports `razor` as **missing**
(no directory at all) and trips `install.ts`'s hard "requested pack(s) not found on disk" error,
distinct from the harmless **planned** status a declared-but-content-less pack gets.

## Current state (as of the previous pass — 2026-07-11, D26 — curation-aware importer + `common` content-import proving stage)

Makes the pack importer curation-aware (decisions.md D26) and runs it for `common` — the CONTENT-
IMPORT milestone D26's own text names. `common` flips from `"planned"` to `"installable"` with its
full curated 18-skill set (3 required + 9 default + 6 optional; the 2 owner-dropped skills,
`systematic-debugging` and `test-driven-development`, are confirmed absent). No other pack touched
this pass. No regressions; 430 tests as of this pass (+22, on top of the verified D25-pass baseline
of 408).

**1. `types/pack.ts` / `packs/read-skill-manifest.ts`.** `SkillManifest` gains two optional
fields: `description?: string` (verbatim from the skill's own SKILL.md YAML frontmatter
`description:`, never hand-authored separately) and `clashesWith?: string[]` (advisory,
non-blocking same-ground-overlap refs sourced from `planned skills/clash-map.json` — bare pack-
skill ids or `razor:<name>`-prefixed refs into the not-yet-imported Razor layer, kept as-is).
`readSkillManifest()` parses+validates both the same permissive way as D21's `requires` did:
absent is fine (zero migration for every pre-D26 skill.json), present-but-wrong-shape throws
`SkillManifestError`.

**2. `scripts/import-skill.ts` — curation-aware batch mode.** New `importPackByCuration(pack,
opts)` reads `planned skills/curation-decisions.json` `packs[<pack>]`, imports every skill whose
tier != `"drop"`, and authors a fully curation-aware `skill.json` per skill: `enablement` = tier
verbatim (the three-way vocabulary already matches `SkillEnablement`); `description` scraped via
new `extractDescriptionFromSkillMd()` (hand-rolled, dependency-free frontmatter scanner — handles
the three YAML scalar styles actually present in the gathered sources: folded block `>-`, quoted
inline, plain inline); `clashesWith` looked up in `clash-map.json` by bare skill id; `requires`
derived by inverting curation-decisions' `requiredBy` fields (the `improve-codebase-architecture`
-> `[codebase-design, grilling, domain-modeling]` / `grill-me` -> `[grilling]` edges D21 predicted
by name now resolve to REAL imported skills, not a forward reference). `supportedAdapters`
defaults to all four adapters; ONE curated override table (`CURATED_ADAPTER_OVERRIDES`) restricts
`improve-codebase-architecture` to `["claude"]` (D21 — pure subagent/HTML-report machinery, no
portable prose form) and ONE table (`CURATED_WORKER_AS_AGENT`) keeps `subagent-delegation`'s
existing root-`worker.md`-as-agent D8 special mapping working under curation mode too. The
existing single-skill `importSkill()` gained a shared `buildOutputs()` helper (replacing its old
"claude gets real output, everyone else gets `{}`" placeholder) that now reproduces the REAL
established convention observed in the 3 owner skills' hand-authored `skill.json` BEFORE this pass
— unsupported adapters `false`; `claude` states `agents:true` only when the skill bundles an agent
artifact; `agent` always states `agents:false` explicitly (no AGENTS.md registration surface);
`cursor`/`copilot` state `agents:false` explicitly only when the skill HAS an agent artifact
(making the claude-only restriction visible), otherwise just `{skills:true}`. Re-running
`paper-trail`/`proof-of-done`/`subagent-delegation` through this generator reproduces their
pre-existing `supportedAdapters`/`outputs`/`enablement` BYTE-FOR-BYTE (verified diff-empty), so
the brief's "update the 3 owner skills without breaking their existing shape" requirement needed
zero special-casing beyond the two curated-override tables above. CLI: `import-skill --curate
<pack>` (the `import-common-skills` package script now runs `--curate common`, superseding the
old `--preset common` hardcoded 3-skill list, which is removed).

**3. `packs/common/skills/` — 18 skill dirs, `packs/common/pack.json` skills[] updated.** Imported
via `pnpm import-common-skills` against the real `planned skills/common/` (read-only source, never
modified). D8 stripping still applies: only `SKILL.md`/`worker.md`/`references.md`/`agents/**`/
`examples/**` survive per skill; ad-hoc `scripts/` dirs, loose companion `.md` files (`mocking.md`,
`DEEPENING.md`, `code-reviewer.md`, ...), `PROVENANCE.md`, and every other blocklisted
authoring-scratch file are stripped and reported in each import's `strippedTopLevel`.
(Correction, 2026-07-13 RED-2 remediation: license-bearing files `LICENSE*`/`NOTICE*`/`COPYING*`
are **never** stripped — an explicit `LICENSE_BEARING_FILE` allowlist in `import-skill.ts`
overrides the blocklist so bundled third-party attribution always ships. Third-party license
notices are additionally collected in the root `THIRD-PARTY-LICENSES.md`. See
`packs-redistribution-audit.md`.)

**4. Downstream ripple: 3 pre-existing test files needed real-content-aware updates (not new
tests, behavior-shape assertions only).** `test/list-command.test.ts`'s "common pack declares
exactly the MVP skill list" assertion grew from the 3-name list to the full 18. `test/install-
e2e.test.ts`'s default (`--yes`, no `--include-skills`) install now records `skillSelection:
{excluded: [], included: ["grilling"]}` instead of `{excluded: [], included: []}` — a REAL, correct
D21 consequence: `grill-me` is now a real "default"-tier skill whose `requires: ["grilling"]`
closure auto-enables+locks its normally-optional dependency even with no explicit flag. `test/
wizard-flow.test.ts`'s ~20 full-flow tests (every one that exercises the REAL bundled `common` pack
with no `packsRoot` fixture override) needed a scripted step-5 `checkbox` answer added — step 5 was
previously skippable ("nothing togglable", `common` had zero non-required skills); it no longer is.
Every added answer is the SAME literal 13-skill set (documented at `COMMON_SKILLS_STEP5_ANSWER`,
top of the file) chosen to converge `selectSkills()`'s D21 lock/release loop in exactly one round
and land on the identical default resolution a flag-driven install produces — verified against the
real catalog before scripting, not guessed.

**5. Test growth: 408 -> 430 (+22).** `test/import-skill.test.ts` gained two new describe blocks:
`extractDescriptionFromSkillMd` (5 tests — folded/quoted/plain scalar styles, no-frontmatter,
no-description-key) and `importPackByCuration` (11 tests — tier->enablement mapping incl. drop
exclusion, description scraping, clashesWith population incl. the "no clash-map entry" omission
case, D21 `requires` derivation from `requiredBy` inversion incl. the fan-out `grilling` edge,
the `improve-codebase-architecture` claude-only override + a normal skill's 4-adapter default side
by side, D8 stripping still enforced, the `subagent-delegation` workerAsAgent special mapping,
idempotent re-run, and the missing-pack-entry error path). `test/read-skill-manifest.test.ts`
gained a "description + clashesWith" describe block (6 tests, mirroring D21's `requires` block
exactly: valid parse, both-absent-is-undefined, no-skill.json-fallback-never-sets-them, and three
invalid-shape throw cases).

**Demo evidence (BUILT dist, exit codes verbatim, both temp-dir installs cleaned up after):**
`list --json` — `common.status: "installable"`, `common.missingSkills: []`, `common.skills.length:
18`; every other pack still `"planned"`. `install --type next --adapters
claude,cursor,copilot,agent --yes --json` in a fresh temp dir — `ok:true`, `installedPacks:
["common"]`, `skillSelection: {excluded: [], included: ["grilling"]}`, 20 rendered files; `.claude/
skills/` holds the 14-skill effective set (13 required+default + `grilling`), `.cursor/rules/
nockta-common.mdc` + `AGENTS.md` + `.github/instructions/nockta.instructions.md` each bundle the
same 14 skills (grepped `## `/`### ` headings, byte-verified NOT to include `improve-codebase-
architecture` as a real section — only as a cross-reference mention inside `diagnosing-bugs`'
prose, "hand off to the `/improve-codebase-architecture` skill"). A second temp-dir install with
`--include-skills improve-codebase-architecture,codebase-design,grilling,domain-modeling` confirms
the full D21 closure lands under `.claude/skills/` (4 dirs) while `improve-codebase-architecture`
renders in NONE of the other three adapter surfaces — proving the D21 claude-only override is
real, not just declared. `doctor --json` on the first install reports `healthy — 20 file(s)
intact`. Spot-checked `skill.json` verbatim: `grill-me` (`enablement:"default"`, `description`
from frontmatter, `clashesWith:["razor:constraints-are-code"]`, `requires:["grilling"]`);
`improve-codebase-architecture` (`supportedAdapters:["claude"]`,
`outputs:{claude:{skills:true},cursor:false,copilot:false,agent:false}`,
`clashesWith:["razor:boundaries-follow-authority"]`,
`requires:["codebase-design","grilling","domain-modeling"]`); `paper-trail`/`proof-of-done`/
`subagent-delegation` confirmed byte-identical `supportedAdapters`/`outputs`/`enablement` to
pre-pass, `description` newly added, no `clashesWith` (no clash-map entry for any of the 3).

**Suite/build:** `pnpm typecheck` clean, `pnpm build` clean, `pnpm test` — 35 suites, 430 tests,
zero regressions.

**Deviations from the brief, one line each:** (1) the brief's D8 allowlist text ("SKILL.md,
worker.md, references/\*\*, agents/\*\*, examples/\*\*") is applied literally, which strips several
gathered common-pack skills' extra top-level companion files that aren't clutter in the D8
"authoring scratch" sense (`brainstorming/spec-document-reviewer-prompt.md` +
`visual-companion.md`, `tdd/mocking.md` + `tests.md`, `codebase-design/DEEPENING.md` +
`DESIGN-IT-TWICE.md`, `domain-modeling/ADR-FORMAT.md` + `CONTEXT-FORMAT.md`, `improve-codebase-
architecture/HTML-REPORT.md`, `requesting-code-review/code-reviewer.md`, and every skill's own ad-
hoc `scripts/` dir) — each skill's SKILL.md still stands alone and renders correctly, but these
companion references are gone from the bundle; flagging in case the owner intended a wider
allowlist (e.g. a `files:` declaration per skill, the field `SkillManifest` already reserves but
this importer doesn't populate) for a follow-up pass. (2) `common`'s `pack.json` top-level
`adapters` field was left at its pre-existing `["claude","cursor","copilot"]` (not extended to
include `"agent"`) — out of the brief's stated scope (skills[] only) and consistent with every
other existing pack's `adapters` field, which the fallback-only `readSkillManifest()` path never
exercises for these skills (all 18 carry a real `skill.json`).

Adds two new `RepoType`s, `react-native` and `expo`, and their two packs (decisions.md D25) —
this pass covers ONLY the inject-nockta-skills side of a cross-package change also landing in
`create-nockta-repo` (scaffolders, overlays, `RepoType` mirror) in the same pass; see that
package's own `context.md` for its half. No regressions; 408 tests as of this pass (+12, on top
of the verified D24-pass baseline of 396).

**1. `types/repo-type.ts`.** `RepoType` union and `REPO_TYPES`/`isRepoType` both gained
`"react-native"` and `"expo"`, appended at the end (existing 6 values unchanged, in order) —
`create-nockta-repo`'s own copy mirrors this exactly (D7 enum parity), and its
`test/enum-parity.contract.test.ts` confirms it live against this package's built `list --json`.

**2. Two new packs, `packs/react-native/pack.json` and `packs/expo/pack.json`.** `react-native`
`requires: ["common"]` (the usual shape); `expo` `requires: ["react-native"]` — a pack-level
`requires` chain one level deeper than any existing pack, per D25's explicit design ("Expo is
React Native plus Expo's own layer... an Expo pack with no RN foundation doesn't make sense").
Both declare their intended DEFAULT-tier skill names (3 for react-native, 9 for expo — see
`skills/curation-proposal.md`'s react-native/expo sections) but carry **zero skill content on
disk** — this pass declares shape only, per its own explicit scope boundary (skill-content import
is a separate, still-parked milestone, same posture D9/M9's mattpocock cluster and D21's
`grill-me` already established). Both packs therefore report `"planned"` via the pre-existing D6
gate, with ZERO new gate logic needed. `react-native`'s `adapters` field is the first in the repo
to include `"agent"` from creation (`["claude","cursor","copilot","agent"]`) — D24 predates D25,
but only NEW packs adopt the 4-adapter list at authoring time; existing packs' `adapters` fields
are untouched here, per D24's own "pending implementation" note (which scopes that follow-up to
`packs/common/skills/subagent-delegation/skill.json`, not pack-level `adapters` arrays).

**3. `core/detect-repo-type.ts`.** `detectRepoType()` gained a `react-native`/`expo` block, same
shape as every existing heuristic (package.json dep checks + `existsSync`, ranked
confidence+evidence, never throws). The `react-native` package.json dependency is the sole
RN-vs-web gate (present in both Expo-managed and bare RN, absent from every web React setup);
once gated, `expo` sub-classifies on an `expo` dep OR `app.json`'s top-level `"expo"` key OR
`app.config.js`/`app.config.ts`, else bare `react-native`. Deliberately does NOT gate on bare
`react` (shared with `vite-react-ts`) or `metro.config.js`/`eas.json` (both absent from the
current SDK 57 Expo default template — verified against the real template tarball, not memory;
see `scratchpad/react-native-tooling-research.md` §3). This block plugs into the PRE-EXISTING
`detectRepoTypeAcrossWorkspace()` (D22) with zero changes to that function — it already treats
every `detectRepoType()` guess type-agnostically, so react-native/expo guesses surface in
workspace sub-packages for free.

**4. Test growth: 396 -> 408 (+12).** `test/resolve-packs.test.ts` gained a new "D25: expo pack
requires react-native pack" describe block (3 tests, against the REAL bundled `packs/`, no
`packsRoot` override — the first test in this file to exercise the real pack tree rather than a
synthetic fixture, deliberately, to prove the real `requires` chain resolves and not just a
fixture standing in for it). `test/pack-manifest.test.ts` gained 2 tests parsing the real
`packs/react-native/pack.json` and `packs/expo/pack.json`. `test/detect-repo-type.test.ts` gained
a 7-test "react-native / expo" describe block (no-detection-from-react-alone, expo-from-deps,
expo-from-app.json-key, expo-from-app.config.ts, bare-react-native, bare-with-no-app.json,
plain-react-web-never-classified). Three pre-existing hardcoded `REPO_TYPES`/pack-choice
assertions were updated (not new tests, no behavior change beyond the two new enum values):
`test/cli.test.ts`'s exact-union check, `test/wizard-steps.test.ts`'s `planRepoTypeStep` choice
list, and `test/list-command.test.ts`'s bundled-pack-count assertions (8→10 packs, 7→9 planned).

**Demo evidence (BUILT dist, exit codes verbatim):** `list --json` lists `react-native`+`expo`
among 10 packs, both `"planned"`; `detectRepoTypeAcrossWorkspace()` on an expo-fixture
(package.json with expo+react-native+expo-router) top-guesses `expo`; on a bare-RN fixture
(react-native, no expo) top-guesses `react-native`; `resolvePacks({requestedPacks:["expo"]})`
against a fixture `packsRoot` resolves `common`+`react-native`+`expo`, all reported
`planned`/skipped (correct D6 — no content). Full scripts: `scratchpad/d25-demo/` (this pass's
worker).

**Suite/build:** `pnpm typecheck` clean, `pnpm build` clean, `pnpm test` — 35 suites, 408 tests,
zero regressions.

**Deviations from the brief, one line each:** (1) `packs/react-native/pack.json` and
`packs/expo/pack.json`'s `adapters` field includes `"agent"` even though every OTHER pack in the
repo still lists only 3 adapters (pre-D24 authoring) — deliberate per the brief's explicit
instruction, flagged here so a future D24-followup pass doesn't read this as already-consistent
repo-wide precedent. (2) no dedicated `--packs-root`-flag demo against `dist/cli.js` exists (same
pre-existing boundary M9/M10 already documented — see their own Deviations) — the D25
proof-of-done demo uses the same `packsRoot`-parameter mechanism against the built
`dist/index.js` exports, matching the established pattern.

## Current state (as of the previous pass — 2026-07-11, post-Milestone 8 — D24 generic `agent` adapter + D23 subagent-delegation reclassification)

Adds a FOURTH adapter, `agent` (decisions.md D24), and reclassifies `subagent-delegation`
adapter-portable (decisions.md D23), on top of the verified M10 baseline (386 tests). No
regressions; 396 tests as of this pass (+10).

**1. `agent` adapter.** `AdapterType` gains `"agent"` (`src/types/adapter.ts`). New
`src/adapters/agent/render.ts` — `renderAgentAdapter()` renders exactly ONE root `AGENTS.md`,
modeled on `copilot/render.ts`'s single-combined-file shape (one section per installable pack,
drawn from its selected+supported skills) but in plain-markdown AGENTS.md conventions: no
tool-specific frontmatter, a short "Generated by inject-nockta-skills" intro line. D1 override:
`packs/<pack>/adapters/agent/<pack-name>.md` wins wholesale per pack. D24's agent-artifact rule:
`outputs.<adapter>.agents` is NEVER honored under this adapter — AGENTS.md has no
agent-registration mechanism, so `worker.md`-type skill artifacts contribute prose only, never a
rendered agent file. Wired into `core/render-adapters.ts`'s dispatch (one new `if` block) and
offered in the wizard's step 4 (`wizard/steps/select-adapters.ts`, `AVAILABLE_ADAPTERS` +
`defaultSelected`, with a `description` on its choice). Doctor/repair/upgrade needed ZERO code
changes (manifest-driven — see `src/core/CONTEXT.md`'s D24 addendum).

**2. `subagent-delegation` reclassification (D23).** `packs/common/skills/subagent-delegation/
skill.json` widened `supportedAdapters` from `["claude"]` to
`["claude","cursor","copilot","agent"]`; `outputs.{cursor,copilot,agent} = {skills:true,
agents:false}` — its PROSE now renders everywhere, only its bundled `worker.md` agent artifact
stays claude-only (`outputs.claude.agents: true`, unchanged). `paper-trail`/`proof-of-done`
`skill.json` gained `outputs.agent = {skills:true, agents:false}` (they already supported cursor/
copilot since M7; agent is the only new surface for them).

**3. Enum-parity mirror in `create-nockta-repo`.** Its own `src/types/adapter.ts` (D7 duplication,
not import) gets the matching one-line `AdapterType`/`ADAPTER_TYPES`/`isAdapterType` change — that
package renders nothing itself (only validates/forwards `--adapters` to inject), so no renderer
work there. `create`'s `test/enum-parity.contract.test.ts` (spawns the REAL local inject dist's
`list --json`) confirmed green after the change; `create`'s own `test/types.test.ts` and
`test/wizard-steps.test.ts` (its own `select-adapters.ts` maps `ADAPTER_TYPES` directly, offering
every adapter with `--adapters` as a pure pass-through) needed matching one-line assertion updates.

**4. Test growth.** 386 -> 396: 7 new `test/agent-render.test.ts` cases (AGENTS.md shape,
adapter-restriction skip, `outputs.agent` respected, D19 selection-exclusion, D1 override-wins,
zero-skills-produces-no-file, agent-artifact never honored) + 3 new cases in
`test/multi-adapter-e2e.test.ts`'s new 4-adapter `describe` block (4-adapter install incl. all 3
owner skills' prose in AGENTS.md, manifest coverage rm->doctor exit 4->repair->doctor exit 0,
agent-adapter-alone single-file/single-manifest-record). 5 pre-existing assertions updated (not
new tests): `test/cli.test.ts`'s `ADAPTER_TYPES` exact-union check, `test/import-skill.test.ts`'s
D8-shape fixture (now includes `agent: false`), `test/wizard-steps.test.ts`'s
`planAdapterStep`/`selectAdapters` default-list checks (now 4-wide), and
`test/multi-adapter-e2e.test.ts`'s subagent-delegation-absent-from-cursor/copilot assertions
(flipped to present, per D23 — with a new assertion that no `.claude/agents/`-equivalent dir
exists under `.cursor/`/`.github/`).

## Current state (as of the previous pass — 2026-07-11, Milestone 10 — D22 multi-type targets)

Adds D22 multi-type targets on top of the verified M9 baseline (353 tests: pack system, 3 adapter
renderers, D19 tiers, D21 skill dependencies + adapter-gating, install single+monorepo, doctor/
repair/upgrade/sync, the real wizard). No regressions; 386 tests as of this pass (+33).

**1. Multi-type parsing.** `types/repo-type.ts` gained `parseRepoTypesList(raw, separator)` —
comma (`--type next,vite-react-ts`) or `+` (`--target <path>:<a>+<b>`) separated, validated
against `REPO_TYPES`, deduped, never throws. `commands/install.ts`'s `--type` and
`core/parse-targets.ts`'s colon-form embedded type list both call it — a single-type input still
comes back as a one-element array, so every pre-D22 call site kept working with zero migration
beyond a type-shape rename (`RepoType` -> `RepoType[]`, applied mechanically across
`InstallOptions`, `MonorepoInstallTarget`, `ParsedTarget`, `TargetRecord`,
`NocktaSkillsProfile`, `ComputeRenderPlanOptions` — the last of these DROPPED its old singular
`repoType` option entirely rather than carrying two shapes forward).

**2. Union resolution needed almost no new logic.** `packs/resolve-packs.ts`'s `requestedPacks`
was already resolved through an internal `Set` — feeding it a multi-type target's `repoTypes[]`
(or a monorepo's `flatMap()`-flattened union across every target) dedupes for free: `common`
resolves exactly once no matter how many requested types name it as a dependency, and a type named
twice (or by two different targets) still only resolves its pack once. D19 tiers, D21 `requires`
closure, and D21 adapter-gating all flow through the SAME `resolveSkillSelection()` call
unchanged — they operate on the resulting catalog, not on how many types produced it. An
"unmapped" type (a hypothetical future type outside the 6 `RepoType`s, e.g. a dedicated
`vite-vanilla-ts`) never reaches `resolvePacks()` at all — `parseRepoTypesList()`/`detectRepoType()`
are both scoped to the 6 real types, so the "contributes nothing beyond common" case is enforced
at the parse/detection boundary, not inside pack resolution.

**3. Profile/targets schema: `repoType` -> `repoTypes: string[]`, with a read-only legacy
shim.** `NocktaSkillsProfile`/`TargetRecord` both gained `repoTypes: RepoType[]` (removing the
singular field from the TYPE). `types/profile.ts`'s `normalizeLegacyRepoType()` (called inside
`core/profile-guard.ts`'s `readProfileForMaintenance()`, BEFORE shape validation) and
`types/target.ts`'s `normalizeTargetRecord()` (called inside `core/read-targets.ts`'s
`readTargetsFile()`, per record) each accept EITHER shape on read and always normalize to
`repoTypes`; every WRITE path (`write-profile.ts`, `write-targets.ts`) always emits the new shape.
No published version of this package ever wrote the old shape (decisions.md D22's own "Why") — the
shim is purely defensive.

**4. Workspace-walking detection (the Grace requirement).** `core/detect-repo-type.ts` gained
`detectRepoTypeAcrossWorkspace(targetDir)` — runs the existing per-directory `detectRepoType()`
against the root AND every declared npm `workspaces` sub-package (via a new, shared
`core/workspace-globs.ts`, extracted from the wizard's pre-existing `select-targets.ts` workspace
discovery so both consumers read the identical glob list), then dedupes the combined guess list BY
TYPE — the highest-confidence guess for a given type wins, tagged with its source; a weaker
same-type guess from elsewhere is folded into that entry's evidence, never surfaced as a separate
lower-ranked candidate. Degrades to exactly `detectRepoType()`'s own result for a repo with no
workspaces at all — safe to call unconditionally.

**5. Wizard type step: MULTI-select.** `wizard/steps/select-repo-type.ts`'s `selectRepoType()`
(single-select, `prompts.select()`) became `selectRepoTypes()` (checkbox, `prompts.checkbox()`,
returns `RepoType[]`) — every detected candidate pre-checked by default (the pre-D22
"single-detected-type fast path" is simply the one-candidate case of the same mechanism). An
explicit `--type` preset short-circuits without prompting, generalized to comma-separated. The
monorepo per-target discovery step (`collectMonorepoTargets`) also now confirms multiple types per
target via the same checkbox function. Every pre-existing scripted `select` answer for this step
across `test/wizard-steps.test.ts`/`test/wizard-flow.test.ts` was mechanically converted to
`checkbox` — `select` was never used for anything else in this wizard.

**6. The "root-is-a-project monorepo" refinement.** `run-install-wizard.ts`'s step 1 computes
`rootIsAlsoAProject` from `detectRepoTypeAcrossWorkspace()`'s `bySource` (does the ROOT directory
itself match a repo-type signal, not just a workspace sub-package) and OVERRIDES an
AUTO-DETECTED monorepo signal — routing to the single-project multi-type branch instead of
per-workspace target discovery — whenever the root is also a project AND neither `--monorepo` nor
`--target` was explicitly given (an explicit request always wins, matching every other
"explicit beats heuristic" rule in this wizard). The install still lands at the repo root
(`--target .:<types>` semantics, spec D5 root-adapter placement) with no per-workspace `.claude/`.

**7. Doctor**: multi-type targets validate structurally for free — `normalizeTargetRecord()`
already rejects a `repoTypes` entry naming an unknown type (the whole `targets.json` is reported
invalid, same failure class a bad legacy `repoType` always was); the union's expected files are
computed from the SAME `flatMap()`-flattened `distinctRepoTypes` as install. No deep re-detection
(out of scope, unchanged from M5).

**Test counts: 353 -> 386 (+33).** New: `test/install-multi-type-e2e.test.ts` (5 tests, fixture
`packsRoot` — comma `--type` union, dedup, unknown-type error, `--dry-run`, colon+plus `--target`).
`test/parse-targets.test.ts` gained a D22 describe block (8 tests: colon+plus, comma split-form,
dedup, unknown-type-in-list error, single-type back-compat). `test/resolve-packs.test.ts` gained a
D22 describe block (3 tests: union of two stack packs/common-once, dedup, unmapped-type-missing).
`test/detect-repo-type.test.ts` gained a `detectRepoTypeAcrossWorkspace` describe block (5 tests,
Grace-shaped fixture). `test/doctor.test.ts`/`test/monorepo-doctor.test.ts` each gained a legacy
read-shim test, plus a multi-type-target doctor test (monorepo). `test/wizard-steps.test.ts`'s
`select-repo-type.ts` block rewritten for the checkbox API (7 tests). `test/wizard-flow.test.ts`
gained a D22 describe block (3 tests: multi-select checkbox, comma preset, root-is-a-project
override end to end). `test/install-entry-process.test.ts` gained a D22 describe block (3 tests,
built `dist/cli.js`, real bundled packs).

**Demo evidence (BUILT dist, exit codes verbatim):**
```
(a) buildInstallResult({ type: "next,vite-react-ts", adapters: "claude", yes: true,
    packsRoot: <fixture with real common+next+vite-react-ts content> })
    exitCode: 0  ok: true — installedPacks: ["common","next","vite-react-ts"];
    renderedFiles include app-router-architect/SKILL.md AND react-component-author/SKILL.md,
    paper-trail/SKILL.md exactly once; data.repoTypes: ["next","vite-react-ts"];
    written skills-profile.json: "repoTypes": ["next","vite-react-ts"].

(b) detectRepoTypeAcrossWorkspace() on a Grace-shaped fixture (root: classic Shopify theme
    dirs — sections/templates/config — + package.json workspaces:["packages/*"];
    packages/tcc-react: react+vite+typescript; packages/tooling: vite+typescript, no react):
      root-only detectRepoType() (pre-D22):
        guesses: [{ type: "shopify-theme", confidence: 0.85, evidence: [".../classic theme shape"] }]
        -> vite-react-ts is INVISIBLE to the pre-D22 root-only detector.
      detectRepoTypeAcrossWorkspace() (D22):
        guesses: [
          { type: "vite-react-ts", confidence: 0.92,
            evidence: ["(packages/tcc-react) ...vite\"+\"react\"...; TypeScript present",
                       "(packages/tooling) ...vite\" (no react)...; TypeScript present"] },
          { type: "shopify-theme", confidence: 0.85,
            evidence: ["(root) sections/, templates/, and config/ ... classic theme shape"] }
        ]
      -> BOTH shopify-theme (root) and vite-react-ts (packages/tcc-react) present, ranked;
         packages/tooling's weaker no-react signal is folded into the SAME vite-react-ts entry's
         evidence, never a separate lower-ranked candidate.

(c) A profile hand-rewritten to the legacy singular shape (`"repoType": "next"`, `repoTypes`
    field deleted) read back via buildDoctorResult():
      exitCode: 0  ok: true — profileStatus: "ok", healthy: true, summary: "healthy — 2 file(s)
      intact, current at v9.9.9-demo" — the read-shim normalized it transparently.
```
Full scripts + raw output: `scratchpad/d22-demo/` (this pass's worker: `demo-a.mjs`, `demo-b.mjs`,
`demo-c-setup.mjs` + `demo-c.mjs`, and the `fixture-packs`/`grace-fixture`/`legacy-target`
directories they operate on).

**Suite/build:** `pnpm typecheck` clean, `pnpm build` clean, `pnpm test` — 34 suites, 386 tests,
zero regressions.

**Deviations from the brief, one line each:** (1) `src/index.ts` gained two more re-exports
(`detectRepoType`, `detectRepoTypeAcrossWorkspace`, plus their result types) — needed for the
BUILT-dist proof-of-done demo (b) above, same reasoning M9 already established for
`buildInstallResult`/`buildDoctorResult`/`buildUpgradeResult` (no process-level `--packs-root` or
detection-demo CLI flag exists). (2) the monorepo per-target discovery checkbox
(`collectMonorepoTargets`) was ALSO upgraded to multi-select for consistency, even though the
brief's item 5 wording centered on "the wizard type step" generically — real multi-type
per-target selection is also reachable via the pre-existing manual colon+plus entry syntax
regardless. (3) "root-is-a-project monorepo" detection is a director-recommended, owner-pending
design per decisions.md D22's own refinement text ("director recommendation, pending owner
confirmation") — implemented as the most literal reading of that paragraph (root itself matches a
repo-type signal + an auto-detected-only monorepo signal -> override); this is the one piece of
this milestone that rests on an interpretation rather than an unambiguous decision-record line.

## Current state (as of the previous pass — 2026-07-11, Milestone 9 — D21 skill-level dependencies)

Adds the D21 skill-dependency mechanism (`requires: string[]` in `skill.json`) on top of the
verified M8 baseline (318 tests: pack system, 3 adapters, D19 tiers, install single+monorepo,
doctor/repair/upgrade/sync, the real wizard). No regressions; 353 tests as of this pass (+35).

**1. `skill.json` schema + reader.** `types/pack.ts`'s `SkillManifest` gained an optional
`requires?: string[]`. `packs/read-skill-manifest.ts` validates it structurally (array of
non-empty strings when present) and passes it through untouched otherwise — absent `requires`
needs zero migration on any pre-D21 skill.json. Whether a named dependency actually RESOLVES to a
real skill cannot be known from one skill.json in isolation (that needs the whole catalog) — that
cross-catalog check is `core/skill-selection.ts`'s job, a structured error (`skill "X" requires
unknown skill "Y"`), not a crash.

**2. `packs/skill-catalog.ts`'s `SkillCatalogEntry`** gained `supportedAdapters` and `requires`
(defaulted to `[]`) alongside the existing `pack`/`skill`/`enablement` — `core/skill-selection.ts`
needs both to compute the closure and adapter gating; this is a passthrough, not new I/O.

**3. `core/skill-selection.ts`'s `resolveSkillSelection()` — extended, not replaced.** The D19
tier logic (`required ∪ default ∖ excluded ∪ includedOptionals`) now runs FIRST to produce a
tentative base set, then a `requires` closure DFS expands it: every dependency of every effective
skill is force-added (and, if optional-tier, materialized into `deltas.included` — D21's
"dependency-closed deltas", spec §10.1), tracked in a new `requiredBy: Map<string, string[]>`
result field (dependency name -> sorted dependent names — the wizard's lock UX and the dry-run
plan's `requiredBy` column both read this). Three new failure modes, all structured (`.errors`,
same tolerant-vs-strict two-posture convention D19 already established):
- **Cycle detection: DETECTED AND ERRORED** (documented choice — see the file's own doc comment)
  — a DFS recursion-stack guard always breaks a repeated-node branch (mandatory, to never
  hang/stack-overflow) and always records an error; the tolerant maintenance posture still
  ignores it as usual, so a cyclic pack cannot brick an existing install's doctor/repair/upgrade.
- **Adapter-gated selectability** (generalizes D8 from render-time to SELECTION-time): a new
  `adapters?: AdapterType[]` resolver option (omitted = no gating, back-compat default) gates both
  explicit `--include-skills` names AND closure-dependency edges — `improve-codebase-architecture`
  (claude-only) cannot be included without `--adapters claude`; a required-closure dependency that
  isn't adapter-eligible is a clear "cannot satisfy dependency" error (defensive — cannot happen
  with any currently-bundled skill, every real dependency is portable prose).
- **Blocked exclusions**: `--exclude-skills` of a skill still required by an enabled/default/
  included skill is now an error naming the dependent, surfaced BOTH as a free-text error message
  AND a new structured `blockedExclusions: string[]` result field (so the wizard's lock/release
  loop can react programmatically instead of parsing error strings).
- `core/render-plan.ts`, `core/build-install-plan.ts`, `core/inject-skills.ts`,
  `core/inject-skills-monorepo.ts` each gained exactly one line (`adapters: options.adapters`) —
  every one of them already had `adapters` in scope, so this is pure threading, no new I/O.
  `build-install-plan.ts`'s `InstallPlanSkillEntry` gained `requiredBy: string[]` (surfaced in the
  `install --dry-run --json` plan) and `commands/install.ts`'s human formatter gained a `🔒
  required by ...` suffix for locked rows.

**4. Wizard `select-skills.ts` — iterative fixed-point reprompt loop, not live locking.**
`@inquirer/prompts`' `checkbox()` has no per-keystroke update hook, so live "lock this row the
instant you check its dependent" is not implementable against the real library. Instead:
adapter-ineligible default/optional skills are OMITTED from the choice list entirely (documented
choice — the brief allowed "disabled" or "omitted"; required-tier skills are NEVER filtered this
way, unchanged D8 per-adapter render-time skip still applies to them); a defensive `isOfferable()`
check also omits a dependent whose OWN dependency chain is adapter-ineligible (brief item 5,
"can't happen for our data, handle defensively"). `selectSkills()` shows the checkbox, derives
`excluded`/`included` from the answer, calls `resolveSkillSelection()` (the SAME engine the
non-interactive path uses — one validator, not two) to get the closure-corrected effective set; if
that differs from what was just submitted, the checkbox is shown AGAIN with the new locks
(checked+disabled, labeled `🔒 required by <dependent>` — reusing the exact combination already
established for required-tier rows) and the loop repeats (capped at 8 rounds, a defensive
never-expected-to-fire fallback). `resolveSkillSelection()`'s `blockedExclusions` (a same-round
attempt to uncheck a still-needed default while also checking its dependent) is corrected in
place before resolving again, rather than surfaced as a hard error — a live-updating UI would
have prevented the user from doing that in the first place. Converges in ONE round for the common
case (a dependent's `requires` are already default-tier, already-checked skills); two rounds when
an optional-tier dependency needs pulling in (the `grill-me` -> `grilling` example) or when the
last dependent needing a shared lock is turned off.

**5. Real content NOT imported.** The mattpocock cluster
(`improve-codebase-architecture`/`codebase-design`/`grilling`/`domain-modeling`) and `grill-me`
live only in `planned skills/`, not `packs/common/` — importing them is a separate, still-parked
milestone (unchanged scope boundary from earlier passes). This pass proves the MECHANISM against
FIXTURE packs that encode the exact real edges verbatim (`test/skill-dependencies-e2e.test.ts`,
`test/skill-selection.test.ts`'s "the mattpocock-style edge" / "the grill-me -> grilling edge"
tests) — real `skill.json` files gain `requires` at import time, a one-line addition per skill
(documented here so the eventual import pass doesn't have to rediscover this).

**Test counts: 318 -> 353 (+35).** New: `test/skill-dependencies-e2e.test.ts` (9 tests, fixture
`packsRoot`, mirrors `test/skill-selection-e2e.test.ts`'s mechanism one level up — install/doctor/
upgrade across the real named D21 edges + a generic linear-chain and cycle-guard case).
`test/skill-selection.test.ts` gained a whole new describe block (13 tests: linear/diamond/no-op-
closure/cycle/dangling-requires/blocked-exclusion/adapter-gating/the two real named edges).
`test/wizard-steps.test.ts` gained 6 D21 tests (offerability omission, one-round convergence,
two-round lock/release, diamond release-when-unshared). `test/wizard-flow.test.ts` gained one full
`runWizardFlow()` round-trip proving the wizard's real step-4-to-step-5 adapter wiring plus the
two-round grill-me/grilling lock, end to end through `run-install-wizard.ts` (not just the
step-level unit). `test/read-skill-manifest.test.ts` gained a `requires` validation block (6
tests). `test/install-dry-run.test.ts`'s one pre-existing strict-equality assertion was updated
for the new `requiredBy: []` field (not a behavior change — the plan entry shape grew one field).

**`src/index.ts`** (the package's own "internal reuse" programmatic surface, per its pre-existing
doc comment) gained re-exports of `buildInstallResult`/`buildDoctorResult`/`buildUpgradeResult` —
used for this pass's own built-`dist`-based proof-of-done demo (a fixture-`packsRoot` script
against `dist/index.js`, since `dist/cli.js` has no importable exports and there is no process-
level `--packs-root` CLI flag — the `packsRoot` hook `test/skill-selection-e2e.test.ts` uses is a
TS-level function parameter, not an env var or CLI flag; see "Deviations" below).

**Demo evidence (built dist, fixture packsRoot, exit codes verbatim):**
```
(a) install --dry-run --include-skills improve-codebase-architecture --adapters claude
    exitCode: 0  ok: true — plan.skills shows codebase-design/grilling/domain-modeling all
    selected:true, requiredBy:["improve-codebase-architecture"]; skillSelection.included:
    ["improve-codebase-architecture"] (deps already default-tier, no delta needed for them).
(b) install --include-skills improve-codebase-architecture --adapters cursor (no claude)
    exitCode: 1  ok: false — "not supported by the selected adapter(s)".
(c) install --include-skills grill-me --exclude-skills grilling --adapters claude
    exitCode: 1  ok: false — 'cannot exclude "grilling": still required by grill-me'.
(d) install --include-skills grill-me --adapters claude (real write) -> both grill-me and
    grilling rendered; skillSelection.included: ["grill-me"] (grilling default-tier, no delta) ->
    doctor: exitCode 0, healthy:true, missing:0, unknown:0 -> upgrade to a new package version:
    exitCode 0, grilling still rendered -> doctor after upgrade: healthy:true.
```
Full script + raw output: `scratchpad/d21-demo/run.mjs` (this pass's worker).

**Suite/build:** `pnpm typecheck` clean, `pnpm build` clean, `pnpm test` — 33 suites, 353 tests,
zero regressions.

**Deviations from the brief, one line each:** (1) no process-level `--packs-root` CLI flag exists
anywhere in this package (confirmed by reading `src/cli.ts` and grepping for `process.env` — only
the unrelated Extras home/bin overrides exist) — "the CLI supports the test packsRoot hook" is the
pre-existing TS-level `packsRoot` OPTION on `buildInstallResult`/`buildDoctorResult`/
`buildUpgradeResult` (exactly what `test/skill-selection-e2e.test.ts` already uses), not a
process-argv/env hook; the proof-of-done demo uses that same mechanism against the newly-exported
`dist/index.js` surface rather than spawning `dist/cli.js`. (2) cycle policy: chose "detect and
error" over "break safely + warn" (the brief said pick one) — documented in `skill-selection.ts`'s
own doc comment and above. (3) adapter-ineligible skills are OMITTED from the wizard's choice list
rather than shown disabled (the brief allowed either) — documented in `select-skills.ts`.

## Current state (as of the previous pass — 2026-07-10, Milestone 8 — publish preparation)

Milestone 8 adds no new commands and changes no orchestration behavior. Two things landed:

**1. Cursor output-filename rename (decisions.md D20).** `src/adapters/cursor/render.ts`'s
`relativePath`/`outputPath` construction changed from `.cursor/rules/<pack>.mdc` to
`.cursor/rules/nockta-<pack>.mdc` (e.g. `nockta-common.mdc`) — namespacing Nockta's generated
Cursor rule files against user-owned `.cursor/rules/*.mdc` files that may already exist in a
target repo, and matching spec §8.3's own `nockta-common.mdc` sample (M7 had applied that
sample's prefix to the `common` pack's name specifically, per that pass's own brief, leaving the
spec's OWN example internally inconsistent for every other pack — D20 resolves it uniformly for
M8). The D1 override rule's SOURCE filename (`packs/<pack>/adapters/cursor/<pack-name>.mdc`, an
authoring-side convention, not user-repo-facing) is deliberately UNCHANGED — only the rendered
OUTPUT under a target repo's own `.cursor/rules/` gained the prefix. Doctor/repair/upgrade needed
**zero code changes** — both are manifest-driven (`.nockta/generated-manifest.json` records
whatever `relativePath` a renderer actually produced), so the new filename flows through
automatically; verified end-to-end below.

**2. Publish preparation (preparation only — `npm publish` was never run, per this pass's brief).**
- `package.json`: `bin`/`main`/`types`/`exports` verified correct against a fresh `pnpm build`
  (unchanged — already correct pre-M8). `files` already included `dist`, `packs` (critical — the
  bundled skill content, without which an installed copy of this package could not install
  anything), and `README.md` (unchanged — already correct). `engines.node: ">=20"` unchanged.
  Added `publishConfig: { "access": "public" }` (inert while `private: true`, correct for
  publish-time). Removed the `license: "UNLICENSED"` field entirely — see "License" note below.
  Removed the unused `fs-extra` dependency + `@types/fs-extra` devDependency (verified zero
  imports anywhere under `src/`/`test`/`scripts/` — installed per spec §16 since early milestones
  but genuinely never used, `src/CONTEXT.md` already documented this; `pnpm install --offline`
  re-synced `pnpm-lock.yaml`, no registry contact). `"private": true` **deliberately KEPT** — its
  removal is the owner's own explicit publish-time act, not this pass's decision (README's
  pre-existing note to this effect was kept accurate, not removed).
- **`npm pack --dry-run` works fine with `private: true` set** — npm only blocks the real
  `publish` action on that flag, not `pack`. No workaround (temp-flipped copy, `pnpm pack`, etc.)
  was needed; the committed `package.json` was never touched for this proof. Verified twice (once
  before README finalization, once after, to get the final byte-accurate listing): **23 total
  files, package size 136.1 kB, unpacked 576.5 kB.** Key lines from the final listing (full
  verbatim capture: `scratchpad/npm-pack-final.txt`, this pass's worker):
  ```
  README.md, dist/cli.d.ts, dist/cli.js (132.9kB), dist/cli.js.map, dist/index.d.ts, dist/index.js,
  dist/index.js.map, package.json,
  packs/common/pack.json,
  packs/common/skills/paper-trail/{skill.json,SKILL.md},
  packs/common/skills/proof-of-done/{skill.json,SKILL.md},
  packs/common/skills/subagent-delegation/{skill.json,SKILL.md,agents/worker.md},
  packs/{monorepo,nest,next,shopify-app,shopify-headless,shopify-theme,vite-react-ts}/pack.json
  ```
  Confirmed: every `packs/**/skill.json` + `SKILL.md` pair present (all 3 `common` skills, incl.
  `subagent-delegation`'s `agents/worker.md`); `dist/cli.js` present; **no** `test/`, `src/`,
  `fixtures/`, or `node_modules/` in the tarball (files array whitelist — `dist`, `packs`,
  `README.md` — makes this true by construction, not by exclusion-list maintenance).
- **License: intentionally left unresolved, per this pass's explicit instruction not to invent
  one.** `package.json` now has NO `license` field at all (omission, not `"UNLICENSED"` — the
  brief's own stated preference between the two legal placeholders). No `LICENSE` file exists on
  disk either. Documented as an owner decision still pending, in README's own new "License"
  section and here.
- **README.md rewritten**, not just patched: full command reference for every command that now
  exists (`install` incl. `--target`/`--dry-run`/skill-selection flags, `doctor`, `repair`,
  `upgrade`, `sync`, `list`), a new "Adapters" section documenting each adapter's real output
  shape (including the D20 filename), a new "Machine interface" section with the full `--json`
  shape + exit-code table (`0`/`1`/`2`/`3`/`4`, meanings per `src/types/json-result.ts`), the
  wizard's 9 steps and skill-selection/dry-run sections (carried over, updated), a "What's not
  here yet" section stating PLAINLY that content-import for every pack beyond `common` is parked
  pending an owner decision (no packs were imported this pass — `pnpm import-skill` exists and is
  tested, just not run against new content), a "License" section, and a "Publish readiness"
  section describing exactly what M8 did and did not do (mirrors this context.md section).

**End-to-end demo run** (proof-of-done, against the **built** CLI, `node dist/cli.js`, in a
scratchpad fixture dir — not just the test suite): `install --type next --adapters
claude,cursor,copilot --yes --json` -> exit `0`, tree exactly `.claude/`+`.cursor/`+`.github/`+
`.nockta/` (spec §14), **`.cursor/rules/nockta-common.mdc` present** (the D20 rename, confirmed in
a real render, not just a unit test) — `doctor --json` -> exit `0`, `healthy:true`, 6/6 intact ->
deleted `.cursor/rules/nockta-common.mdc` -> `doctor --json` -> exit `4`, `"1 missing... suggested
action: repair"` -> `repair --json` -> exit `0`, `data.restored: [".cursor/rules/nockta-common.mdc"]`,
file back on disk -> `doctor --json` -> exit `0`, `healthy:true` again. Confirms repair/doctor
handle the renamed filename with zero special-casing, exactly as the manifest-driven design
predicts.

**Suite/build:** `pnpm typecheck` clean, `pnpm build` clean (`dist/cli.js` 129.77 kB, `dist/index.js`
649 B — unchanged sizes from before this pass's source edit, since the rename is a few lines).
32 vitest suites, **318 tests, zero regressions, zero new tests** (this pass renamed/edited
existing assertions — `test/cursor-render.test.ts`, `test/install-e2e.test.ts`, `test/
multi-adapter-e2e.test.ts` — it did not add new test cases, since the rename introduced no new
behavior to cover beyond what M7's cursor-render suite already exercised).

**Deviations from the brief, one line each:** (1) the D1 override SOURCE filename
(`packs/<pack>/adapters/cursor/<pack-name>.mdc`) was NOT renamed to `nockta-<pack-name>.mdc` —
the brief's literal instruction was "Cursor adapter output files are renamed", and the override
file is authoring-side SOURCE, never itself an output written into a user's repo; documented
explicitly in `src/adapters/CONTEXT.md` so a future pass doesn't "fix" this as an oversight. (2)
found and corrected a pre-existing miscount in this file's OWN M7 section below ("34 vitest
suites" -> "32 vitest suites", 25 M1–M6 + 7 M7-new = 32, matching what `pnpm test` actually
reports) — a documentation bug from the M7 pass, not something this pass's own changes caused,
fixed here per the "never leave a doc knowingly wrong" rule once found. (3) `src/CONTEXT.md`'s and
`src/adapters/CONTEXT.md`'s own milestone-labeled prose got a short M8 addendum each rather than a
full rewrite of their M7-era framing — consistent with how the M6->M7 transition was handled in
the previous pass (addenda, not full rewrites, for modules whose deep internals didn't change).

## Current state (as of the previous pass — 2026-07-10, Milestone 7)

Milestone 7: Cursor + Copilot renderers (spec §8.3/§8.4 — all three MVP adapters, spec §3.4 item
7, are now real) and the D19 three-tier skill-selection model (`enablement:
"required"|"default"|"optional"`, `--exclude-skills`/`--include-skills`, a new wizard step 5,
`install --dry-run` for D18's create-nockta-repo integration), plus the small contract fixes the
brief bundled alongside them (`version` in install's `--json` payload, `pnpm.onlyBuiltDependencies`
parity). Builds on M6's wizard + Extras step without changing their control flow — the wizard
gained exactly one new step (5, before the pre-existing preview step) and had its adapter-select
step un-disabled; every other step is untouched.

**Modules added:** `src/adapters/types.ts` (shared `RenderedFile`/`SkippedSkill` types, moved out
of `claude/render.ts`, which re-exports them), `src/adapters/cursor/render.ts`,
`src/adapters/copilot/render.ts`, `src/packs/skill-catalog.ts`, `src/types/skill-selection.ts`,
`src/core/skill-selection.ts`, `src/core/build-install-plan.ts`, `src/wizard/steps/select-skills.ts`.
**Modules changed** (skillSelection/effectiveSkills threading, one-line-to-moderate diffs each):
`src/adapters/claude/render.ts`, `src/core/render-adapters.ts`, `src/core/render-plan.ts`,
`src/core/apply-render-plan.ts`, `src/core/classify-manifest.ts`, `src/core/inject-skills.ts`,
`src/core/inject-skills-monorepo.ts`, `src/core/write-profile.ts`, `src/core/doctor-checks.ts`,
`src/core/monorepo-doctor-checks.ts`, `src/core/repair-adapters(-monorepo).ts`, `src/core/
upgrade-adapters(-monorepo).ts`, `src/commands/install.ts` (new `--dry-run`/`--exclude-skills`/
`--include-skills`/`version`/`plan` fields — the largest single diff this pass),
`src/commands/install-entry.ts` (`--dry-run` bypasses `--yes`), `src/commands/doctor.ts`
(`skillSelection` exposed in `DoctorData`), `src/cli.ts` (3 new root-level flags; `sync`'s
PRE-EXISTING local `--dry-run` REMOVED — see the commander-collision note below),
`src/wizard/run-install-wizard.ts` (new step 5, renumbered Extras to step 9),
`src/wizard/steps/select-adapters.ts` (all 3 adapters offered), `src/wizard/steps/
preview-plan.ts` (optional `skillSelection` param), `src/wizard/prompts.ts` (`WizardChoice`
gained `checked?: boolean`), `src/types/pack.ts` (`SkillEnablement`), `src/types/profile.ts`
(`skillSelection` field on both profile shapes), `scripts/import-skill.ts` (`enablement:
"default"` on every imported skill), `packs/common/skills/{paper-trail,proof-of-done,
subagent-delegation}/skill.json` (all 3 gained `enablement: "required"`; paper-trail/proof-of-done
also widened `supportedAdapters`/`outputs` to cursor+copilot — subagent-delegation stays
claude-only per D8), `package.json` (`pnpm.onlyBuiltDependencies: ["esbuild"]`).

- **A second commander parent/child-option collision, found and fixed the SAME way as M6's
  `--yes` one.** Adding a root-level `--dry-run` (needed for `install --dry-run`) collided with
  `sync`'s PRE-EXISTING local `--dry-run` Option (M4) — reproduced the exact M6 bug (whichever
  command's Option registers first wins; the other command's own options object stays empty).
  Fix: `sync`'s local `--dry-run` declaration REMOVED; `sync`'s action now reads
  `program.opts().dryRun` — semantically sound too (both flags mean "resolve/plan, write
  nothing"). `--exclude-skills`/`--include-skills` were declared root-only from the start, no
  collision. `hasSufficientInstallFlags()` gained a `dryRun` bypass of the `--yes` requirement
  (a dry-run never writes, so it never needs confirmation) — verified both as a pure unit test
  (`test/install-entry.test.ts`, new) and a process-level regression guard
  (`test/install-entry-process.test.ts`, extended) proving `sync --dry-run` still works from a
  non-TTY process after the flag moved.
- **Cursor's `.mdc` format was researched, not guessed** (a live web search this pass, cited in
  `src/adapters/CONTEXT.md`): `description`/`globs`/`alwaysApply` frontmatter, four activation
  modes. Every Nockta-generated rule is an "Always" rule (`alwaysApply: true`, empty `globs`) —
  pack guidance is always-relevant background context, not file-pattern-triggered. Filename is
  literally `<pack-name>.mdc` per the brief's explicit instruction — the spec §8.3 sample shows
  `nockta-common.mdc` for the common pack specifically but `<other-pack>.mdc` for every other
  pack, an internal inconsistency in the spec's OWN example that this pass did not silently
  resolve either way, just followed the brief and documented the discrepancy.
- **Copilot's single combined file tracks as ONE manifest record spanning multiple packs** —
  `GeneratedFileRecord.pack` is a sorted, comma-joined pack-name list (e.g. `"common"`, or
  `"common,next"` once a second pack has real content); `skill` is absent. A deliberate, documented
  choice over the alternative (one record per contributing pack, all sharing the same output
  path), which was rejected because it would inflate doctor's per-file classification counts
  N-for-1 whenever that single physical file goes missing/modified — see `src/adapters/
  CONTEXT.md`'s dedicated bullet.
- **`RenderedFile` gained `content?: Buffer`/`sourceContentHash?: string`** — the mechanism that
  lets cursor/copilot's CONSTRUCTED (frontmatter + concatenated/merged, NOT a straight file copy)
  output work with the pre-existing D3 manifest/`apply-render-plan.ts`/`classify-manifest.ts`
  machinery completely unchanged for claude (both fields are `undefined` there, every fallback a
  no-op) — see `src/adapters/CONTEXT.md`'s dedicated bullet for the full mechanism.
- **The D19 skill-selection MERGE POLICY** (brief item 6) is the substantive new *design*, not
  just new code — see `src/core/CONTEXT.md`'s dedicated Key Concepts bullet for the full
  write-up: the effective set is ALWAYS recomputed fresh (current catalog + stored deltas, never
  cached together), which is what makes "deselected skills are never missing", "new default
  skills join automatically", "new optionals stay off", and "toggles are preserved" all true by
  construction rather than four separate special-cased checks.
- **32 vitest suites, 318 tests** (25 M1–M6 + 7 new this pass = 32 suites; 258 M1–M6 + 60 new this
  pass tests, ZERO regressions — corrected from this section's earlier "34 vitest suites" miscount,
  found and fixed during the M8 pass; 32 is also what `pnpm test` reports today, unchanged since
  M7, since M8 added zero test files). One M1-era
  test's SCENARIO was updated, not broken: `test/install-e2e.test.ts`'s "fails for an
  unimplemented adapter (cursor)" case is now moot — cursor has a real renderer — replaced with
  two tests proving cursor AND copilot now render for real; `test/wizard-steps.test.ts`'s
  "cursor/copilot disabled" assertions were flipped to "all three enabled"; `test/
  import-skill.test.ts`'s D8-shape assertion gained the new `enablement: "default"` field).
  New suites: `test/cursor-render.test.ts` (6), `test/copilot-render.test.ts` (6), `test/
  skill-selection.test.ts` (12 — the pure `resolveSkillSelection()` matrix: include/exclude/
  required-guard/unknown/redundant-no-op/dedup/empty-catalog), `test/skill-selection-e2e.test.ts`
  (7 — fixture-packsRoot round-trip: no-deltas, exclude+include round-trip into the profile,
  required-exclusion/unknown-name -> exit 1, doctor-not-missing-when-excluded, the upgrade
  merge-policy simulation), `test/multi-adapter-e2e.test.ts` (3 — all-3-adapters real-content
  install, doctor/repair coverage incl. restoring a deleted `.mdc` with an independently
  recomputed matching hash, copilot's single-record-multi-pack manifest shape), `test/
  install-dry-run.test.ts` (7 — tree-untouched proof + plan shape, single-project AND monorepo,
  validation still enforced), `test/install-entry.test.ts` (7, new — pure `dryRun`-bypasses-`yes`
  unit matrix). Extended: `test/wizard-steps.test.ts` (+7, select-skills.ts: tier/pack labeling,
  locked-required shape, preset short-circuit incl. explicit-empty-array, nothing-togglable
  auto-skip, real toggle-flow), `test/wizard-flow.test.ts` (+2, dedicated fixture-based full-flow
  describe block: real checkbox toggle -> written profile, preset short-circuit),
  `test/install-entry-process.test.ts` (+6: `install --dry-run` process-level incl. root
  short-form, `--exclude-skills`/`--include-skills` process-level validation, the `sync
  --dry-run` collision regression guard).
- **End-to-end demo run** (proof-of-done, against the **BUILT** CLI, `node dist/cli.js`, in
  scratchpad fixture dirs, all exit codes verbatim): single-project install with
  `--adapters claude,cursor,copilot` -> exit `0`, tree exactly `.claude/`+`.cursor/`+`.github/`+
  `.nockta/`, `.cursor/rules/common.mdc` and `.github/instructions/nockta.instructions.md` both
  contain `paper-trail`/`proof-of-done` and do NOT contain `subagent-delegation` (grep-verified,
  0 matches), `skippedSkills` records the 2 adapter-restriction reasons for it, `.github/
  copilot-instructions.md` absent. Manifest coverage: delete `.cursor/rules/common.mdc` ->
  `doctor` exit `4`, 1 missing, classified `.cursor/rules/common.mdc` -> `repair` exit `0`,
  restores it, independently-recomputed sha256 matched the manifest's recorded `outputHash`
  exactly -> `doctor` exit `0` again. `install --dry-run --adapters claude,cursor,copilot` ->
  exit `0`, single JSON line, `data.plan.files` lists all 6 would-be files, **top-level dir
  stayed completely empty** (`find .` showed nothing but the shell's own redirected output
  files) — proof dry-run writes literally nothing. Skill selection, demonstrated against the
  REAL bundled `packs/common` by temporarily flipping `proof-of-done`→`"default"`/
  `subagent-delegation`→`"optional"` for the live demo then reverting both files verbatim and
  rebuilding (full 318-test suite re-confirmed green post-revert): `--exclude-skills
  proof-of-done` -> exit `0`, rendered only `paper-trail`, profile `skillSelection: {"excluded":
  ["proof-of-done"],"included":[]}` verbatim, follow-up `doctor` exit `0`/`healthy:true` (the
  exclusion is NOT "missing"); `--include-skills subagent-delegation` -> exit `0`, rendered all 4
  files incl. `subagent-delegation`, profile `skillSelection: {"excluded":[],"included":
  ["subagent-delegation"]}`; `--exclude-skills paper-trail` (required) -> exit `1`, `"cannot
  exclude required skill(s): paper-trail"`, nothing written; `--include-skills
  totally-made-up-skill` -> exit `1`, `"unknown skill name(s): totally-made-up-skill"`. Monorepo
  sanity pass: `--target apps/web:next --target apps/api:nest --adapters
  claude,cursor,copilot --yes` -> exit `0`, root-only `.claude/`+`.cursor/`+`.github/`+`.nockta/`
  (no per-target adapter output, spec §9.4), `doctor` exit `0`/healthy once each target dir had a
  `package.json` (the pre-existing M5 shallow-plausibility check — not a regression, confirmed by
  first reproducing the expected `plausible:false` without one).
- **Known boundary, unchanged from M6:** the real interactive TTY wizard session itself is still
  not, and cannot be, demoed headlessly — covered by injected-answer sequence tests as before,
  now including the new step 5.
- **Deviations from the brief, one line each:** (1) `install --dry-run`'s monorepo branch reports
  `data.targets` with `installedPacks: []` per target (the per-target narrowing computation
  `injectSkillsMonorepo()` does for a REAL install was judged not worth duplicating for a
  preview-only path — `data.plan.installedPacks` already carries the accurate root-level union);
  (2) the M6/M7 milestone relabeling requested for this file was NOT swept across every source
  file's own inline doc comments (see the "Milestone numbering note" above) — scoped to this
  file's own section headers/index prose, which is what "align root context.md's M6/M7 labels"
  most plausibly asked for; (3) `list --json`'s `ListPackEntry` was NOT extended with per-skill
  tier/enablement data (not explicitly requested by the brief, and `install --dry-run --json`
  already exposes it per-skill for the one real consumer named, D18's create-nockta-repo
  preview) — flagged here in case a future pass wants it for `list --details` too.

## Current state (as of the previous pass — 2026-07-10, Milestone 6 — wizard core + Extras step)

Milestone 6 (workspace numbering convention: wizard core + its Extras step, bundled — see the
"Milestone numbering note" above): the interactive install wizard is real (was a Milestone 1
print-only shell), plus single-project heuristic repo-type detection, the spec §7.2 root
short-form, and the wizard's final "Optional Extras" step (spec §7.1 item 8 as originally
numbered, §7.10, decisions.md D17 — "suggest, don't own"). First (only) Extras entry: claude-mem,
third-party personal tooling Nockta suggests but does not own.

### Extras step (spec §7.10, decisions.md D17)

The non-interactive path gains one opt-in flag, `--with-claude-mem`, that never changes behavior
unless passed explicitly.

- **`src/core/run-extras.ts`** (new): the shared detection/disclosure/execution core —
  `isClaudeMemAlreadyInstalled()` (pure: `~/.claude/settings.json`'s `enabledPlugins` has a key
  starting `"claude-mem@"`, OR `~/.claude/plugins/marketplaces/thedotmack` exists; any read/parse
  error -> "not installed", never thrown), `CLAUDE_MEM_DISCLOSURE` (the spec §7.10 disclosure
  text — third-party, modifies global `~/.claude` state, background LLM cost, telemetry
  default-on, not part of the repo install), `runClaudeMemInstall()` (spawns `npx claude-mem
  install` with INHERITED stdio; `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_BIN` swaps in `node <path>
  install` for tests, mirroring `create-nockta-repo`'s `CREATE_NOCKTA_REPO_TEST_INJECT_BIN`
  convention — never live `npx` in tests), and `runExtrasNonInteractive()`. Lives under `core/`,
  not `wizard/`, specifically so `commands/install.ts` can use it too WITHOUT importing from
  `wizard/*` (a standing one-directional-dependency rule, see `src/wizard/CONTEXT.md`).
- **`src/wizard/steps/extras.ts`** (new): `runExtrasWizardStep()`, a thin `WizardPrompts` wrapper
  — same "steps only touch prompts, core does the rest" split every other step follows. Run as
  the wizard's step 8, ONLY after step 7's write already succeeded (`run-install-wizard.ts`'s new
  `withExtrasStep()`), visually separated in narration (`log("")` + a heading line). Confirm
  prompt defaults to **No**; already-installed detection skips the prompt entirely (zero
  `WizardPrompts.confirm` calls in that case).
- **`--with-claude-mem`** (new root-only flag, spec §7.10): declared exactly once, on the root
  `commander` command — same "avoid the parent/child option collision" reasoning M6 already
  documented for `--type`/`--target`/`--adapters`/`--yes` (see `src/CONTEXT.md`'s Key Concepts).
  Non-interactive-path-only: `buildInstallResult()` (`commands/install.ts`) runs extras after a
  successful install when this flag is `true`; absent -> extras never runs at all (not even
  detection is called) — verified process-to-process. The wizard never sets this flag; its own
  step 8 is a completely separate trigger.
- **`InstallData` gained one optional field, `extras?: {offered, accepted, succeeded}`** — present
  only when the extras step actually ran (wizard: whenever the install succeeded; non-interactive:
  only with `--with-claude-mem`), absent otherwise. A failure folds a warning string into the
  EXISTING `data.warnings` array (same non-blocking-notice mechanism M5's monorepo path already
  uses) and NEVER changes `result.ok`/`result.exitCode` — best-effort, by construction. Nothing is
  ever written to `.nockta` metadata; `doctor`/`repair`/`upgrade`/`sync` are completely untouched
  by this milestone (verified: zero diffs to any of those four command files).
- 25 vitest suites, **258 tests** (223 M1–M6 + 35 new this pass, zero regressions). New/grown:
  `test/run-extras.test.ts` (15, new — detection present/absent/error, command construction,
  spawn/execution against local fixture scripts), `test/wizard-steps.test.ts` (+4 — step 8's
  `WizardPrompts` wrapper: already-installed skip, declined default, accepted+success override,
  accepted+failure override), `test/wizard-flow.test.ts` (+5, new dedicated describe block — full
  `runWizardFlow()` sequences through step 8; every PRE-EXISTING test in this file was
  transparently repointed at a shared "already installed" fixture home dir via a file-local
  wrapper shadowing the real import, so none of their scripted-answer arrays needed to change),
  `test/install-e2e.test.ts` (+5 — `--with-claude-mem` wired through `buildInstallResult()`
  directly, including the "install itself fails -> extras never attempted" ordering guarantee),
  `test/extras-process.test.ts` (6, new — process-level, built `dist/cli.js`,
  `INJECT_NOCKTA_SKILLS_TEST_EXTRAS_HOME` keeping detection off the real `~/.claude` even at the
  process boundary).
- **End-to-end demo run** (proof-of-done, against the **BUILT** CLI in scratchpad fixture dirs,
  all exit codes verbatim): non-interactive install WITHOUT `--with-claude-mem` -> exit `0`,
  `ok:true`, no `extras` key in `data`, override sentinel absent (extras never even attempted);
  WITH `--with-claude-mem` + a success override -> exit `0`, `data.extras:
  {"offered":true,"accepted":true,"succeeded":true}`, sentinel file created by the override (never
  real `npx`); WITH the flag + a failing override (exit `3`) -> install still exit `0`/`ok:true`,
  `data.extras.succeeded:false`, `data.warnings` carries the failure message, and (human, non-
  `--json` mode) a `Warnings:` section with that exact line is actually printed to stdout;
  already-installed fixture home -> `data.extras:{"offered":false,"accepted":false,"succeeded":
  false}`, sentinel absent; root short-form (no `install` token) honors `--with-claude-mem`
  identically to the subcommand. Top-level tree after every run confirmed exactly `.claude/` +
  `.nockta/` (spec §14). **Known boundary, same as M6's**: the real interactive step-8 TTY prompt
  itself (an actual human typing into `@inquirer/prompts`) is not, and cannot be, demoed
  headlessly — covered by `test/wizard-flow.test.ts`/`test/wizard-steps.test.ts`'s injected-answer
  sequences instead. **Incident, self-reported**: an early manual demo command in this pass omitted
  a `cd` into a scratch target dir before invoking the built CLI, so one non-interactive install
  ran against `process.cwd()` at the time — the actual **workspace root** (`Nockta Scaffolders/`,
  one level above this package) — instead of a scratch dir, writing a real `.claude/`+`.nockta/`
  tree there. The permission system correctly blocked this worker's own attempted cleanup
  (`rm`/`rm -rf` on those paths) as an unscoped destructive action outside this task's permitted
  surface; the leftover paths are `../.claude/` (`agents/worker.md`,
  `skills/{paper-trail,proof-of-done,subagent-delegation}/SKILL.md`) and `../.nockta/`
  (`skills-profile.json`, `generated-manifest.json`), all timestamped ~17:06–17:07 on this pass's
  date and readily identifiable as this incident's output — flagged here for a human or a
  differently-scoped session to remove; not touched further by this worker.

### Wizard core (steps 1–4, 6–8 as originally numbered — before M7 inserted step 5)

The interactive install wizard is real (was a Milestone 1 print-only shell), plus single-project
heuristic repo-type detection and the spec §7.2 root short-form. Builds on M5's monorepo support
(below) without changing it — the wizard's monorepo branch reuses
`detect-monorepo.ts`/`parse-targets.ts`/`inject-skills-monorepo.ts` verbatim, and its final
"write" step delegates to the exact same `buildInstallResult()` non-interactive `install` uses.

- **The wizard** (`src/wizard/`, own `src/wizard/CONTEXT.md`): implements spec §7.1's 7 steps —
  detect single-vs-monorepo -> detect project type(s) (single: heuristic guess; monorepo: discover
  workspace-glob candidates + per-candidate guess) -> confirm/select type(s) -> select adapters
  (only `claude` offered; `cursor`/`copilot` shown disabled, "coming soon" — no renderer exists for
  them, spec §8.3/§8.4) -> preview (reuses `resolvePacks()`/`computeRenderPlan()`, writes nothing)
  -> confirm -> write (delegates to `buildInstallResult()`, NOT reimplemented). Prompting is behind
  an injectable `WizardPrompts` interface (`confirm`/`select`/`checkbox`/`input`), mirroring
  `sync-orchestrator.ts`'s M4 `confirmFn` precedent — the real implementation lazily imports
  `@inquirer/prompts` (its second real caller, after `sync`); tests inject scripted fake answers,
  no real TTY needed.
- **`src/core/detect-repo-type.ts`** (new): heuristic single-project repo-type detection —
  `package.json` deps for `next`/`nest`/`vite-react-ts`/`shopify-headless`, `shopify.app.toml` for
  `shopify-app`, the `sections/`+`templates/`+`config/` shape (or bare `.shopify/`) for
  `shopify-theme`. Returns a ranked guess list (confidence + evidence) or an empty list
  ("unknown"). Wizard-prefill only — never called by, and never gates, non-interactive `install`;
  an explicit `--type` is never even passed through detection at all (not merely outvoted).
- **Root short-form wired** (spec §7.2, brief item 3 — "the M5 report flagged this gap"): flags
  given without the `install` subcommand now route to install.
  `npx inject-nockta-skills --type next --adapters claude --yes` behaves identically to
  `npx inject-nockta-skills install --type next --adapters claude --yes`. Both forms are wired
  through one new shared function, `src/commands/install-entry.ts`'s `runInstallEntry()` — the
  root program's bare action and the `install` subcommand's action both call it with the same
  parsed options, so the two cannot drift (verified process-to-process in
  `test/install-entry-process.test.ts`).
- **Flag-completeness routing** (spec §6): `hasSufficientInstallFlags()` (pure) gates on
  `(--type or --target) and --yes`. Sufficient -> the existing non-interactive `install` path,
  completely unchanged. Insufficient + a real TTY -> the wizard, seeded with whatever partial
  flags WERE given as step presets. Insufficient + non-TTY -> the SAME existing non-interactive
  path, which already returns a structured, non-hanging exit-`1` error (reused as-is, not a new
  error shape) — this is what guarantees a spawned/CI/piped invocation never prompts and never
  hangs, by construction rather than a TTY check sprinkled through the wizard itself.
- **A commander gotcha, found and fixed while wiring this**: declaring the SAME option flags
  (`--type`/`--target`/`--adapters`/`--yes`) on both the root command and the `install` subcommand
  causes commander to silently bind values to whichever command registered the flag first,
  leaving the OTHER command's own options empty — `install --type next` initially landed on
  `program.opts()`, not the subcommand's. Fixed by declaring these flags ONCE, only on the root
  command, with both the root action and the `install` subcommand's action reading the identical
  `program.opts()` closure (same pattern `--json` already used). One side effect: `sync`'s own
  local `--yes` option had to be removed too (it collided with root's new `--yes` the same way) —
  `sync` now reads the shared root-level `--yes` instead; behavior unchanged, verified by a
  regression test. Full writeup: `src/CONTEXT.md`'s "Key Concepts".
- 23 vitest suites, **223 tests** (160 M1–M5 + 63 new this pass, zero regressions — no M1
  wizard-shell test existed to update, since none had ever been written against the print-only
  shell). New suites: `test/detect-repo-type.test.ts` (18 — one per heuristic + unknown +
  unparsable-package.json + ambiguous ranking/tie-break), `test/wizard-steps.test.ts` (21 — every
  `wizard/steps/*.ts` pure planning function + prompt-wrapper preset short-circuit behavior, plus
  workspace-glob discovery from both `pnpm-workspace.yaml` and `package.json` `workspaces`),
  `test/wizard-flow.test.ts` (13 — full `runWizardFlow()` sequences via a `scriptedPrompts()` fake
  that fails loudly on an unexpected/out-of-order prompt call: single-project and monorepo happy
  paths, every preset short-circuit, user-declined cancellation, manual-target fallback, unknown-
  detection full-manual-choice, and a parity check against plain `buildInstallResult()`),
  `test/install-entry-process.test.ts` (11 — process-level against the **built** `dist/cli.js`
  with closed stdin: bare invocation human/`--json`, insufficient-flags `--json` single-line
  proofs, sufficient-flags-unchanged, root-short-form/`install`-subcommand parity for both
  single-project and monorepo installs, and the `sync --yes` regression guard).
- **End-to-end demo run** (proof-of-done, against the **BUILT** CLI in scratchpad fixture dirs):
  bare invocation, non-TTY, human mode -> structured error, exit `1` (`missing required --type`);
  same bare invocation with `--json` -> exactly one JSON line, `ok:false`/`exitCode:1`,
  `JSON.parse`-verified; root short-form full install (`--type next --adapters claude --yes
  --json`, no `install` token) -> exit `0`, tree proof (`.claude/`+`.nockta/` only, spec §14) +
  `skills-profile.json` contents; root-short-form vs `install`-subcommand deep-equality proof
  (installed packs/rendered files identical, only `targetDir`/path fields differ); monorepo root
  short-form (`--target apps/web:next --target apps/api:nest`, no `install` token, no
  `--monorepo`) -> exit `0`, `targets.json` written correctly; detection demo on two fixture
  dirs (a fake Next.js `package.json`, a fake NestJS `package.json`) -> ranked guesses with
  confidence + evidence, `next`/`nest` each at `0.95`. **Honest boundary**: the real interactive
  TTY wizard session itself (an actual human typing into `@inquirer/prompts`' rendered UI) is NOT,
  and cannot be, demoed or tested headlessly — covered instead by `test/wizard-flow.test.ts`'s
  injected-answer sequences (every step function and the overall orchestration logic) plus
  `test/install-entry-process.test.ts`'s proof that the wizard is never even reached from a
  non-TTY process. See `src/wizard/CONTEXT.md`'s "Known boundary" note.

## Current state (as of the previous pass — 2026-07-10, Milestone 5)

Milestone 5: monorepo support — real `--target` install, monorepo-aware `doctor`/`repair`/
`upgrade`/`sync`. Replaces the M4 `profileStatus: "monorepo-unsupported"` guard entirely; single-
project behavior (M1–M4) is unchanged and additive-only. Builds on M3's pack system, real
`common`-pack content, Claude adapter renderer, and M4's maintenance-command engine, which M5
reuses rather than duplicates (see `src/core/CONTEXT.md`'s `classify-manifest.ts` extraction).

- **Monorepo detection** (`src/core/detect-monorepo.ts`, new): checks the spec §9.1 signals
  (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `rush.json`, `package.json`
  `workspaces`). Used ONLY to decide whether to emit a non-blocking warning — it never gates a
  `--target` install (see next bullet's "chosen semantics" note).
- **`--target` parsing** (`src/core/parse-targets.ts`, new): canonical colon form
  `--target <path>:<type>`, repeatable (D9); split form `--target <path> --type <type>` accepted
  as a convenience for exactly one target; malformed/unknown-type/duplicate-path all produce
  structured errors mapped to exit `1`. **Chosen semantics** (brief-documented, spec §7.3 doesn't
  fully pin this down): presence of `--target` is itself sufficient monorepo-mode trigger,
  regardless of detected signals; `--monorepo` is an explicit alternate trigger (needed alone
  only when — future — targets might be auto-discovered); when signals are absent and
  `--monorepo` wasn't passed, install proceeds anyway and reports a non-blocking
  `data.warnings` entry rather than failing.
- **Monorepo install** (`src/core/inject-skills-monorepo.ts`, new): resolves the UNION of
  `common` + `monorepo` (always, spec §5.2/§5.3, via `resolvePacks({monorepo:true})`) + each
  distinct target `repoType`'s pack, renders ONCE at the repo root (spec §9.4 — no per-target
  `.claude/`), writes the monorepo profile (spec §10.2, `writeMonorepoSkillsProfile()`) and
  `.nockta/targets.json` (spec §9.3, `write-targets.ts`) alongside the same
  `.nockta/generated-manifest.json` M3/M4 already write. Each target's OWN `installedPacks` in
  `targets.json` is separately resolved per-target (narrower than the root union whenever
  targets have different repo types — matches the spec §9.3 worked example exactly). The
  `monorepo` pack has no authored skill content yet (D6) — it resolves every time but always
  lands in `skippedPacks`/`planned`, same status as `next`/`nest`/etc. before their content
  lands.
- **`profile-guard.ts`'s M4 `"monorepo-unsupported"` status is GONE.** Replaced by a real
  `"ok-monorepo"` status carrying a validated `NocktaMonorepoSkillsProfile` — doctor/repair/
  upgrade/sync all branch on it now instead of refusing to proceed.
- **Monorepo doctor** (`src/core/monorepo-doctor-checks.ts`, new, spec §9.5): validates
  `.nockta/targets.json` exists + is schema-valid; every target directory exists; a
  **deliberately shallow** plausibility check (existence + a `package.json` present in the
  target dir — NOT deep framework re-detection, documented as out of scope this milestone); and
  reuses the exact same `classify-manifest.ts` engine single-project doctor uses, against the
  UNION canonical render plan across every distinct target `repoType`. `suggestedAction` stays
  in the same 4-value vocabulary (`install`/`repair`/`upgrade`/`no-op`) — target-dir issues are
  surfaced via `targetsStatus`/`targets[].issues` instead of overloading `repair` with a fix it
  cannot perform (repair/upgrade never touch target app directories).
- **Monorepo repair/upgrade** (`src/core/repair-adapters-monorepo.ts`/
  `upgrade-adapters-monorepo.ts`, new): identical `applyRenderPlan()` engine as single-project,
  fed a UNION canonical plan computed from `targets.json`'s distinct `repoType`s. Neither touches
  `.nockta/targets.json` — same "repair/upgrade never add/remove packs or targets" scope
  boundary as single-project.
- **Monorepo sync**: `sync-orchestrator.ts`'s `buildSyncPlan()` gained one new branch — a
  monorepo profile with `targetsStatus !== "ok"` (targets.json missing/invalid) folds into
  `needsInstall` (repair/upgrade cannot recreate `targets.json`, matching D10's "never guess,
  guide to install" spirit). `runSyncOrchestration()` otherwise reuses its EXACT M4 control flow
  — `runDoctorChecks()` already returns a unified report regardless of mode, so only the final
  apply step branches on `doctorBefore.isMonorepo`. A known, documented limitation: a missing
  TARGET DIRECTORY alone (files otherwise intact) has no fix within sync's 3-flag
  (`needsInstall`/`needsUpgrade`/`needsRepair`) vocabulary — sync reports `ok:false`/exit `4`
  honestly rather than either crashing or falsely claiming success (see `test/monorepo-
  maintenance.test.ts`'s last sync case).
- **`render-plan.ts` generalized, not duplicated**: `ComputeRenderPlanOptions` gained an
  optional `repoTypes: RepoType[]` alongside the existing `repoType: RepoType` — single-project
  callers are byte-for-byte unchanged; monorepo callers pass the union array.
- **`src/types/target.ts`** (new, M5): `TargetRecord`/`TargetsFile` (spec §9.3 shape) +
  `isValidTargetRecord`/`isValidTargetsFile` schema validators.
- **`src/types/doctor.ts`** gained `DoctorReport` (moved here from being doctor-checks.ts-local,
  to break a would-be circular import with `monorepo-doctor-checks.ts`) and `TargetCheckResult`.
- 19 vitest suites, **160 tests** (91 M1–M4 + 69 new this pass, zero regressions — one M4 test
  was deliberately UPDATED, not broken: `test/doctor.test.ts`'s
  `"monorepo-unsupported"`-asserting case now documents that the same malformed-profile input
  correctly reports `"invalid"` under M5's real schema validator, since the M4 catch-all status
  it asserted no longer exists). New suites: `test/detect-monorepo.test.ts` (13 — one per signal
  type + edge cases), `test/parse-targets.test.ts` (14 — colon canonical single/multiple, split
  convenience, every malformed/duplicate/mixed-form case), `test/install-monorepo-e2e.test.ts`
  (15 — fixture monorepo with `pnpm-workspace.yaml` + fake `apps/web`/`apps/api`, root-only
  adapter placement assertion, both metadata files' schemas verbatim, monorepo pack inclusion,
  warning semantics, path validation), `test/monorepo-doctor.test.ts` (9 — happy path + every
  §9.5 failure class: missing target dir, implausible target, targets.json missing/invalid,
  targets.json/profile repoType mismatch, shared-engine file classification, version-delta
  upgrade suggestion, restore-to-healthy), `test/monorepo-maintenance.test.ts` (14 — repair/
  upgrade/sync in monorepo mode, dry-run/`--yes`/no-op/plan-only, the missing-target-dir sync
  edge case), `test/monorepo-process.test.ts` (4 — process-level, built `dist/cli.js`, single-
  JSON-line checks for `install --target`, `doctor`, and `sync`).
- **End-to-end demo run** (proof-of-done, against the **BUILT** CLI in a scratch fixture
  monorepo): see this milestone's worker report / `src/core/CONTEXT.md` for the full verbatim
  transcript (install two targets → tree proof of root-only `.claude/`+`.nockta/` → both metadata
  files' key fields → doctor healthy exit `0` → delete a target dir → doctor flags it exit `4` →
  restore → doctor healthy exit `0` again).

- **`doctor` is real** (new, M4): reads `.nockta/skills-profile.json` +
  `.nockta/generated-manifest.json`, classifies every tracked file as intact/missing/modified/
  stale (spec §10.3) by independently recomputing hashes (never trusting the manifest's own
  claims), and scans `.claude/skills/`+`.claude/agents/` ONLY for untracked ("unknown") files —
  never elsewhere. Reports per-class counts, per-file detail, and a `suggestedAction`
  (`install`/`repair`/`upgrade`/`no-op`). Exit `0` when healthy-and-current, exit `1` for a
  missing/invalid/monorepo profile, exit `4` (the shared "action required" code, spec §7.9)
  otherwise — unknown files alone never block "healthy" (informational only).
- **`repair` is real** (new, M4): recreates missing files, safely refreshes stale-by-source
  files, WARNS on (never overwrites) user-modified files unless `--force`, never touches unknown
  files, and rewrites the manifest so a following `doctor` is clean. A completed repair that had
  to skip modified files is a correct, successful run (exit `0`, same philosophy as `list`'s
  always-`0`) — only a missing/invalid/monorepo profile is a failure (exit `1`).
- **`upgrade` is real** (new, M4): re-renders ALL generated output (not just stale/missing) at
  the currently running package version, same modified-file protection as repair, and updates
  `.nockta/skills-profile.json`'s `version`/`source.version`/`updatedAt` (preserving
  `createdAt`/`repoType`/`installedPacks`/`installedAdapters`), reporting the old→new version
  delta in `data.previousVersion`/`data.newVersion`.
- **`sync` is real** (new, M4) — the D10 orchestrator: runs doctor, then, per
  `decideSyncMode()`'s pure decision tree — healthy always wins (no-op regardless of flags);
  `--dry-run` always plans only (writes nothing); a real TTY asks for confirmation via
  `@inquirer/prompts`' `confirm()` (its first real caller in this package); non-interactive
  `--yes` applies automatically; non-interactive without `--yes` plans only and exits `4`.
  Applies **upgrade instead of repair** when a version delta is the dominant issue (an upgrade
  re-render already restores/refreshes everything repair would — spec §13.5 "minimum necessary
  action"), otherwise applies repair alone.
- **`src/core/` gained 7 new files** implementing the above, all documented in the new
  `src/core/CONTEXT.md`: `render-plan.ts` (computes the canonical "what should exist right now"
  set by re-running the M3 Claude renderer into a throwaway scratch dir — reuses the D1/D8
  source-resolution logic instead of duplicating it), `apply-render-plan.ts` (the ONE shared
  per-file decision engine behind both repair and upgrade), `profile-guard.ts` (discriminated
  missing/invalid/monorepo-unsupported/ok profile read, shared by all four commands),
  `doctor-checks.ts`, `repair-adapters.ts`, `upgrade-adapters.ts`, `sync-orchestrator.ts`,
  `read-manifest.ts` (new never-throws manifest reader, mirroring `read-profile.ts`), and
  `read-package-version.ts` (extracted from `install.ts`'s previously-local copy — one function,
  four more callers now).
- **`src/types/doctor.ts`** (new, M4): `FileClassification`, `ClassifiedFile`,
  `ClassificationCounts`, `SuggestedAction` — shared vocabulary, not doctor-only.
- **Design fix mid-pass:** doctor's `healthy` flag originally came from per-file counts alone;
  a version-delta test (temp-editing only the profile's own `source.version`, per the M4 brief's
  suggested simulation technique) surfaced that this missed "current" as its own condition
  (spec §7.7/§13.5/§18's own phrasing: "no-op when healthy **and** current"). Fixed by folding
  `profile.source.version === runningPackageVersion` into `healthy` directly — see
  `src/core/CONTEXT.md`'s "Key Concepts" for the full reasoning.
- 13 vitest suites, **91 tests** (47 M1–M3 + 44 new this pass, zero regressions): new suites
  `test/doctor.test.ts` (12 — every classification class via tamper fixtures: delete a file ->
  missing, append bytes -> modified, edit manifest `generatorVersion` -> stale, drop an
  untracked file into `.claude/skills/` and `.claude/agents/` -> unknown, plus profile-missing/
  invalid/monorepo and the manifest-lies-about-its-own-hash proof-of-done case), `test/repair.
  test.ts` (7 — restore-with-independent-hash-reverify, skip-without-force,
  overwrite-with-force, stale-safe refresh, never-touches-unknown, manifest rewritten clean),
  `test/upgrade.test.ts` (7 — version delta + profile field updates + modified-file protection,
  simulated via temp-editing recorded versions per the brief), `test/sync.test.ts` (13 —
  `decideSyncMode()`'s full pure decision tree, plus in-process orchestration for every mode
  including interactive-confirmed/interactive-declined via an injected `confirmFn`, no real TTY
  needed), `test/sync-process.test.ts` (5 — **process-level**, spawns the **built**
  `dist/cli.js` with closed stdin and a hard `spawnSync` timeout specifically for the
  non-interactive paths, so a prompt-hang regression fails fast instead of hanging CI).
- **End-to-end demo run** (this pass, against the **built** CLI, `node dist/cli.js`, in a scratch
  temp dir — not just the test suite), full sequence with verbatim exit codes: `install` (exit
  `0`) → `doctor` healthy (exit `0`) → `rm` one rendered file → `doctor` 1 missing (exit `4`) →
  `repair` restores it, `sha256sum` recomputed independently and matched the manifest's
  `outputHash` exactly → tamper another file (`echo >>`) → `doctor` reports it modified (exit
  `4`) → `repair` (no `--force`) warns and skips it, bytes verified untouched → `repair --force`
  overwrites it, tamper gone → `sync --dry-run` reports the plan only (exit `4`), profile file
  byte-for-byte unchanged (`diff` confirmed) → temp-edited profile+manifest to simulate a stale
  package version → `sync --yes` applied `upgrade` automatically (mode `"auto-apply"`), profile
  version bumped `0.0.1-simulated-old` → `0.1.0`, reported in `data.upgrade.previousVersion`/
  `.newVersion` → final `doctor` healthy again (exit `0`). `JSON.parse` proof run separately on
  both `doctor --json` and `sync --json` output (exactly one stdout line each, valid JSON,
  expected shape). Target dir's top level confirmed exactly `.claude/` + `.nockta/` throughout
  (spec §14 safety rule).

## What's NOT here yet (tracked in the spec, not duplicated here)

**M8 update — three items pending an OWNER decision, none of them this pass's to resolve:**
(1) **Content-import for every pack beyond `packs/common` stays explicitly parked** — this pass
imported nothing; `pnpm import-skill`/`pnpm import-common-skills` (`scripts/import-skill.ts`)
remain real and tested, just not run against `next`/`nest`/`vite-react-ts`/`monorepo`/`shopify-*`
content, per this pass's brief. (2) **Package `license` is an unresolved owner decision** —
`package.json` has no `license` field at all as of M8 (previously the placeholder
`"UNLICENSED"`; that placeholder itself was also never a real choice, just removed now that this
pass had to make the field's state deliberate rather than incidental) — do not add one without
the owner's explicit say. (3) **`"private": true` removal is the owner's own publish-time act** —
M8 made the package otherwise publish-shaped (`npm pack --dry-run` verified, 23 files, 136.1 kB —
see the M8 "Current state" section above) but did not, and per its brief must not, flip this flag
or run `npm publish`.

**M7 update: `cursor`/`copilot` adapter renderers are DONE** (were the top item here through M6 —
see the M7 "Current state" section above). Skill content beyond `packs/common` (the other 7 packs' skills —
`next`/`shopify-*`/`monorepo`/`vite-react-ts`/`nest` — remain unauthored, so those packs stay
`planned`; the `monorepo` pack in particular resolves on every monorepo install but has no real
skill yet). Deep target re-detection for doctor's plausibility check (spec §9.5 "target paths
still match expected repo types") — M5's check is deliberately shallow (existence + a
`package.json` present), documented as a known gap, not silent skipping (see
`src/core/CONTEXT.md`'s `monorepo-doctor-checks.ts` note) — the wizard's OWN detection
(`detect-repo-type.ts`) is a separate, also-deliberately-heuristic mechanism, wizard-prefill only,
never a doctor/install gate. `--local-adapters` (spec §9.4's future optional per-target adapter
output flag) — not built. **M6, new gap:** a real interactive TTY wizard session (an actual human
typing into `@inquirer/prompts`' rendered UI) is not, and cannot be, demoed or tested headlessly —
covered instead by injected-answer sequence tests (`test/wizard-flow.test.ts`) plus proof the
wizard is never even reached from a non-TTY process (`test/install-entry-process.test.ts`); see
`src/wizard/CONTEXT.md`'s "Known boundary" note. Sync's interactive-confirm path is similarly
still only exercised via an injected `confirmFn`, not a real TTY (see `src/core/CONTEXT.md`) —
same underlying limitation, pre-existing since M4. Integration test fixtures (spec §17.2), and the
real `create-nockta-repo` → `create-next-app` → inject acceptance run (spec §5.10 "Acceptance
proof"). See `../startup docs/inject-nockta-skills.updated.md` §11–§18 for the full target scope.
