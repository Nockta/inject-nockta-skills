# CONTEXT.md — src/

## Purpose

Source of the `inject-nockta-skills` CLI. Entry points, command wiring, the install wizard, the
pack manifest/resolution system, the Claude/Cursor/Copilot adapter renderers, the install AND
maintenance orchestration core, and the small set of public types this package canonically owns.
As of this pass (Milestone 7): `list` (M2), `install` (M3 single-project, M5 monorepo),
`doctor`/`repair`/`upgrade`/`sync` (M4 single-project, M5 monorepo), the interactive install
wizard (M6), and its Extras step (M7) are all real — see `src/core/CONTEXT.md`/
`src/wizard/CONTEXT.md`. **M7 (this pass) adds two more things:** all THREE MVP adapters now
render (`src/adapters/cursor/`, `src/adapters/copilot/`, new — see `src/adapters/CONTEXT.md`),
and the D19 three-tier skill-selection model (`enablement: "required"|"default"|"optional"` in
`skill.json`, `--exclude-skills`/`--include-skills`, a new wizard step 5, `install --dry-run`) —
see `src/core/CONTEXT.md`'s D19 merge-policy write-up and "Key Concepts" below for the exact
flag-declaration mechanics. **M8 (publish preparation):** no command/orchestration behavior
changed — the cursor adapter's output filename gained a `nockta-` prefix (decisions.md D20, see
`src/adapters/CONTEXT.md`), and the package itself became publish-ready (package.json fields,
`npm pack` proof, README) — see root `context.md`'s M8 section. **M9 (this repo's newest pass,
decisions.md D21):** `skill.json` gained a new optional `requires: string[]` field
(`src/types/pack.ts`, `src/packs/read-skill-manifest.ts`) — `core/skill-selection.ts`'s
`resolveSkillSelection()` now resolves the transitive `requires` closure (cycle-detected,
adapter-gated) BEFORE applying D19's tiers, so enabling a skill auto-enables+locks its whole
dependency chain; the wizard's step 5 gained a matching lock/release UX via an iterative
fixed-point reprompt loop. No new commands, no new adapters, no renderer changes (the closure is
fully resolved before `renderAdapters()` is ever called) — see `src/core/CONTEXT.md`'s and
`src/wizard/CONTEXT.md`'s own M9 sections and root `context.md`'s M9 section. **M10 (decisions.md
D22): multi-type targets.** A target/standalone root may now name MULTIPLE repo types — comma
form (`--type next,vite-react-ts`) or colon+plus form (`--target <path>:<a>+<b>`) — resolved to a
union of packs (`RepoType` -> `RepoType[]` at every call site that used to carry a single type;
`resolve-packs.ts` needed no new merge logic, its `requestedPacks` was already Set-resolved).
`detect-repo-type.ts` gained workspace-walking aggregation (`detectRepoTypeAcrossWorkspace()`,
sharing a new `core/workspace-globs.ts` extraction with the wizard's monorepo target discovery);
the wizard's type step became a checkbox multi-select. Profile/targets metadata's `repoType` field
is now `repoTypes: string[]`, with a read-only back-compat shim for a hand-authored/legacy singular
`repoType`. No new commands, no renderer changes. See `src/core/CONTEXT.md`'s and
`src/wizard/CONTEXT.md`'s own M10 sections and root `context.md`'s D22 entry. **Post-M8 (decisions.md
D24): a FOURTH adapter, `agent`.** `AdapterType` gains `"agent"` — a generic root `AGENTS.md`
renderer (`src/adapters/agent/render.ts`) covering Codex/Antigravity-`agy`/Cursor/Zed/Windsurf
(+secondarily Copilot) in one shot, wired into `render-adapters.ts`'s dispatch and the wizard's
adapter step. Same-pass (decisions.md D23): `subagent-delegation` reclassified adapter-portable —
its prose now renders for cursor/copilot/agent, only its `worker.md` agent artifact stays
claude-only. No new commands; `src/core/` untouched beyond the one-block dispatch case. See
`src/adapters/CONTEXT.md`'s and `src/core/CONTEXT.md`'s own D24 sections and root `context.md`'s
D24 entry.

## Dependencies

- `commander` — CLI parsing, subcommand registration, `--help`/`--version`.
- `picocolors` — terminal color for human-readable (non-`--json`) output.
- **`typescript` is pinned to `^5.9.x`** — TypeScript 7.x's native compiler breaks tsup's dts bundling (reproduced during Milestone 1 with rollup-plugin-dts TypeError). Revisit when tsup adds TS7 support.
- **`@inquirer/prompts` has two real callers now.** `sync`'s interactive-TTY path
  (`core/sync-orchestrator.ts`'s `defaultConfirm()`, M4) lazily imports its `confirm()` function.
  M6 adds the second: `wizard/prompts.ts`'s `defaultWizardPrompts` lazily imports `confirm`/
  `select`/`checkbox`/`input`. Both follow the same convention (lazy import, so importing the
  module never requires a TTY) and both are wrapped behind a small injectable interface
  (`confirmFn` for sync; `WizardPrompts` for the wizard) rather than called directly, so neither
  needs a real TTY in tests.
- Node.js >= 20 built-ins only otherwise (`node:fs`, `node:path`, `node:url`, `node:crypto`,
  `node:os`, `node:child_process` — the last only in `test/sync-process.test.ts`). `fs-extra` is
  still installed per spec §16 but still unused — every filesystem path in this package
  (install AND maintenance) deliberately uses `node:fs` directly, matching the built-ins-only
  convention established since `src/packs/*`.
- `src/packs/`, `src/adapters/`, `src/core/`, `src/utils/` all use Node builtins only (`node:fs`,
  `node:path`, `node:url`, `node:os`, `node:crypto`) plus, now, `@inquirer/prompts` in exactly
  one place (above).
- `tsx` (dev-only) — runs `scripts/import-skill.ts` (the pack importer) without a build step;
  never imported by anything under `src/`.

## Dependents

- `dist/cli.js` (built via `tsup`) is the published `bin` entry — what `npx inject-nockta-skills`
  actually runs.
- `dist/index.js` is the package's `main`/`types` entry. Per decisions.md D7/D11.1, no other
  package (notably `create-nockta-repo`) imports this — the only external integration point is
  the CLI process boundary (spawned child process + `--json` contract, D13). `src/index.ts` exists
  for this package's own tests and any future internal reuse.
- `test/cli.test.ts` imports both `src/cli.ts` (`buildProgram`) and `src/index.ts`.
- `test/pack-manifest.test.ts`, `test/resolve-packs.test.ts`, `test/read-skill-manifest.test.ts`
  exercise `src/packs/*` directly, mostly against `mkdtemp` fixture pack trees, not the real
  bundled `packs/`. `test/list-command.test.ts` exercises `buildListResult()` against the real
  bundled `packs/` — as of this pass `common` is `installable`, the other 7 packs are `planned`.
- `test/claude-render.test.ts` exercises `src/adapters/claude/render.ts` against `mkdtemp` fixture
  pack trees (adapter-restriction, override-wins). `test/install-e2e.test.ts` exercises the full
  `src/commands/install.ts` -> `src/core/inject-skills.ts` pipeline against the real bundled
  `packs/common/skills/*` and a `mkdtemp` target dir, including recomputing a generated file's
  sha256 independently and comparing it to the manifest record (D3).
- `test/import-skill.test.ts` exercises `scripts/import-skill.ts` (outside `src/`, see its own
  note in Directory Layout) against a synthetic gathered-skill fixture.
- `test/doctor.test.ts`, `test/repair.test.ts`, `test/upgrade.test.ts`, `test/sync.test.ts` (M4)
  exercise `commands/doctor.ts`/`repair.ts`/`upgrade.ts`/`sync.ts` directly, against real
  bundled `packs/common` installs in `mkdtemp` target dirs, tampered per-scenario (delete/append/
  edit-manifest-field/drop-untracked-file). `test/sync-process.test.ts` (M4) is different in
  kind: it spawns the **built** `dist/cli.js` as a child process (rebuilding it in `beforeAll`)
  specifically for `sync`'s non-interactive paths, with a hard `spawnSync` timeout — see
  `src/core/CONTEXT.md`'s "Key Concepts" for why.
- `test/detect-monorepo.test.ts`, `test/parse-targets.test.ts` (M5, new) unit-test
  `core/detect-monorepo.ts`/`core/parse-targets.ts` in isolation (no filesystem beyond a
  `mkdtemp` fixture for the former; pure string parsing for the latter). `test/install-monorepo-
  e2e.test.ts` (M5, new) exercises the full monorepo install pipeline against a fixture monorepo
  (`pnpm-workspace.yaml` + fake `apps/web`/`apps/api`) — root-only adapter placement, both
  metadata files' schemas, monorepo-pack inclusion, warning semantics, path-validation error
  cases. `test/monorepo-doctor.test.ts`, `test/monorepo-maintenance.test.ts` (M5, new) mirror
  `test/doctor.test.ts`/`repair.test.ts`/`upgrade.test.ts`/`sync.test.ts`'s tamper-fixture style
  for the monorepo path. `test/monorepo-process.test.ts` (M5, new) mirrors `test/sync-
  process.test.ts`'s built-`dist/cli.js` convention for `install --target`/`doctor`/`sync`
  `--json` single-line checks.
- `test/detect-repo-type.test.ts` (M6, new) unit-tests `core/detect-repo-type.ts`'s heuristics —
  per-type fixtures, unknown, ambiguous ranking/tie-break. `test/wizard-steps.test.ts` (M6, new)
  unit-tests every `wizard/steps/*.ts` planning function directly (no prompts needed for half of
  them) plus prompt-wrapper functions with a minimal inline fake `WizardPrompts`.
  `test/wizard-flow.test.ts` (M6, new) exercises the FULL `runWizardFlow()` sequence — single-
  project and monorepo happy paths, preset short-circuits, cancellation, unknown-detection
  fallback — via a `scriptedPrompts()` fake that fails loudly if the wizard asks for an answer
  that wasn't queued (or in the wrong order), against `mkdtemp` target dirs and the real bundled
  `packs/` (same convention as `test/install-e2e.test.ts`, since step 7 writes for real).
  `test/install-entry-process.test.ts` (M6, new) mirrors `test/sync-process.test.ts`'s built-
  `dist/cli.js`/closed-stdin/hard-timeout convention for the non-TTY matrix (bare invocation,
  insufficient flags, `--json` single-line proofs) and root-short-form/`install`-subcommand
  parity, plus a regression guard for the `sync --yes` flag-collision fix noted above.
- `test/install-multi-type-e2e.test.ts` (M10, new, D22) exercises the multi-type UNION install
  pipeline end to end (comma `--type`, colon+plus `--target`) against a fixture `packsRoot` with
  real content for two stack packs (the real bundled `next`/`vite-react-ts` packs are still D6-
  "planned", so a fixture is what actually demonstrates a real union of skills). `test/detect-
  repo-type.test.ts` gained a `detectRepoTypeAcrossWorkspace()` describe block (M10, Grace-shaped
  fixture). `test/install-entry-process.test.ts` gained a D22 describe block (comma `--type`,
  colon+plus `--target`, unknown-type-in-list error) against the BUILT `dist/cli.js` and the real
  bundled packs.

## Directory Layout

```
src/
  cli.ts                    entry point (bin). Builds the commander program, routes
                             no-subcommand invocation to the install wizard shell. D30: declares
                             --web/--cli/--no-open/--emit-schema (root-only) + a `wizard` subcommand.
  index.ts                  programmatic surface (internal use only, see Dependents).
  web/                      D30 standalone `--web` mode + `--emit-schema` contract. Whole-form
                             browser wizard reusing the D28 seams (buildWizardSchema -> serve page ->
                             WizardAnswers -> resolve -> buildInstallResult). Never modifies
                             wizard/view|core or controller.ts. CONTEXT.md: src/web/CONTEXT.md —
                             read it before touching anything here.
  commands/
    not-implemented.ts      shared placeholder helper: text or JsonResult "not implemented",
                             non-zero exit. No command uses it any longer as of Milestone 4 —
                             kept in place (small, harmless) rather than deleted, in case a
                             future command starts life as a placeholder again.
    list.ts                  REAL as of Milestone 2. buildListResult() (pure) +
                              formatListHuman() (pure) + runListCommand() (the process.exit
                              wrapper cli.ts actually calls). See "Key Concepts" below.
    install.ts               REAL as of Milestone 3 (single-project) + Milestone 5 (monorepo).
                              Same pure/impure split as list.ts: buildInstallResult() (does real
                              fs I/O — writes .claude/ + .nockta/ — but no process.stdout/exit,
                              so tests can call it directly) + formatInstallHuman() (pure) +
                              runInstallCommand() (the process.exit wrapper). buildInstallResult()
                              now branches on isMonorepoRequest (any --target given, or
                              --monorepo) to buildSingleProjectInstallResult() (UNCHANGED since
                              M3/M4) or buildMonorepoInstallResult() (M5, new — parses --target
                              via core/parse-targets.ts, validates paths exist in-repo, delegates
                              to core/inject-skills-monorepo.ts). `emptyData()` is now exported
                              (M6) so `wizard/run-install-wizard.ts` can build a same-shape
                              "cancelled" InstallData without duplicating the shape. Nothing else
                              in this file changed for M6 — it still knows nothing about the
                              wizard or TTY detection; that routing lives one layer up, in the new
                              `install-entry.ts`. See "Key Concepts" below.
    install-entry.ts          M6, new; M7: hasSufficientInstallFlags() gained a `--dry-run`
                              bypass (dry-run never writes, never needs `--yes`, so it must not
                              route to the wizard just for lacking `--yes`) — see
                              `test/install-entry.test.ts` (new, M7, pure unit test for this gate
                              — no process spawn needed). runInstallEntry(): the ONE routing
                              decision behind BOTH the root short-form (spec §7.2) and the
                              `install` subcommand — see "Key Concepts" below for the exact rule
                              and why it lives here rather than in cli.ts or install.ts (avoids a
                              wizard<->install import cycle: install-entry.ts imports both
                              install.ts and wizard/run-install-wizard.ts; neither of those
                              imports it back).
    doctor.ts                 REAL as of Milestone 4 (single-project) + Milestone 5 (monorepo,
                              transparently — core/doctor-checks.ts dispatches internally).
                              Same pure/impure split, read-only — buildDoctorResult() does no
                              filesystem WRITES at all (only reads + a scratch-dir render via
                              core/render-plan.ts, cleaned up before returning). Delegates to
                              core/doctor-checks.ts. DoctorData gained isMonorepo/targetsStatus/
                              targets fields (M5) — empty/"n/a" for single-project, unchanged
                              JSON shape otherwise.
    repair.ts                 REAL as of Milestone 4 (single-project) + Milestone 5 (monorepo).
                              buildRepairResult() delegates to core/profile-guard.ts (guard) +
                              core/repair-adapters.ts (single-project) OR (M5, new) reads
                              .nockta/targets.json and delegates to
                              core/repair-adapters-monorepo.ts when the guard returns
                              "ok-monorepo". Both paths share buildRepairSuccessResult() (M5,
                              extracted — the two result shapes are structurally identical).
                              --force flag threaded through from cli.ts.
    upgrade.ts                REAL as of Milestone 4 (single-project) + Milestone 5 (monorepo).
                              Same shape as repair.ts (including the M5
                              buildUpgradeSuccessResult() extraction), delegates to
                              core/upgrade-adapters.ts or core/upgrade-adapters-monorepo.ts.
                              Also reports data.previousVersion / data.newVersion (the version
                              delta, spec §13.4).
    sync.ts                   REAL as of Milestone 4 (single-project) + Milestone 5 (monorepo,
                              transparently — core/sync-orchestrator.ts dispatches internally).
                              The ONLY async command — buildSyncResult() is `async` because
                              interactive mode awaits a confirmation prompt. Delegates to
                              core/sync-orchestrator.ts. --yes/--dry-run threaded through from
                              cli.ts. DoctorSummary gained isMonorepo (M5).
  wizard/                   REAL as of Milestone 6 (was a Milestone 1 print-only shell). Own
                             CONTEXT.md: src/wizard/CONTEXT.md — read it before touching
                             wizard step logic, prompt injection, or the monorepo target
                             discovery/manual-fallback flow.
    run-install-wizard.ts    runWizardFlow() (awaits injected WizardPrompts answers, no
                              process.stdout/exit — testable directly) + runInstallWizard() (the
                              impure wrapper: narration + final InstallResult + process.exit).
                              Delegates step 7 ("write") to install.ts's buildInstallResult() —
                              NOT reimplemented here.
    prompts.ts                WizardPrompts interface (confirm/select/checkbox/input) +
                              defaultWizardPrompts (real @inquirer/prompts, lazily imported).
    steps/                    detect-repo.ts, select-targets.ts, select-repo-type.ts,
                              select-adapters.ts, select-skills.ts (M7, new — D19), preview-
                              plan.ts, confirm.ts, extras.ts — one file per spec §7.1 step
                              (§11's target file tree, +2 beyond spec's original list: extras.ts
                              from M7's D17 predecessor pass, select-skills.ts from THIS pass),
                              each pure or thin-prompt-only. See src/wizard/CONTEXT.md for the
                              full breakdown.
  packs/                     Milestone 2 (+ skill.json parsing, Milestone 3) — pack manifest
                              resolution system. Own CONTEXT.md: src/packs/CONTEXT.md.
    get-pack-path.ts         resolves the inject-nockta-skills PACKAGE root (works from both
                              dist/cli.js and unbuilt src/) so bundled packs/ is always found.
    read-pack-manifest.ts    parses + validates one packs/<pack>/pack.json; throws structured
                              PackManifestError, never a raw fs/JSON error.
    read-skill-manifest.ts   (Milestone 3) parses + validates one skill.json; falls back to a
                              permissive default when absent rather than throwing.
    list-packs.ts            enumerates every bundled pack dir + its parsed manifest.
    resolve-packs.ts         resolution rules (always-common, monorepo-on-request, requires
                              chains) + evaluatePackContent(), the D6 installable/planned gate.
    skill-catalog.ts          M7, new (decisions.md D19). buildSkillCatalog(): reads every
                              installable pack's skills' skill.json and tags each with its
                              enablement tier — the input core/skill-selection.ts resolves against.
  adapters/                  Milestone 3, new; M7 gained cursor/copilot. Format-specific
                              renderers. Own CONTEXT.md: src/adapters/CONTEXT.md.
    types.ts                  M7, new. RenderedFile/SkippedSkill/AdapterRenderResult — shared by
                              all 3 renderers (moved out of claude/render.ts, which re-exports
                              them verbatim for backward compat).
    claude/render.ts         renderClaudeAdapter() — real since M3. Honors skill.json
                              supportedAdapters/outputs + (M7) the D19 effectiveSkills set; D1
                              override-wins check against packs/<pack>/adapters/claude/.
    cursor/render.ts          M7, new. renderCursorAdapter() — one
                              .cursor/rules/nockta-<pack>.mdc per pack (spec §8.3; filename gained
                              the `nockta-` prefix in M8, decisions.md D20).
    copilot/render.ts         M7, new. renderCopilotAdapter() — ONE
                              .github/instructions/nockta.instructions.md covering every pack
                              (spec §8.4); never touches .github/copilot-instructions.md.
  core/                      Milestone 3 (install) + Milestone 4 (maintenance: doctor/repair/
                              upgrade/sync) + Milestone 5 (monorepo install + monorepo-aware
                              maintenance: detect-monorepo.ts, parse-targets.ts,
                              inject-skills-monorepo.ts, write-targets.ts, read-targets.ts,
                              monorepo-doctor-checks.ts, repair-adapters-monorepo.ts,
                              upgrade-adapters-monorepo.ts, classify-manifest.ts) + Milestone 6
                              (detect-repo-type.ts, new — single-project heuristic repo-type
                              detection, wizard-prefill only, see its own doc comment for the
                              "never overrides an explicit --type" contract) + Milestone 7
                              (run-extras.ts, new — spec §7.10/decisions.md D17 Extras
                              detection/execution core, shared by commands/install.ts's
                              --with-claude-mem AND wizard/steps/extras.ts, deliberately NOT
                              under wizard/ — see src/wizard/CONTEXT.md) + Milestone 7 (skill-
                              selection.ts + build-install-plan.ts, new — decisions.md D19's
                              resolver + the install --dry-run plan builder; see
                              src/core/CONTEXT.md's D19 merge-policy Key Concepts bullet, the
                              substantive new content this pass) + Milestone 10 (workspace-
                              globs.ts, new — extracted shared npm-workspace glob reading, D22;
                              detect-repo-type.ts gained detectRepoTypeAcrossWorkspace(); every
                              `repoType: RepoType` call-site shape became `repoTypes:
                              RepoType[]`). Own CONTEXT.md:
                              src/core/CONTEXT.md — read it before touching anything in this
                              directory; the M4 maintenance pipeline reuses the M3 renderer via a
                              scratch-dir trick that is easy to accidentally break if you don't
                              know it's there, and M5's monorepo doctor reuses M4's classification
                              engine via classify-manifest.ts the same way; M6's wizard preview
                              step (src/wizard/steps/preview-plan.ts) reuses BOTH resolve-packs.ts
                              and render-plan.ts the same way again.
  utils/
    hash.ts                  Milestone 3, new. sha256File() — the one hashing primitive
                              behind every GeneratedFileRecord's sourceHash/outputHash.
  types/
    repo-type.ts             RepoType union (spec §5.1) — this package's canonical semantic
                              ownership per decisions.md D7. Also REPO_TYPES array + isRepoType
                              guard, used by tests and by `list --json`. M10 (D22): gained
                              parseRepoTypesList(raw, separator) — shared comma/`+`-separated
                              multi-type parsing used by BOTH `commands/install.ts`'s `--type`
                              and `core/parse-targets.ts`'s colon-form embedded type list.
    adapter.ts                AdapterType union (spec §8.1) + ADAPTER_TYPES/isAdapterType,
                              same ownership note; also used by `list --json`.
    json-result.ts            JsonResult shape + exit-code scheme (spec §7.9, decisions.md D13)
                              — the CLI's public machine-interface contract.
    pack.ts                  PackManifest (pack.json shape) and SkillManifest (skill.json
                              shape, decisions.md D8) — spec §12/§8.2. M7: SkillManifest gained
                              `enablement: SkillEnablement` ("required"|"default"|"optional",
                              decisions.md D19; also exports SKILL_ENABLEMENTS/isSkillEnablement).
    skill-selection.ts        M7, new. SkillSelectionDeltas ({excluded, included}) +
                              EMPTY_SKILL_SELECTION — split out of core/skill-selection.ts (which
                              imports + re-exports both) specifically so types/profile.ts (a
                              types/*.ts leaf file) never has to import from core/.
    profile.ts               Milestone 3, new. NocktaSkillsProfile (spec §10.1, written by
                              write-profile.ts) and NocktaMonorepoSkillsProfile (spec §10.2,
                              now written by write-profile.ts's writeMonorepoSkillsProfile(),
                              Milestone 5). M7: both gained an optional `skillSelection` field
                              (decisions.md D19) — see profile.ts's own doc comment for the
                              spec-internal inconsistency this resolves (§10.1's PROSE requires
                              the field; its adjacent TS sample doesn't show it). M10 (D22):
                              NocktaSkillsProfile.repoType -> repoTypes: RepoType[]; a legacy
                              singular repoType on disk is normalized to a one-element repoTypes
                              by core/profile-guard.ts's readProfileForMaintenance() (read-only
                              shim, BEFORE shape validation) — every WRITE always uses the new
                              shape.
    generated-manifest.ts    Milestone 3, new. GeneratedFileRecord/GeneratedManifest (spec
                              §10.3, decisions.md D3). Not itemized by name in spec §11's
                              src/types/ list — added because D3 needs the shape typed
                              somewhere; kept separate from profile.ts for clarity.
    install-options.ts       Milestone 3, new. InstallOptions — the validated shape
                              commands/install.ts hands to core/inject-skills.ts (single-project
                              path only — the monorepo path's options shape lives inline in
                              core/inject-skills-monorepo.ts, Milestone 5).
    doctor.ts                Milestone 4, new; gained DoctorReport + TargetCheckResult in
                              Milestone 5 (moved here from being doctor-checks.ts-local, to
                              avoid a circular import with the new monorepo-doctor-checks.ts —
                              see src/core/CONTEXT.md). FileClassification ("intact"/"missing"/
                              "modified"/"stale"/"unknown", spec §10.3), ClassifiedFile,
                              ClassificationCounts, SuggestedAction — shared by
                              doctor/repair/upgrade/sync, not just doctor.ts.
    target.ts                Milestone 5, new; M10 (D22): TargetRecord.repoType -> repoTypes:
                              RepoType[]. TargetRecord/TargetsFile (spec §9.3 shape, written by
                              core/write-targets.ts, read by core/read-targets.ts) +
                              isValidTargetRecord/isValidTargetsFile schema validators, now
                              backed by normalizeTargetRecord() (M10, new) — accepts EITHER the
                              current repoTypes[] shape or a legacy singular repoType on read
                              (back-compat shim), always normalizing to repoTypes[].
```

**M7 update: `src/adapters/cursor/` and `src/adapters/copilot/` are now real** (see
src/adapters/CONTEXT.md) — the wizard's adapter-select step
(`src/wizard/steps/select-adapters.ts`) now offers all three (`AVAILABLE_ADAPTERS` widened,
still kept in sync BY HAND with `core/render-adapters.ts`'s dispatch rather than derived from
`ADAPTER_TYPES` directly — same convention, now with nothing left disabled).

`scripts/import-skill.ts` (Milestone 3, new) is NOT under `src/` — it is a dev-time-only pack
importer (spec §12 "Import hygiene"), run via `pnpm import-skill` / `pnpm import-common-skills`,
never bundled into `dist/` or published (see package-root `context.md` for what it does and how
it was run for the 3 real common skills).

## Key Concepts

- **Placeholder pattern retired (Milestone 4).** Every command has graduated off
  `runNotImplemented()` (`commands/not-implemented.ts`) — `list` (M2), `install` (M3),
  `doctor`/`repair`/`upgrade`/`sync` (M4, this pass). The helper itself is kept (unused, dead
  code but harmless) rather than deleted, matching the "don't delete working infrastructure
  speculatively" instinct — it cost nothing to leave and gave every M1/M2 command real,
  consistent `--json` behavior on day one, before any of them did real work.
- **doctor/repair/upgrade/sync are read-only / additive-write only, per spec §14 — never
  destructive.** Doctor never writes anything. Repair/upgrade only ever WRITE a path that is
  part of the canonical render plan for the profile's `repoType` (see
  `src/core/CONTEXT.md`'s `applyRenderPlan()` note) — an "unknown" (untracked) file is, by
  construction, never even a candidate for a write, let alone a delete or move (this package
  never deletes/moves files in MVP, spec §14). Sync only writes by calling repair/upgrade.
- **`install` is real for its non-interactive path only (Milestone 3), same pure/impure split as
  `list`.** `commands/install.ts` separates `buildInstallResult()` (validates
  `--type`/`--adapters`/`--yes`, then — unlike `list` — does real filesystem I/O by delegating to
  `core/inject-skills.ts`; still no `process.stdout`/`process.exit`, so tests call it directly
  against a temp `targetDir`) and `formatInstallHuman()` (pure formatter) from
  `runInstallCommand()` (the thin `process.exit` wrapper). Validation order matters for exit
  codes: missing/invalid `--type` or `--adapters` or missing `--yes` -> exit `1`
  (`INVALID_PROFILE_OR_TARGETS` — read as "invalid options" here); an adapter with no renderer
  (anything but `claude`) -> exit `3` (`RENDER_FAILURE`, via `AdapterNotImplementedError`); a
  requested pack absent from disk entirely -> exit `2` (`MISSING_PACKS`); otherwise exit `0`.
  Planned packs (D6: exist, just not authored yet) are reported in `data.skippedPacks`, never an
  error — see spec §5.10, decisions.md D6.
- **`--yes` is required for the non-interactive install path, by deliberate restriction — and
  this is now exactly how the wizard gets triggered.** `install --type ... --adapters ...`
  without `--yes` still fails with exit `1` (unchanged since M3) when there is no TTY to fall
  back to; ON a real TTY, the SAME "insufficient flags" condition instead launches the wizard
  (M6, `commands/install-entry.ts`'s `hasSufficientInstallFlags()` gate) — see that file and
  `src/wizard/CONTEXT.md`.
- **Only the `claude` adapter renders (Milestone 3).** `install --adapters cursor` or `...copilot`
  fails fast with exit `3` (`AdapterNotImplementedError` from `core/render-adapters.ts`) rather
  than silently skipping the adapter — spec §8.1 lists all three as MVP adapters, but only
  Claude's renderer exists; this is a recorded scope restriction, not a design decision to narrow
  adapter support (see decisions.md D8 note in `packs/common/skills/*/skill.json` for the related,
  separate per-skill `supportedAdapters` restriction).
- **`list` is real (Milestone 2), and split pure/impure.** `commands/list.ts` separates
  `buildListResult()` (pure: `listPacks()` + `evaluatePackContent()` in, `JsonResult` out, no
  I/O) and `formatListHuman()` (pure formatter) from `runListCommand()` (the thin wrapper that
  writes stdout and calls `process.exit`). The pure split exists specifically so tests can assert
  on the real result object without a `process.exit` call tearing down the test worker — see
  `test/list-command.test.ts`. `list`'s exit code is always `0` (spec §7.9 "success/healthy — no
  action needed"): reporting 8 packs as `planned` is a correct, successful `list`, not a failure.
- **`--json` is global, read per-command via closure — and `install`'s flags now follow the SAME
  pattern, for a concrete, empirically-found reason (M6).** `--json` is declared once on the root
  `commander` program; subcommand actions read it via the closed-over `program` reference
  (`program.opts().json`) rather than `optsWithGlobals()`. M6 needed `--type`/`--target`/
  `--monorepo`/`--adapters`/`--yes` to work BOTH as root-level flags (spec §7.2 short-form) AND on
  the `install` subcommand — the first attempt declared them on BOTH commands (mirroring how
  `repair`/`upgrade`'s own `--force` is subcommand-local — `sync`'s `--dry-run` WAS subcommand-
  local too at the time, but is NOT any longer, see the M7 addendum below), which
  reproduced a genuine commander gotcha: without `.enablePositionalOptions()`, commander resolves
  a flag against WHICHEVER command registered it first when the SAME flag name is declared on
  both a parent and a child — `install --type next` silently landed on `program.opts()`, leaving
  the subcommand's own options object empty (`{ target: [] }`), and enabling positional options
  to fix it broke `--json`/`--yes` appearing AFTER other subcommands' own flags (an existing,
  tested convention across doctor/repair/upgrade/sync/list). The actual fix: declare these flags
  ONLY ONCE, on the root command, and have BOTH the root action and the `install` subcommand's
  action read the identical `program.opts()` closure (`cli.ts`'s `runRootInstall()`) — this is
  also, not coincidentally, what makes root-short-form/`install`-subcommand parity (brief item 4)
  hold by construction rather than by keeping two option lists in sync by hand. One casualty of
  this: `sync`'s own local `--yes` declaration had to be REMOVED for the same reason (it collided
  with root's new `--yes`) — `sync`'s action now reads `program.opts().yes` too; behavior is
  unchanged, only where the flag is read from moved. See `src/wizard/CONTEXT.md` and
  `commands/install-entry.ts` for the routing this flag reading feeds into.
- **M7 addendum: the SAME collision recurred for `--dry-run`, and got the SAME fix.**
  `--exclude-skills`/`--include-skills` (brand new, decisions.md D19) were declared root-only from
  the start, no drama. `--dry-run` (spec §7.3, `install --dry-run`) was declared root-only too —
  but `sync` ALREADY had its own local `--dry-run` Option (M4, "print the plan only", spec §7.7),
  so adding a second, root-level `--dry-run` reproduced the identical parent/child collision
  `--yes` hit in M6. Same fix, applied to the SAME flag class for the second time: `sync`'s local
  `--dry-run` declaration was REMOVED; `sync`'s action now reads `program.opts().dryRun` — this is
  also, not coincidentally, semantically sound (both `install --dry-run` and `sync --dry-run` mean
  the same thing: "resolve/plan, write nothing"). `hasSufficientInstallFlags()`
  (`commands/install-entry.ts`) also gained a `dryRun` case: a dry-run bypasses the `--yes`
  requirement entirely (it never writes, so there is nothing to confirm) — see that file's own
  doc comment.
- **No-subcommand OR `install` routes through the same entry point (M6, changed from M1-M5's
  wizard-only root action).** Both the root command's `.action()` and the `install` subcommand's
  `.action()` call `runRootInstall(program)` -> `commands/install-entry.ts`'s `runInstallEntry()`,
  which decides between the existing non-interactive path and the wizard (spec §6/§7.1/§7.2) —
  see that file's own doc comment for the exact rule.
- **`cli.ts` is both the bin entry and a test import.** `buildProgram()` is exported and side-effect
  free; the shebang'd auto-run (`main().catch(...)`) is gated behind an `import.meta.url ===
  pathToFileURL(process.argv[1]).href` check, so `test/cli.test.ts` can `import { buildProgram }`
  without triggering `process.exit` during the test run.
- **Every command now has real, spec-accurate exit codes (Milestone 4 completes this; Milestone 5
  extends the same scheme to monorepo, unchanged in shape).** All six codes in the shared scheme
  (spec §7.9: 0 success/healthy, 1 invalid profile/targets, 2 missing packs, 3 render failure, 4
  action-required) are now live for both single-project and monorepo repos. Code `4` — originally
  documented as "sync action-required" — is used by `doctor` too, per spec §7.9's own framing
  ("folded into this shared scheme rather than remaining sync-specific"): doctor exits `4`
  whenever it finds issues on an otherwise-valid profile (missing/modified/stale/manifest-
  invalid, OR — monorepo, M5 — a target directory missing/implausible), reserving exit `1`
  specifically for "the profile itself is missing/unparsable, OR (monorepo) `.nockta/
  targets.json` is missing/invalid" (spec's own "invalid profile or targets" wording — note
  `targets.json` invalidity is now literally what that phrase names, not a placeholder). Malformed
  `--target` CLI input (spec §7.3/D9, `core/parse-targets.ts`) and a target path that doesn't
  exist in the repo ALSO map to exit `1` at `install` time, same "invalid input" bucket.
  `repair`/`upgrade` deliberately do NOT use exit `4` for a completed run that had to skip
  modified files — see the next bullet.
- **Repair/upgrade completing with skipped-modified files is a SUCCESS (exit 0), not a failure —
  same philosophy as `list`'s always-`0`.** Warning about and refusing to touch a user-modified
  file is exactly the safety behavior spec §14/§10.3 requires; reporting that in `data` and
  exiting `0` is a correct, successful run. The only failure mode for repair/upgrade is a
  missing/invalid profile, OR (monorepo, M5) a missing/invalid `.nockta/targets.json` — repair/
  upgrade cannot recreate that file themselves (exit `1`) — see `commands/repair.ts`'s doc
  comment.
- **M5's `"ok-monorepo"` replaces M4's `"monorepo-unsupported"` guard entirely — not a new
  parallel status alongside it.** `core/profile-guard.ts`'s `ProfileGuardResult` union is now
  `"missing" | "invalid" | "ok" | "ok-monorepo"` — every command that switches on `guard.status`
  (`doctor.ts`/`repair.ts`/`upgrade.ts` directly; `sync.ts` indirectly via `doctor-checks.ts`,
  which now dispatches to `monorepo-doctor-checks.ts` internally) gained an `"ok-monorepo"`
  branch instead of refusing to proceed. One M4 test (`test/doctor.test.ts`) was updated, not
  broken, by this change — see root `context.md`'s Current State for why.
- **Monorepo install triggers on `--target` presence, not detected signals — detection is
  warning-only.** `buildInstallResult()`'s `isMonorepoRequest` is `true` whenever ANY `--target`
  is given, or `--monorepo` is passed; `core/detect-monorepo.ts`'s spec §9.1 signal scan is used
  ONLY to decide whether to add a `data.warnings` entry, never to block the install — a
  deliberate, documented semantics choice (spec §7.3 doesn't fully pin this down) because the
  presence of `--target` is itself unambiguous monorepo intent.
- **`--target` path validation happens in `commands/install.ts`, not `core/parse-targets.ts`.**
  `parse-targets.ts` is pure string parsing (no filesystem access) so it can be unit-tested in
  isolation; `buildMonorepoInstallResult()` resolves each parsed target against `targetDir`
  afterward (exists, is a directory, does not escape the repo root via `resolve()` + a prefix
  check) — collecting every bad target into ONE error message rather than failing on the first.
- **A `--target` whose resolved path IS the repo root normalizes to `"."`, not the raw path
  (bugfix, post-M5).** `buildMonorepoInstallResult()` compares each parsed target's
  `resolve(targetDir, t.path)` against `resolve(targetDir)`; on a match (e.g. `--target
  <cwd>:next`, or any absolute path equal to `targetDir`) the stored `path`/`name` becomes `"."`/
  the root dir's own basename instead of the caller's raw (often absolute) string. Without this,
  the raw path was written verbatim into `.nockta/targets.json`, and
  `core/monorepo-doctor-checks.ts`'s `checkTarget()` — which does `join(targetDir, record.path)`
  — resolved it to a nonexistent nested path, so `doctor` false-negatived a healthy root install
  as a missing/broken monorepo member. Regression test:
  `test/monorepo-doctor.test.ts`'s "regression: --target <abs-path> resolving to the repo root
  itself…" case.
- **Safety boundary (spec §14) is enforced by construction, not convention.** Every write this
  package performs traces to a small, closed set of functions: `adapters/claude/render.ts`
  writes only under `<targetDir>/.claude/`; `core/write-profile.ts` / `core/write-manifest.ts`
  write only under `<targetDir>/.nockta/`; `core/apply-render-plan.ts` (M4) writes only paths
  drawn from a `computeRenderPlan()` result, which are themselves always `.claude/...`-relative.
  Nothing in `core/inject-skills.ts`, `core/repair-adapters.ts`, `core/upgrade-adapters.ts`, or
  any `commands/*.ts` touches the filesystem directly outside calling those. Verified in
  `test/install-e2e.test.ts` (top-level contents exactly `[".claude", ".nockta"]` after install)
  and, this pass, in `test/repair.test.ts`'s "never touches an unknown file" test plus the M4
  end-to-end demo against the built CLI (see root `context.md`).
