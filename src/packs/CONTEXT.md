# CONTEXT.md — src/packs/

## Purpose

Pack manifest resolution system: finds the bundled `packs/` directory at runtime, parses and
validates each pack's `pack.json`, and resolves which packs a request implies (always-common,
monorepo-on-demand, `requires` chains) while gating each on real authored skill content.

This module reads manifests only (now including `skill.json`, Milestone 3). It does not render
adapter output or import skill content — that is `src/adapters/` (see its own `CONTEXT.md`, real
as of Milestone 3) and `scripts/import-skill.ts` (the dev-time pack importer, also Milestone 3,
lives outside `src/` — see the package-root `context.md`).

## Dependencies

- `../types/pack.ts` — `PackManifest` / `SkillManifest` shapes this module parses against.
- `../types/adapter.ts` — `AdapterType` validation for `pack.json`'s `adapters` field.
- Node builtins only: `node:fs` (`readFileSync`, `readdirSync`, `existsSync`, `realpathSync`),
  `node:path`, `node:url`.

## Dependents

- `src/commands/list.ts` — `buildListResult()` calls `listPacks()` and `evaluatePackContent()`
  directly to build the `list`/`list --json` payload.
- `src/core/inject-skills.ts` (Milestone 3) — calls `resolvePacks()` to turn a repo-type selection
  into the installable/planned/missing sets the install pipeline acts on. `sync`/`doctor` (later
  milestones) will call it the same way.
- `src/adapters/claude/render.ts` (Milestone 3) — calls `read-skill-manifest.ts`'s
  `readSkillManifest()` per skill to decide whether/how it renders for the Claude adapter.
- `test/pack-manifest.test.ts`, `test/resolve-packs.test.ts`, `test/read-skill-manifest.test.ts`
  exercise this module directly, mostly against `mkdtemp` fixture pack directories rather than the
  real bundled `packs/`.

## Directory Layout

```
src/packs/
  get-pack-path.ts        resolves the inject-nockta-skills PACKAGE root (not cwd, not the
                           target repo) so bundled packs/ can be found from either dist/cli.js
                           or unbuilt src/ (vitest). See "Key Concepts" below.
  read-pack-manifest.ts    parses + validates one packs/<pack>/pack.json. Throws
                           PackManifestError (structured, never a raw fs/JSON error) on any
                           problem: missing file, invalid JSON, or failed shape validation.
  read-skill-manifest.ts   (Milestone 3) parses + validates one
                           packs/<pack>/skills/<skill>/skill.json into a SkillManifest. Falls
                           back to a permissive default (derived from the owning pack's
                           adapters) when no skill.json exists, rather than throwing — every
                           skill imported so far does author a real skill.json, so that path
                           is a forward-compatibility guard, not exercised by real content yet.
  list-packs.ts            enumerates every directory under a packs root and reads its
                           pack.json via read-pack-manifest. Sorted by directory name.
  resolve-packs.ts         resolution rules (always-common, monorepo-on-request, requires
                           chains) + evaluatePackContent(), the D6 content gate.
  skill-catalog.ts          M7, new (decisions.md D19); EXTENDED M9 (decisions.md D21).
                           buildSkillCatalog(): reads every installable pack's skills' skill.json
                           (via read-skill-manifest.ts, same reader the renderers use) and tags
                           each with its `enablement` tier, PLUS (M9) `supportedAdapters` and
                           `requires` (defaulted to `[]`) — a straight passthrough of two fields
                           `readSkillManifest()` already parses, not new I/O. Pure pack/skill
                           knowledge, no CLI/selection-resolution policy — `core/skill-
                           selection.ts` (`src/core/CONTEXT.md`) consumes this output (now needing
                           the two new fields to compute D21's closure + adapter gating), does not
                           duplicate the read.
```

## Key Concepts

- **Package-root resolution, not cwd-relative.** `get-pack-path.ts` must find *this npm
  package's own* `packs/` directory regardless of what directory the CLI is invoked from or
  which repo it's injecting into. It uses `import.meta.url` of its own module file, walks up
  either one level (built: `dist/<file>.js` sits directly under the package root) or two levels
  (unbuilt: `src/packs/get-pack-path.ts` sits two levels under the package root), and picks
  whichever candidate actually has a real packs tree.
- **Marker-file check, not bare-directory check.** The candidate check looks for
  `<candidate>/packs/common/pack.json`, not just a `packs` directory. A bare `packs`-exists
  check is not enough: this module's own source folder is `src/packs/`, so from the unbuilt
  candidate a naive check false-positives on `<root>/src/packs` (mistaking this module's own
  folder for the bundled content dir). Discovered via a real test failure in Milestone 2 — see
  the comment on `PACKS_MARKER` in `get-pack-path.ts` before changing this logic.
- **`realpathSync`, same reasoning as `cli.ts`'s `isMainModule()`.** Package managers and npx
  caches invoke CLI files through symlinks; resolution uses the real on-disk path.
