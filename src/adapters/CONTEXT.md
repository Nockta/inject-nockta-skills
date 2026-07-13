# CONTEXT.md — src/adapters/

## Purpose

Format-specific renderers: given a set of INSTALLABLE packs (the D6 gate is `src/packs/`'s job,
not this module's), the D19 effective skill set, and a target directory, write the adapter's
native output tree. As of Milestone 7 all three MVP adapters are real: `claude` (M3), `cursor` +
`copilot` (M7, spec §8.3/§8.4). M8 (publish prep) renamed cursor's output filename to
`nockta-<pack-name>.mdc` (decisions.md D20) — no other renderer changed. A post-M8 pass
(decisions.md D24) adds a FOURTH adapter, `agent` — a generic root `AGENTS.md` renderer
(`src/adapters/agent/render.ts`, spec §8.5) covering Codex/Antigravity-`agy`/Cursor/Zed/Windsurf
(and secondarily Copilot) in one shot. The SAME pass reclassifies `subagent-delegation` from
claude-only to adapter-portable (decisions.md D23): its SKILL prose now renders for cursor/
copilot/agent too; only its `worker.md` agent artifact stays claude-only. A later pass (decisions.md
D35, owner ruling) adds a FIFTH adapter, `antigravity` — the FULL-injection peer of `claude` (NOT
the text-only `agent` surface): each selected skill's ENTIRE bundled dir renders to
`<targetDir>/.agents/skills/<skill>/` (Google Antigravity workspace-skill convention, IDE + `agy`
CLI). Owner rationale: Nockta devs' primary tools are Claude Code + Antigravity, so Antigravity gets
"the `.claude/` treatment", not just the AGENTS.md text.

## Dependencies

- `../packs/get-pack-path.ts` — locates the bundled `packs/` root (same package-root resolution
  used everywhere else; every renderer accepts an injectable `packsRoot` override for tests, same
  pattern as `resolve-packs.ts`).
- `../packs/read-skill-manifest.ts` — parses each skill's `skill.json` to decide whether/how it
  renders for this adapter (`supportedAdapters`, `outputs.<adapter>`) — as of M7 also carries
  `enablement` (D19), consulted one layer up by `core/skill-selection.ts` before any renderer runs.
- `../packs/resolve-packs.ts` (`ResolvedPackEntry` type only) — callers pass the `installable`
  array from `resolvePacks()`; this module trusts that filtering and does not re-check D6 itself.
- `../types/adapter.ts` — `AdapterType`.
- `./types.ts` (M7, new) — `RenderedFile`/`SkippedSkill`/`AdapterRenderResult`, the types ALL THREE
  renderers share (moved out of `claude/render.ts`, which re-exports them verbatim — see "Key
  Concepts").
- Node builtins only: `node:fs`, `node:path`, `node:crypto` (cursor/copilot hash their own
  constructed content for `sourceContentHash` — see "Key Concepts").

## Dependents

- `src/core/render-adapters.ts` — dispatches to `claude/render.ts`, `cursor/render.ts`,
  `copilot/render.ts`, `agent/render.ts` based on the requested adapter list; threads the SAME
  `effectiveSkills` set to all four. `AdapterNotImplementedError` still exists (thrown for any
  future `AdapterType` with no renderer) but has no live trigger through the current public API as
  of D24 — every adapter `isAdapterType()` accepts now renders.
- `src/core/render-plan.ts` (Milestone 4, extended M7) — calls `render-adapters.ts` (and so,
  transitively, every adapter module) against a throwaway `mkdtemp` scratch directory to compute
  "what would a fresh install produce right now" for doctor/repair/upgrade, without duplicating
  this module's D1-override/`skill.json` source-resolution logic OR the D19 selection-resolution
  logic (`core/skill-selection.ts`, called internally). See `src/core/CONTEXT.md`'s "Key Concepts".
- `test/claude-render.test.ts`, `test/cursor-render.test.ts`, `test/copilot-render.test.ts`,
  `test/agent-render.test.ts` — exercise each renderer directly against `mkdtemp` fixture pack
  trees (adapter-restriction, override-wins, D19 selection-exclusion, agents-dir rendering for
  claude, agent-artifact non-honoring for `agent`).
- `test/install-e2e.test.ts`, `test/multi-adapter-e2e.test.ts` — exercise all four indirectly
  through the full install pipeline against the real bundled `packs/common/skills/*` (the latter's
  second `describe` block is the 4-adapter — claude+cursor+copilot+agent — combo, including
  AGENTS.md manifest coverage: rm -> doctor flags -> repair restores -> hash verified).

## Directory Layout

```
src/adapters/
  types.ts      M7, new. RenderedFile/SkippedSkill/AdapterRenderResult — shared by all 4 renderers.
  claude/
    render.ts   renderClaudeAdapter() — the only real renderer through M6; re-exports the shared
                 types verbatim (see "Key Concepts") so no M1-M6 caller needed an import-path change.
  cursor/
    render.ts   M7, new. renderCursorAdapter() — one .cursor/rules/nockta-<pack-name>.mdc PER pack
                 (D20, M8 rename — see "Key Concepts").
  copilot/
    render.ts   M7, new. renderCopilotAdapter() — ONE .github/instructions/nockta.instructions.md
                 covering every pack.
  agent/
    render.ts   D24, new (post-M8). renderAgentAdapter() — ONE root AGENTS.md covering every pack,
                 modeled on copilot's single-combined-file shape but in plain-markdown AGENTS.md
                 conventions (no frontmatter). Never honors outputs.agent.agents (no
                 agent-registration mechanism exists under AGENTS.md).
  antigravity/
    render.ts   D35, new. renderAntigravityAdapter() — full per-skill dir copy to
                 <targetDir>/.agents/skills/<skill>/ (Google Antigravity, IDE + agy CLI). Structural
                 twin of claude/render.ts (same blocklist, same D1 override at
                 adapters/antigravity/skills/, same straight-copy RenderedFile) MINUS the
                 .claude/agents/ promotion — Antigravity has no agents-dir concept, so agents/*.md
                 ships only as an in-dir companion, never a registry.
```

## Key Concepts

- **Output shape (spec §8.2).** For each installable pack's declared skill, honoring `skill.json`:
  `<targetDir>/.claude/skills/<skill>/` gets `SKILL.md` (+ `worker.md`/`references.md`/`examples/**`
  as present in the source skill folder), and — only when `outputs.claude.agents` is `true` — each
  file under `packs/<pack>/skills/<skill>/agents/*.md` renders flat into
  `<targetDir>/.claude/agents/<agent-name>.md` (not nested per-skill; spec's target shape is flat).
- **Adapter-restricted skills are skipped, not errored (spec §8.2).** A skill whose `skill.json`
  `supportedAdapters` omits the adapter, or whose `outputs.<adapter>` is `false`/undeclared,
  produces no output at all and is reported in `.skipped` with a reason string. This is expected,
  successful behavior — not a render failure. **Post-M8 (decisions.md D23) reclassification:**
  `subagent-delegation` is no longer claude-only — its guidance self-gates by capability (it
  instructs the agent to skip delegation when the tool cannot spawn subagents), so its PROSE is
  adapter-portable: `supportedAdapters: ["claude", "cursor", "copilot", "agent"]`, same as
  `paper-trail`/`proof-of-done` (widened M7). What stays claude-only is its bundled `worker.md`
  AGENT ARTIFACT — `outputs.claude = {skills:true, agents:true}` but
  `outputs.{cursor,copilot,agent} = {skills:true, agents:false}`; the restriction attaches to the
  artifact (no other adapter has an agent-registration mechanism to host it), not to the guidance
  (D23's general rule: restrict artifacts, not portable capability-gating prose). The genuinely
  claude-only case remains an artifact-bound skill like `improve-codebase-architecture` (D21 —
  pure subagent-spawning + HTML-report machinery, no portable prose form).
- **D19 selection exclusion is checked FIRST, before adapter-restriction, in every renderer.**
  `effectiveSkills: Set<string>` (built by `core/skill-selection.ts`, always required — never
  optional — on every renderer's options) is checked before even reading a skill's `skill.json`; a
  skill not in the set is skipped with reason `"excluded by skill selection (not in the effective
  set, decisions.md D19)"`, distinct from an adapter-restriction skip.
- **D1 override rule — applied at DIFFERENT granularity per adapter, matching each adapter's own
  output UNIT.** Claude's output unit is one file per skill-relative-path, so its override check is
  `packs/<pack>/adapters/claude/skills/<skill>/<same-relative-path>` (unchanged since M3). Cursor's
  output unit is one `.mdc` PER PACK (not per skill), so its override check is
  `packs/<pack>/adapters/cursor/<pack-name>.mdc` — when present, it wins WHOLESALE for that pack's
  entire rule file, replacing the mechanical concatenation of every contributing skill. **This
  override SOURCE filename is unaffected by D20's output rename (M8, below)** — it stays bare
  `<pack-name>.mdc` under `packs/`, never `nockta-<pack-name>.mdc`; only the rendered file actually
  written under the target repo's `.cursor/rules/` gets the `nockta-` prefix.
  Copilot's output unit is one SECTION per pack inside a single shared file, so its override check
  is `packs/<pack>/adapters/copilot/<pack-name>.md` — wins wholesale for that pack's section only;
  other packs' sections in the same combined file are unaffected. Agent's output unit is IDENTICAL
  in shape to copilot's (one section per pack inside the single shared root `AGENTS.md`), so its
  override check is `packs/<pack>/adapters/agent/<pack-name>.md` (D24) — same wholesale-per-pack-
  section semantics. `RenderedFile.overridden` and `.sourcePath` record which content actually got
  used in every case (decisions.md D1, spec §2.2/§8.5). No pack ships a real override yet for any
  adapter — each mechanism is covered by a `mkdtemp` fixture in its own test file.
- **`RenderedFile` gained `content?: Buffer` and `sourceContentHash?: string` (M7) — the mechanism
  that makes cursor/copilot's CONSTRUCTED (not straight-copy) output work with the EXISTING D3
  manifest/repair/upgrade machinery without changing it.** Claude's output is still a straight
  copy (`sourceHash === outputHash` for every claude file, unchanged since M3 — see the note this
  replaced below); `content`/`sourceContentHash` are `undefined` for it, so every fallback
  (`entry.content ?? readFileSync(entry.sourcePath)`, `entry.sourceContentHash ??
  sha256File(entry.sourcePath)`) is a no-op there. Cursor/copilot's output is CONSTRUCTED
  (frontmatter + concatenated/merged skill content) — there is no single `sourcePath` file whose
  raw bytes equal the rendered output, so:
  - `content` carries the ACTUAL rendered bytes (frontmatter + body) — `core/apply-render-plan.ts`
    (repair/upgrade's restore-write) uses this directly instead of re-reading `sourcePath`.
  - `sourceContentHash` carries a hash of whatever the transform actually reads as CURRENT input
    (every contributing skill's raw `SKILL.md` bytes, concatenated in render order, or the
    override file's own bytes when overridden) — used as the manifest's `sourceHash` and for
    staleness comparisons (`core/classify-manifest.ts`) instead of hashing `sourcePath`.
  - `sourcePath` itself is kept for provenance/audit (points at the override file when overridden,
    or the pack's `skills/` dir otherwise) but is NEVER dereferenced as a file to read when the
    two fields above are populated — safe even though it sometimes points at a directory, not a
    file (copilot's non-overridden `sourcePath` is literally `packsRoot`, a merge across packs).
  See `src/core/CONTEXT.md`'s render-plan/apply-render-plan notes for the consumer side of this.
- **Cursor's `.mdc` frontmatter (spec §8.3) — researched, not guessed.** Current Cursor project
  rules format: YAML frontmatter with `description`/`globs`/`alwaysApply`, four activation modes
  (Always/Auto Attached/Agent Requested/Manual) driven by those three fields together. Every
  Nockta-generated rule is an "Always" rule — `alwaysApply: true`, empty `globs` — because pack
  guidance is always-relevant background context, not file-pattern-triggered (unlike a
  framework-specific lint rule). `description` is JSON-quoted (cheap, always-valid YAML flow
  scalar) rather than hand-escaping YAML for text that may contain colons/commas/parens.
  **Filename is `nockta-<pack-name>.mdc` (e.g. `nockta-common.mdc`) as of decisions.md D20 (M8).**
  Through M7 the filename was bare `<pack-name>.mdc` (e.g. `common.mdc`) per that pass's brief,
  which flagged an internal inconsistency in the spec's own §8.3 illustrative example —
  `nockta-common.mdc` for the `common` pack specifically, but `<other-pack>.mdc` (no prefix) for
  every other pack. D20 resolves that inconsistency for M8's publish-prep pass: EVERY pack's
  output file gets the `nockta-` prefix, matching the spec sample's naming for `common` and
  extending it uniformly — namespacing Nockta's generated rule files against user-owned
  `.cursor/rules/*.mdc` files that may already exist in the target repo. Doctor/repair/upgrade
  needed NO code changes for this — they are manifest-driven (`.nockta/generated-manifest.json`
  records whatever `relativePath` the renderer produced), so the new filename flows through
  automatically; verified by `test/multi-adapter-e2e.test.ts`'s repair-restores-a-deleted-`.mdc`
  case, now asserting `nockta-common.mdc`.
- **Copilot's single combined file (spec §8.4) tracks as ONE manifest record covering MULTIPLE
  packs — `pack` is a sorted, comma-joined list (e.g. `"common,next"`), `skill` is absent.** This
  is a deliberate, considered choice: `GeneratedFileRecord`/`ClassifiedFile`'s `pack`/`skill`
  fields are informational/audit-trail only (never used to MATCH records — matching is always by
  `path`), so a joined-list value is safe and more informative than a synthetic sentinel like
  `"combined"`. The alternative (one manifest record per contributing pack, all sharing the SAME
  output path) was rejected — it would inflate doctor's per-file classification counts N-for-1
  whenever that single physical file goes missing/modified, which is misleading.
- **NEVER touches `.github/copilot-instructions.md` (spec §8.4's explicit rule).** `copilot/
  render.ts` has no code path that even names that file — it only ever reads/writes
  `.github/instructions/nockta.instructions.md`.
- **Agent adapter (D24, spec §8.5; D34 addendum merge) — a single root `AGENTS.md`, not under a
  dotdir.** Unlike the other three adapters, `agent/render.ts` writes directly at
  `<targetDir>/AGENTS.md` — the one exception to "every adapter owns a dotdir" in the safety-boundary
  bullet below. **It no longer blind-overwrites a pre-existing `AGENTS.md` (D34 addendum):** the whole
  payload is wrapped in an outer guard region (`<!-- nockta:agents:start … -->`, distinct from the
  nested `standing-mode` markers) and written through the shared `mergeAgentsMd()` (`core/
  standing-mode.ts`), preserving any consumer content outside the region. `content` on the returned
  `RenderedFile` is the target-INDEPENDENT canonical region (so `computeRenderPlan()` stays pure);
  `mergedIntoConsumerContent` signals to the install orchestrators whether to manifest-track the file
  (wholly-Nockta → tracked; merged-into-consumer → untracked side-effect, D34 model b). The SAME merge
  runs at repair/upgrade time via `applyRenderPlan`'s `isAgentsRootEntry()` special-case. Plain markdown,
  no tool-specific frontmatter (unlike cursor's YAML frontmatter or copilot's `applyTo` block); a
  short "Generated by inject-nockta-skills" intro line marks it as Nockta-authored. **Never honors
  `outputs.<adapter>.agents`** — AGENTS.md has no agent-registration mechanism, so a skill's
  bundled `agents/*.md` (e.g. subagent-delegation's `worker.md`) never renders under this adapter
  even if a skill.json sets `outputs.agent.agents: true`; only `outputs.agent.skills` (SKILL.md
  prose) is ever emitted. Same single-`RenderedFile`-covers-multiple-packs shape as copilot (see
  the bullet above) — `pack` is the sorted, comma-joined contributing-pack list, `skill` absent.
- **No I/O beyond each adapter's own output location under `targetDir`.** Claude: `.claude/`.
  Cursor: `.cursor/rules/`. Copilot: `.github/instructions/`. Agent: the single root `AGENTS.md`
  file (D24 — the one adapter whose output isn't inside its own dotdir). Every renderer only ever
  reads `<packsRoot>/<pack>/...` and writes its own output — the `.nockta/` metadata files remain
  `src/core/`'s responsibility, keeping the spec §14 safety boundary enforced by construction.

## Current state (as of the D35 pass, 2026-07-13 — antigravity first-class adapter)

**D35 (owner ruling): a FIFTH adapter, `antigravity`, joins claude/cursor/copilot/agent.** Full
per-skill injection to `.agents/skills/<skill>/` — the `.claude/skills/` mirror, NOT the text-only
`agent`/AGENTS.md surface. Primary-source spec verified 2026-07-13 against
antigravity.google/docs/skills: workspace skills live at `<workspace-root>/.agents/skills/<folder>/
SKILL.md`; `.agents/` (plural) is the current default (legacy singular `.agent/` is supported but we
EMIT `.agents/` only); `description` frontmatter is REQUIRED (the discovery trigger, progressive
disclosure identical to Claude's model); a skill folder may carry arbitrary extra dirs read on demand
(so copying our full skill dirs incl. `scripts/`/`assets/`/`references/` is in-spec). Antigravity's
IDE and `agy` CLI both read root `AGENTS.md` natively, so the standing-mode contract already reaches
it — NO per-adapter reference line or CLAUDE.md-analog is needed, and skill-local `agents/*.md`
(worker.md) are never promoted to a registry.

Files changed: `src/types/adapter.ts` (AdapterType + `"antigravity"`, ADAPTER_TITLES `Antigravity
(agy)`, ADAPTER_DESCRIPTIONS), `src/adapters/antigravity/render.ts` (new), `src/core/
render-adapters.ts` (dispatch wired), `src/wizard/steps/select-adapters.ts` + `src/wizard/core/
build-schema.ts` (AVAILABLE_ADAPTERS +antigravity), `src/core/classify-manifest.ts`
(MANAGED_SCAN_ROOTS += `.agents/skills` so doctor classifies antigravity files intact/missing/
modified/stale/unknown exactly like claude), and every bundled `packs/**/skill.json` +
`packs/**/pack.json` (antigravity added to `supportedAdapters`/`outputs`/pack `adapters`). D8 rule
applied: antigravity mirrors CLAUDE's full-injection support set — for every skill where
`outputs.claude.skills` is true (all 157), antigravity is added to `supportedAdapters` with
`outputs.antigravity = {skills:true}` (`{skills:true, agents:false}` for subagent-delegation, whose
worker.md is never promoted). The claude-only `improve-codebase-architecture` (D21 — no portable
prose form) becomes `["claude","antigravity"]`: it needs full-dir injection, which only claude AND
antigravity provide. Doctor/repair/upgrade needed ZERO logic changes beyond the scan-root addition —
`computeRenderPlan()`/`applyRenderPlan()` are adapter-agnostic (straight-copy path, `entry.content ??
readFileSync(entry.sourcePath)`, works for antigravity identically to claude). `applyStandingMode`
needed no antigravity branch: antigravity is not `agent`, so an antigravity-only install still writes
`AGENTS.md` as the untracked standing-mode side-effect (`ensureAgentsMdStandingMode`). Verified: real
CLI `install --type next --adapters antigravity` → 121 files under `.agents/skills/`, doctor healthy
(121 intact, 0 unknown). `create-nockta-repo`'s sibling `src/types/adapter.ts` mirror gets the
matching one-line enum change (D7 enum-parity contract). Suite 607/607 green.

## Current state (as of the D34 pass, 2026-07-13 — standing-mode contract, single source in AGENTS.md)

**D34 addendum (2026-07-13, owner-directed): agent-adapter AGENTS.md clobber CLOSED.** The agent
renderer wraps its whole payload in an outer guard region and merges (never clobbers) via
`mergeAgentsMd()` — same merge on install (`agent/render.ts`) and repair/upgrade
(`core/apply-render-plan.ts`). Manifest model b extended: wholly-Nockta AGENTS.md tracked,
merged-into-consumer AGENTS.md untracked. Fresh output is unchanged except the two outer marker lines.
Flip rule: any pre-existing bare `nockta:standing-mode` region (or stray `nockta:agents` remnant) in
the target file is Nockta-owned — `mergeAgentsMd()` excises it before treating the rest as consumer
bytes, so a no-agent → agent reinstall never duplicates the standing block (reverse flip already safe:
`ensureAgentsMdStandingMode()` refreshes the standing region wherever it lives). Suite 597/597 green.
See decisions.md D34 addendum + `src/core/CONTEXT.md`.

**D34 update:** every install now states the Nockta working contract (the three required owner
skills govern all agent work). The contract TEXT lives in exactly ONE place — `src/core/
standing-mode.ts` — and appears at runtime only in root `AGENTS.md`; every other adapter entry
file references it. Renderer changes here:
- `agent/render.ts` prepends `renderStandingModeSection()` (marker-guarded block) as the AGENTS.md
  PREAMBLE — AGENTS.md is the single source of truth for the block, so this is where the text goes.
  (D34 addendum: this preamble now lives INSIDE the outer `nockta:agents` guard region so the merge
  can refresh the whole Nockta payload as one unit.)
- `cursor/render.ts` and `copilot/render.ts` prepend `STANDING_MODE_REFERENCE` (a one-line pointer
  to `AGENTS.md`), NOT the full block — belt-and-suspenders (both tools read `AGENTS.md` natively).
- New cross-layer import: all three of these renderers now import from `../../core/standing-mode.js`
  (only its pure text helpers — that module's FS-side `ensure*`/`applyStandingMode` functions are
  called by the core orchestrators, not by renderers). No import cycle (`standing-mode.ts` imports
  only node builtins). The root `AGENTS.md`/`CLAUDE.md` SIDE EFFECTS (existing-repo-safe, untracked)
  are NOT a renderer concern — they run in the orchestrators on the real target dir only (never in
  `computeRenderPlan()`'s scratch dir); see `src/core/CONTEXT.md` and decisions.md D34.
Tests: `agent-render`/`cursor-render`/`copilot-render` each gained a block/reference assertion;
`test/standing-mode.test.ts` (new) + the multi-adapter/install/monorepo e2e updates live in `test/`
and `src/core/`. Full suite 578/578 green.

## Current state (as of the D24 pass, 2026-07-11)

**D24 update:** a fourth adapter, `agent`, joins claude/cursor/copilot — `src/adapters/agent/
render.ts`, one root `AGENTS.md` (spec §8.5), modeled on copilot's single-combined-file shape.
Same pass reclassifies `subagent-delegation` adapter-portable (decisions.md D23) — its prose now
renders for cursor/copilot/agent too, only its `worker.md` agent artifact stays claude-only. Files
changed: `src/types/adapter.ts` (AdapterType +`"agent"`), `src/adapters/agent/render.ts` (new),
`src/core/render-adapters.ts` (dispatch wired), `src/wizard/steps/select-adapters.ts` (`agent`
offered, with a description), `packs/common/skills/{subagent-delegation,paper-trail,
proof-of-done}/skill.json` (supportedAdapters/outputs widened). Doctor/repair/upgrade needed ZERO
code changes — `computeRenderPlan()`/`classifyManifestRecords()` are adapter-agnostic (manifest
records drive missing/modified/stale classification by path, not by adapter-specific scan logic),
verified end-to-end (`test/multi-adapter-e2e.test.ts`'s 4-adapter `describe` block: rm AGENTS.md ->
doctor exit 4 -> repair restores -> hash-verified -> doctor exit 0). `create-nockta-repo`'s sibling
`src/types/adapter.ts` mirror gets the matching one-line change (decisions.md D7 enum-parity
contract); create renders nothing itself, so no renderer work there. Tests: 386 -> 396 (7 new
`test/agent-render.test.ts` cases + 3 new 4-adapter e2e cases), plus 5 pre-existing assertions
updated (subagent-delegation-absent-from-cursor/copilot expectations flipped to present, adapter
enum/wizard-default lists widened).

## Current state (as of Milestone 8, 2026-07-10)

**M8 update:** cursor's output filename renamed `<pack-name>.mdc` -> `nockta-<pack-name>.mdc`
(decisions.md D20) — namespacing against user-owned `.cursor/rules/*.mdc` files, matching spec
§8.3's own sample uniformly across every pack (see this file's "Cursor's `.mdc` frontmatter"
bullet, above, for the full before/after). One file changed (`cursor/render.ts`, the
`relativePath`/`outputPath` construction only — the D1 override SOURCE path, frontmatter builder,
and skip logic are untouched), plus the tests/docs that asserted the old filename. Doctor/repair/
upgrade needed zero code changes (manifest-driven, verified).

## Current state addendum (post-D26 pass, 2026-07-11 — claude renderer completeness, blocklist copy)

**`claude/render.ts`'s skill-dir copy changed from an ALLOWLIST to a BLOCKLIST.** Was: only
`SKILL.md`/`worker.md`/`references.md`/`examples/**` (as present) copied into
`<targetDir>/.claude/skills/<skill>/`. Now (`collectSkillDirFiles()`, replacing the old
`collectAllowlistedSkillFiles()`): the skill's ENTIRE bundled directory content copies verbatim
EXCEPT two blocklisted basenames — `skill.json` (Nockta-internal packaging metadata, never
ships) and `.DS_Store` (OS clutter) — checked recursively via `walkRelative()`'s new optional
`blocklist: Set<string>` parameter (unused by `collectAgentFiles()`, which still walks
`agents/*.md` for the separate `.claude/agents/` flat-render path, unchanged). This is what makes
companion docs (e.g. `codebase-design`'s `DEEPENING.md`/`DESIGN-IT-TWICE.md`), `scripts/` (e.g.
`shopify-polaris-admin-extensions`' `validate.mjs` + its own `package.json`), and `assets/`
(gz-only type trees) ship into the target repo — a heavy skill is now fully SELF-CONTAINED at
`<targetDir>/.claude/skills/<skill>/`: its `validate.mjs` runs from there without reaching back
into the installed npm package (verified against real bundled content: `npm install` inside the
copied skill dir picks up its own shipped `package.json`'s `typescript` dependency, then
`node .claude/skills/shopify-polaris-admin-extensions/scripts/validate.mjs ...` produces a real
TypeScript-validated pass/fail from the target location alone). Every copied file still flows
through the SAME `written.push(...)` -> `GeneratedFileRecord` path as before (no manifest/doctor/
repair change needed — `src/core/CONTEXT.md`'s doctor/repair machinery is manifest-driven by
`path`, agnostic to how many files a skill happens to declare). `cursor`/`copilot`/`agent`
renderers are unaffected by this pass (they concatenate PROSE into combined files, never copy
skill directories — confirmed still-passing, no code changes there). Tests: `test/
claude-render.test.ts` gained one fixture-based blocklist-mechanics case (companion doc +
`scripts/` + `assets/` copied, `skill.json`/`.DS_Store` excluded); `test/install-e2e.test.ts`
gained a real-bundled-packs describe block proving the same against `codebase-design` and
`shopify-polaris-admin-extensions`, plus a doctor-tracks-the-extra-files case.

## Current state (as of the previous pass — Milestone 7, 2026-07-10)

All three MVP adapters (spec §3.4 item 7) are real: `claude` (M3), `cursor` + `copilot` (M7).
Every renderer is exercised against both `mkdtemp` fixture pack trees (adapter-restriction,
override-wins, D19 selection-exclusion) and the real bundled `packs/common/skills/*` (a combined
claude+cursor+copilot install e2e test, plus the built-CLI proof-of-done demo — see root
`context.md`'s M7 "Current state"). `AdapterNotImplementedError` (`core/render-adapters.ts`) is
kept for a FUTURE adapter landing in `AdapterType` ahead of its own renderer — see that file's own
doc comment.