- **Structured manifest errors.** `PackManifestError` carries `path` (the `pack.json` file) and
  `issues` (every validation problem found, not just the first) — callers get one exception type
  to catch, with enough detail to report all problems at once rather than fix-one-rerun-repeat.
- **D6 content gate (decisions.md D6, spec §5.10).** `evaluatePackContent(entry)` checks, per
  declared skill, whether `<packPath>/skills/<skillName>/SKILL.md` exists. A pack is
  `installable` only when it has at least one declared skill and *every* declared skill has that
  file. Anything else is `planned`, never offered. This is pack-level all-or-nothing by design: a
  pack with 5 of 6 skills authored is still `planned` until the last one lands — `common` cleared
  all 3 of 3 this pass (Milestone 3) and is the first pack to flip to `installable`; the other 7
  packs are still at zero authored skills each.
- **`resolvePacks()` composes selection + the gate.** Given `requestedPacks` and a `monorepo`
  flag, it BFS-walks `requires` chains starting from a seed set (`common` AND `razor` always,
  decisions.md D26 razor pass — see the addendum below; `monorepo` if requested; each requested
  pack), then buckets every resolved pack into `installable` /
  `planned` via `evaluatePackContent()`. Pack names that don't resolve to any directory on disk
  land in `missing` rather than throwing — callers decide what a missing pack means for their
  own exit-code story (spec §7.9 exit code 2 is `install`'s concern, not this module's).
- **`packsRoot` is an injectable override, not just an implicit default.** Every function here
  (`listPacks`, `resolvePacks`) accepts an optional `packsRoot`, defaulting to
  `getPacksPath()`. Tests build throwaway fixture pack trees under `os.tmpdir()` and pass them
  in directly — no fixture files live in this repo, and the real bundled `packs/` is only
  exercised by `test/list-command.test.ts` (which asserts against the current state of all 11
  real packs — 8 through M3, `react-native`/`expo` added decisions.md D25, `razor` added
  decisions.md D26 this pass).

## Current state addendum (2026-07-11 — razor `category` promoted from pass-through-only to a typed, consumed field)

`SkillManifest` (`../types/pack.ts`) gains `category?: string` — the razor pack's per-skill
category (core/architecture/security/testing/delivery/data/realtime/tooling/react/nextjs/nestjs/
shopify), which was already written to every razor `skill.json` by the D26 razor-import pass but
was DELIBERATELY kept out of the typed manifest at that time ("razor-only presentational metadata
for a future wizard grouping UI, not something the resolver/selection engine reads today" — see
this file's own "D26 razor pass" addendum below, now superseded on this one point). That "future"
is this pass: `read-skill-manifest.ts`'s `validateSkillManifest()` now shape-validates it
(non-empty string when present — a typo degrades to the wizard's "Other" bucket, not a hard
`SkillManifestError`, since the fixed 12-category list lives in the wizard core, not here) and
carries it through; `skill-catalog.ts`'s `SkillCatalogEntry` gained the matching passthrough
field, same posture as `description`/`clashesWith`/`applicability` before it — this module stays
pure pass-through, no new validation policy. No re-import needed. Consumer: `wizard/core/
build-schema.ts`'s `buildRazorStep`, which now sections the razor step by `category` instead of
`pack` — see `src/wizard/CONTEXT.md`.

## Current state addendum (2026-07-11 — D26 razor pass: 11th pack, always-resolved)

`packs/razor/pack.json` + `packs/razor/skills/<name>/` (61 skills, all `enablement: "optional"`)
joins the bundled set. Two things distinguish it from every other pack: (1) `resolvePacks()`'s
always-included seed is now `["common", "razor"]`, not `["common"]` — `razor` resolves for every
request regardless of `requestedPacks`, same mechanism `common` already used (no new resolver
logic, one seed-array literal change); (2) `read-skill-manifest.ts` gained `applicability?:
RepoType[]` (`types/pack.ts`), parsed/validated the same permissive way `clashesWith`/`description`
were in the prior D26 pass — array of valid `RepoType` strings, or a `SkillManifestError` issue;
absent means "all repo types," every pre-razor skill.json needs zero migration. `razor` clears the
D6 content gate (all 61 skills have real `SKILL.md`+`skill.json`) so it resolves `installable`, not
`planned` — but because every one of its skills is `optional`-tier, `buildSkillCatalog`/
`resolveSkillSelection` (`src/core/skill-selection.ts`, unchanged) select none of them by default;
`razor` being always-*resolved* only makes its 61 skills eligible for `--include-skills` (and
later the wizard's step 5), it never auto-installs anything. The wizard-time *applicability
filter* (only OFFER a razor skill for a repo type it applies to) is explicitly Stage 4, not
implemented by this pass — `applicability` is parsed/persisted/provable today but nothing reads it
to narrow selection yet.

## Current state addendum (2026-07-11 — D25 react-native + expo)

Two new bundled packs, `packs/react-native/pack.json` and `packs/expo/pack.json` (decisions.md
D25), both currently `planned` (D6 gate — no `skills/<name>/SKILL.md` content imported, per this
pass's scope: skill content import is a separate, still-parked milestone). `expo`'s manifest
declares `requires: ["react-native"]` (not `["common"]`) — the pack-level `requires` chain
mirrors the existing `next`→`common` shape one level deeper, so `resolvePacks({requestedPacks:
["expo"]})` walks `expo`→`react-native`→`common` and resolves all three, exactly like any other
`requires` chain (no new resolution logic needed — verified in
`test/resolve-packs.test.ts`'s new "D25: expo pack requires react-native pack" block, against the
REAL bundled packs, not a fixture). `react-native`'s `adapters` field is `["claude", "cursor",
"copilot", "agent"]` — the first pack authored to include `agent` from creation (D24 predates
D25; every pre-D25 pack's `adapters` field still lists only the original three, unchanged by this
pass — see decisions.md D24's own "pending implementation" note for why the *existing* packs
weren't touched here).

## Current state (as of Milestone 3, 2026-07-10)

All 8 bundled packs (`../../packs/<name>/pack.json`) have real manifests. As of this pass, `common`
also has real `skills/<name>/SKILL.md` content for its 3 declared skills (imported for real via
`scripts/import-skill.ts` from `planned skills/common/`), so `resolvePacks()`/`evaluatePackContent()`
now report `common` as `installable` — the other 7 packs remain `planned` (still zero
`SKILL.md` content). This is the D6 gate flipping for the first time; see the package-root
`context.md`'s "Current state" section (which this file is a sibling of, one directory up
via `../../context.md`) for the full cross-package picture, and decisions.md D6/D8 for the rule
and the import policy that produced it.

## Current state addendum (post-D26 pass, 2026-07-11 — wizard mechanism: description/clashesWith/applicability threaded into the catalog)

`skill-catalog.ts`'s `SkillCatalogEntry` gained three optional fields, carried through verbatim
from `read-skill-manifest.ts`'s `SkillManifest` (which already parsed/validated them — see that
file's own D26 doc comment, unchanged this pass): `description`, `clashesWith`, `applicability`.
No new validation here — this module stays pure pass-through, same posture as `supportedAdapters`/
`requires` before it. Consumers: `wizard/steps/select-skills.ts` reads all three to build each
checkbox choice's `description` (skill.json text + a non-blocking clash-overlap disclaimer) and to
apply the razor-layer repo-type OFFER FILTER (a razor skill whose `applicability` doesn't
intersect the current project's repo type(s) is omitted from the wizard entirely — board decision
d20); `core/skill-selection.ts` reads `applicability` to enforce the SAME filter non-interactively
for `--include-skills` (a second gating axis alongside its existing `supportedAdapters`/`adapters`
check); `core/build-install-plan.ts`'s dry-run plan surfaces `description`/an `overlaps` count
per skill. See `src/core/CONTEXT.md` and `src/wizard/CONTEXT.md` for the consumer-side detail.

## Current state addendum (Milestone 9, 2026-07-11 — D21 skill-level dependencies)

`read-skill-manifest.ts` gained an optional `requires?: string[]` field (decisions.md D21):
structurally validated when present (array of non-empty strings — a `SkillManifestError` issue
otherwise), passed through untouched when valid, left `undefined` (not `[]`) when absent — every
pre-D21 skill.json needs zero migration. Whether a named dependency actually resolves to a real
skill in the catalog is NOT this file's job (a single skill.json can't know about its siblings) —
that cross-catalog check lives in `core/skill-selection.ts` (see `src/core/CONTEXT.md`).
`skill-catalog.ts`'s `SkillCatalogEntry` passes `requires` (defaulted to `[]`) and
`supportedAdapters` through — see its own Directory Layout entry above. No other file in this
directory changed.

`read-skill-manifest.ts` (this pass) now reads `skill.json` — see Directory Layout above. The pack
*importer* (`scripts/import-skill.ts`, spec §12 "Import hygiene") is also new this pass; it lives
outside `src/` (dev-time-only tool, not part of the built CLI) — see the package-root `context.md`
for where it's documented and run.

## Current state update (Milestone 7, 2026-07-10)

`read-skill-manifest.ts` gained `enablement: SkillEnablement` (decisions.md D19) — validated when
present (`"required"|"default"|"optional"`), defaulted to `"default"` when absent (both in
`defaultSkillManifest()`'s no-`skill.json`-at-all fallback and in `validateSkillManifest()`'s
own absent-field handling) — every skill authored before M7 needs zero migration. `scripts/
import-skill.ts` was updated to author `enablement: "default"` on every newly-imported skill's
`skill.json` (an owner hand-edits the rare "required"/"optional" case afterward — the 3 real
common skills are all hand-set to `"required"`, not produced by the importer). `skill-catalog.ts`
(new, see Directory Layout above) is the only new file in this directory this pass.
