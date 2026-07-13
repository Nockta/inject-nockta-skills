# inject-nockta-skills

> Render bundled, versioned **Nockta AI skill packs** into adapter-specific outputs for a repo you already have.

`inject-nockta-skills` is a wizard-first, monorepo-aware, deterministic CLI that installs Nockta's
curated AI-agent guidance ("skill packs") into an existing project. It reads bundled skill content,
resolves the right packs for your project's type(s), lets you tune the exact skill set, and writes
native files for whichever AI tools you use — Claude Code (`.claude/`), Cursor (`.cursor/rules/`),
GitHub Copilot (`.github/instructions/`), Google Antigravity (`.agents/skills/`), and the generic
`AGENTS.md` surface — then tracks every generated file so it can detect drift and safely repair or
upgrade later.

- **Who it's for:** teams standardizing how their AI coding agents behave across many repos, without
  hand-copying prompt/instruction files or re-authoring them per tool.
- **What makes it different:** the content is *bundled and versioned* (not fetched at install time),
  the same skill renders into *every* adapter you select, and installs are *idempotent and
  auditable* — a manifest records exactly what was written so `doctor`/`repair`/`upgrade`/`sync`
  can reason about it.

---

## Table of contents

- [What it does](#what-it-does)
- [Install & quick start](#install--quick-start)
- [Core concepts](#core-concepts)
  - [Skill packs vs. skills](#skill-packs-vs-skills)
  - [Adapters & output paths](#adapters--output-paths)
  - [Enablement tiers](#enablement-tiers)
  - [Skill dependencies](#skill-dependencies)
  - [The razor layer & repo-type applicability](#the-razor-layer--repo-type-applicability)
  - [The clash disclaimer](#the-clash-disclaimer)
  - [Multi-type & monorepo detection](#multi-type--monorepo-detection)
- [The wizard](#the-wizard)
  - [Web wizard mode (`--web`)](#web-wizard-mode---web)
- [CLI reference](#cli-reference)
- [Adapter outputs](#adapter-outputs)
- [Monorepo usage](#monorepo-usage)
- [Determinism & doctor](#determinism--doctor)
- [Skill catalog overview](#skill-catalog-overview)
- [Telemetry in bundled Shopify skills](#telemetry-in-bundled-shopify-skills)
- [Attribution & license](#attribution--license)
- [Releasing](#releasing)
- [Contributing / authoring skills](#contributing--authoring-skills)

---

## What it does

Given a repo, `inject-nockta-skills`:

1. **Detects** whether the repo is a single project or a monorepo, and guesses its project type(s)
   from on-disk signals.
2. **Resolves** the set of bundled skill packs implied by that type — always including the
   `common` pack (core workflow skills) and the always-available `razor` principles layer, plus the
   pack(s) for your specific stack, followed transitively through pack-level `requires` edges.
3. **Lets you tune** the exact skill set: required skills are locked on, defaults can be toggled off,
   optionals toggled on, and dependencies auto-enable and lock the skills they need.
4. **Renders** the selected skills into native output files for each adapter you chose.
5. **Records** everything it wrote in `.nockta/` metadata (a profile + a generated-file manifest, plus
   a target registry for monorepos) so later runs can detect drift and repair or upgrade
   deterministically.

Nothing is downloaded at install time — all skill content ships inside the package (`packs/`), so a
given package version always produces the same output for the same inputs.

---

## Install & quick start

The package publishes a single bin, `inject-nockta-skills`. The normal entry point is `npx` — no
global install required. Node **>= 20** is required.

Run it in the root of the repo you want to add skills to:

```bash
npx inject-nockta-skills
```

With no flags on an interactive terminal, this launches the **interactive wizard** (detect → pick
type(s) → pick adapters → pick skills → preview → confirm → write → optional extras). This is the
recommended first-run path.

If you already know exactly what you want, drive it non-interactively instead:

```bash
# Single Next.js project, Claude + Cursor outputs, no prompts
npx inject-nockta-skills --type next --adapters claude,cursor --yes
```

Preview the fully-resolved plan without writing anything:

```bash
npx inject-nockta-skills --type next --adapters claude --dry-run
```

Check what's bundled before installing:

```bash
npx inject-nockta-skills list
```

> The root invocation and the explicit `install` subcommand are byte-for-byte equivalent —
> `npx inject-nockta-skills --type next ...` and `npx inject-nockta-skills install --type next ...`
> run the exact same code path. Use whichever reads better.

<!-- VERIFIED-EXAMPLE: real captured local run, both commands exited 0 -->

```
$ inject-nockta-skills install --type vite-react-ts --adapters claude,cursor,agent --yes --json
{"ok":true,"command":"install","exitCode":0,"summary":"installed 131 files across 3 packs (common, razor, vite-react-ts) for adapters: claude, cursor, agent; 0 packs skipped (planned)", ...}
# produces: .claude/agents/worker.md + .claude/skills/{16 skills}, .cursor/rules/nockta-common.mdc + nockta-vite-react-ts.mdc, AGENTS.md, CLAUDE.md (@AGENTS.md import), .nockta/generated-manifest.json + skills-profile.json

$ inject-nockta-skills doctor
✓ healthy — 131 file(s) intact, current at v0.1.0
intact: 131  missing: 0  modified: 0  stale: 0  unknown: 0
```

Omitting the required flags fails fast with the same enum list the wizard offers, rather than a
generic usage error:

```
$ inject-nockta-skills install
✗ missing required --type <repoType>[,<repoType>...]. Valid repo types: next, vite-react-ts, nest, shopify-app, shopify-theme, shopify-headless, react-native, expo
```

---

## Core concepts

### Skill packs vs. skills

A **skill** is one unit of agent guidance — a `SKILL.md` (plus any companion docs, `scripts/`,
`assets/`, and, for Claude, optional `agents/*.md` subagent definitions). A **pack** is a named
bundle of skills for a domain, described by a `pack.json`:

```jsonc
{
  "name": "next",
  "displayName": "Next.js",
  "description": "Nockta AI skills for Next.js App Router projects.",
  "requires": ["common"],           // pulls the common pack transitively
  "skills": ["react-best-practices", "nextjs-app-router-patterns", "..."],
  "adapters": ["claude", "cursor", "copilot", "agent"]
}
```

Packs are resolved for you from your project type(s). Two packs are **always resolved**, regardless
of type:

- **`common`** — core Nockta workflow skills used on every project.
- **`razor`** — the optional [razor principles layer](#the-razor-layer--repo-type-applicability)
  (every skill defaults *off*).

The **`monorepo`** pack is additionally resolved in monorepo mode. Pack-level `requires` edges are
followed transitively (e.g. `next` → `common`; `expo` → `react-native` → `common`).

A pack is only ever *offered* once every skill it declares has real authored content on disk
(`SKILL.md` present) — the "D6 content gate". A pack with a missing skill file is reported as
**planned**, never installed. (As of this release, all 11 bundled packs are fully installable.)

### Adapters & output paths

An **adapter** turns the selected skills into the native file format of a specific AI tool. Five
adapters exist; each writes to a distinct, well-known location:

| Adapter       | Output location                                     | Shape                                                                 |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `claude`      | `.claude/skills/<skill>/` (+ `.claude/agents/*.md`) | One directory per skill (full skill dir copied); flat agent files     |
| `cursor`      | `.cursor/rules/nockta-<pack>.mdc`                   | One `.mdc` rule file **per pack** (YAML frontmatter, `alwaysApply`)   |
| `copilot`     | `.github/instructions/nockta.instructions.md`       | **One** combined instructions file covering every pack                |
| `agent`       | `AGENTS.md` (repo root)                             | **One** combined plain-markdown file covering every pack              |
| `antigravity` | `.agents/skills/<skill>/`                           | One directory per skill (full skill dir copied) — Google Antigravity (IDE + `agy` CLI), the `.claude/` full-injection mirror; no agent files |

See [Adapter outputs](#adapter-outputs) for the exact file rules per adapter.

### Enablement tiers

Every skill declares one of three tiers in its `skill.json` (absent ⇒ `default`):

| Tier       | Starts | Can the user change it?                                   | Flag                |
| ---------- | ------ | --------------------------------------------------------- | ------------------- |
| `required` | on     | **No** — locked on, always installed                      | —                   |
| `default`  | on     | Yes — toggle **off**                                      | `--exclude-skills`  |
| `optional` | off    | Yes — toggle **on**                                       | `--include-skills`  |

The **effective set** installed is:

```
effective = closure( (required ∪ default ∪ includedOptionals) \ excludedDefaults )
```

Excluding a `required` skill is an error. Excluding a `default` skill that some enabled skill still
`requires` is also an error (it stays locked on — see below).

### Skill dependencies

A skill may declare `requires: [...]` naming other skills it hard-depends on. Enabling a skill
**auto-enables and locks its entire `requires` closure**: those dependencies are pulled in, marked
"locked on", and cannot be excluded while the dependent is enabled. In the wizard a locked row shows
`🔒 required by <dependent>`; releasing the last dependent that needed it unlocks it.

Dependencies are **gated**: a dependency that can't be satisfied under the selected *adapters* (or,
for razor skills, the current repo *types*) makes an explicit `--include-skills` of the dependent an
error rather than a silent partial install. Cycles are detected and rejected. Real dependency edges
in the bundled content today:

- `improve-codebase-architecture` → `codebase-design`, `grilling`, `domain-modeling`
- `grill-me` → `grilling`

The recorded `included` deltas are **dependency-closed** at write time, so re-resolving the same
profile later reproduces the identical effective set.

### The razor layer & repo-type applicability

The **`razor`** pack is a 61-skill personal engineering-doctrine layer (authored by Razor,
distributed by Nockta). It's always *resolved* but every skill imports at tier `optional` — nothing
in it auto-installs. Each razor skill declares an `applicability: RepoType[]` list, and is only
*offered* when that list intersects the current project's type(s):

- universal principles → all 8 repo types
- data + realtime principles → backend types (`nest`, `shopify-app`, `shopify-headless`)
- framework principles → their type (`nest` → nest, `next` → next, the three Shopify types → shopify)
- react principles → the React-family types

A razor skill not applicable to your project's type(s) is **omitted entirely** from the wizard (not
shown disabled), and is rejected if named via `--include-skills`. A skill with no `applicability`
(every non-razor skill) is applicable everywhere.

### The clash disclaimer

Some skills cover overlapping ground with others. When a skill declares `clashesWith: [...]`, the
wizard appends a **non-blocking, advisory** disclaimer to that skill's description. It never prevents
selection — it's purely informational. The exact format rendered from source is:

```
 ⚠ Overlaps with: <name>, <name (razor)>, … — enable at your discretion.
```

Clash ids are either bare skill names (e.g. `codebase-design`) or `razor:<name>` for razor-layer
skills; a `razor:`-prefixed id displays as `<name> (razor)`. The clash data is advisory/heuristic,
sourced from a curated clash map at import time.

### Multi-type & monorepo detection

A single repo can span **multiple** project types (decisions.md D22). `--type` accepts a
comma-separated list, and the wizard's type step is a multi-select checkbox — the union of every
named type's pack is installed:

```bash
npx inject-nockta-skills --type shopify-theme,vite-react-ts --adapters claude --yes
```

Monorepo mode is detected from any of these signals (spec §9.1):
`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `rush.json`, or a non-empty
`workspaces` field in the root `package.json`.

There's one refinement worth knowing: a repo that is **both** a workspace root **and** itself a
real project (e.g. a Shopify Liquid theme at the root with a `packages/*` Vite/React frontend) is
treated as **one multi-type install at the root**, not a per-workspace-package monorepo install —
unless you explicitly pass `--monorepo` or `--target`, which always win.

---

## The wizard

Running `npx inject-nockta-skills` on an interactive terminal with insufficient flags launches the
9-step wizard. Any flags you *did* pass become presets that short-circuit their step (an explicit
`--type` in particular skips detection entirely). The steps:

1. **Detect repo shape.** Single-project vs. monorepo, from the signals above. Narrates the decision
   — including the "root-is-a-project monorepo" override when it fires.
2. **&nbsp;3. Select project type(s).**
   - *Single project:* a checkbox of all repo types, with detected types pre-checked and their
     confidence + evidence shown (`next (detected — 90% confidence)`). Confirm, add, or remove.
   - *Monorepo:* discover workspace targets from workspace globs, offer them as a checkbox (each with
     a guessed type + confidence), and confirm each selected target's type(s). Falls back to a
     bounded manual `<path>:<type>` entry when nothing is auto-discovered.
3. **Select adapters.** A checkbox of `claude`, `cursor`, `copilot`, `agent`, `antigravity` (the
   `agent` and `antigravity` choices carry a description of which tools they cover). All five have
   real renderers — nothing is "coming soon".
4. **Select skills.** A navigable checkbox of every *non-razor* skill the resolved packs provide, each
   labeled with its tier and source pack: `paper-trail [required] (pack: common)`. Behavior:
   - `required` rows are checked and disabled (locked on).
   - `default` rows start checked (toggle off); `optional` rows start unchecked (toggle on).
   - Each choice's description is the skill's own `SKILL.md` description, plus the
     [clash disclaimer](#the-clash-disclaimer) when applicable.
   - Enabling a skill with `requires` **locks** its dependencies on with a `🔒 required by …` label;
     the list re-prompts until the lock state converges (usually one round).
   - Skills renderable by none of your selected adapters are omitted.
   - When every offerable skill is `required` (nothing to toggle), this step is skipped.

   **Select razor doctrine.** Its own step, immediately after — the same checkbox UI, scoped to the
   [razor pack](#the-razor-layer--repo-type-applicability), sectioned by category (Core, Architecture,
   Security, Testing, Delivery, Data, Realtime, Tooling, and per-framework domains). Every razor skill
   is `optional` (starts unchecked); a skill not applicable to your project type(s) is omitted, not
   shown disabled. Skipped entirely when nothing in the pack applies to your type(s).
5. **Preview generated files.** The exact list of files that will be written, plus which packs are
   installable / planned / missing — computed by rendering into a throwaway scratch directory, so
   *nothing is written to your repo before you confirm*.
6. **Confirm.** (A preset `--yes` short-circuits to "yes".)
7. **Write.** Delegates to the *same* install core the non-interactive path uses — identical exit
   codes, JSON shape, and safety guarantees.
8. **Optional extras.** After a successful write only: offers to run `npx claude-mem install`
   (third-party personal tooling Nockta suggests but doesn't own). Defaults to **No**; auto-skipped
   if already installed. Best-effort — a failure never changes the install's result.

*(Steps map to the source flow 1–9; steps 2–3 collapse the "detect type" + "confirm type" pair, and
"select skills" is step 5 internally.)*

> `--json` + the wizard: this package's own narration is suppressed in `--json` mode, but the
> underlying interactive prompt UI can't be silenced on a real TTY. Machine consumers should pass
> sufficient flags to route to the non-interactive path (which never prompts and never hangs).

### Web wizard mode (`--web`)

`npx inject-nockta-skills --web` (or `install --web` / `wizard --web`; decisions.md D30) starts a
local HTTP server bound to `127.0.0.1` on a random port, carrying a one-time token, and serves a
self-contained page (inline CSS/JS, no external requests) rendering the same wizard schema the
terminal steps above use. Pick your options in the browser; on submit the page POSTs back once, the
server validates the token, runs the install, shows a "done — you can close this tab" screen, and the
CLI proceeds. Falls back to the terminal wizard (or `--yes` headless) when no display is available;
`--cli` forces the terminal path even if `--web` is also given; `--no-open` prints the URL without
launching a browser. `wizard --emit-schema [--type ...] [--adapters ...]` prints the resolved wizard
schema as JSON and exits (no server) — this is the exact contract `create-nockta-repo --web` spawns to
host this package's adapter/skill/Razor selection UI inside its own page, so the two never drift.

---

## CLI reference

Global options are declared **once on the root command** and are recognized anywhere on the line
(before or after a subcommand). This is why `--json`, `--type`, `--adapters`, `--yes`, etc. work
identically for the root short-form and the `install` subcommand.

### Global options

| Option                    | Applies to                | Description                                                                                       |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `-v, --version`           | all                       | Print the installed version.                                                                     |
| `--json`                  | all commands              | Print exactly one machine-readable JSON result to stdout (stable contract, spec §7.9).           |
| `--type <repoType>`       | install                   | Repo type for a standalone project root. Comma-separated for multiple types (e.g. `next,nest`).  |
| `--target <spec>`         | install                   | Monorepo target `path:type` (canonical, **repeatable**); or bare `path` with `--type`.           |
| `--monorepo`              | install                   | Force monorepo mode.                                                                              |
| `--adapters <adapters>`   | install                   | Comma-separated adapter list (`claude`, `cursor`, `copilot`, `agent`, `antigravity`).             |
| `--yes`                   | install, sync             | Confirm a non-interactive install, or skip the wizard's final confirm step.                      |
| `--exclude-skills <names>`| install                   | Comma-separated skill names to drop from the default set (excluding a `required` skill errors).   |
| `--include-skills <names>`| install                   | Comma-separated `optional`-tier skill names to add.                                              |
| `--dry-run`               | install, sync             | Print the fully-resolved plan and write **nothing**. Bypasses `--yes`.                            |
| `--with-claude-mem`       | install (non-interactive) | After a successful install, also run `npx claude-mem install` (best-effort, third-party).        |
| `--web`                   | install, wizard           | Open a local browser page to run the wizard (decisions.md D30). Falls back to the terminal wizard (or `--yes`) when no display is available. |
| `--cli`                   | install, wizard           | Force the terminal wizard even if `--web` is also given (decisions.md D30).                       |
| `--no-open`               | install, wizard           | With `--web`: serve and print the URL but do not auto-launch a browser (decisions.md D30).        |
| `--emit-schema`           | wizard                    | Print the wizard schema (`buildWizardSchema()`) as JSON to stdout and exit — no server, no page. This is the contract `create-nockta-repo --web` uses to host inject's skill-selection UI inside its own page (decisions.md D30). |

### Commands

| Command                             | Own flags   | Purpose                                                                                |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| *(root, no subcommand)* / `install` | *(globals)* | Install skill packs — wizard on a TTY with insufficient flags, flag-driven otherwise.  |
| `wizard`                            | *(globals)* | Run the install wizard explicitly (terminal, or `--web` for a browser page); `--emit-schema` prints the schema and exits. |
| `doctor`                            | —           | Validate the current install against the generated-file manifest.                     |
| `repair`                            | `--force`   | Recreate missing/damaged generated adapter outputs.                                   |
| `upgrade`                           | `--force`   | Re-render adapter outputs using the currently installed package version.              |
| `sync`                              | *(globals)* | Determine what the repo needs (doctor → repair/upgrade) and run it.                    |
| `list`                              | `--details` | List bundled packs and adapters that have real authored content.                      |

> `repair --force` / `upgrade --force`: overwrite generated paths **even if user-modified**. Without
> `--force`, user-modified files are warned about and left untouched.
>
> There is **no** `--skills-version` flag on this package — skill content is bundled with the package
> version, so the package version *is* the skills version. `upgrade` re-renders at the installed
> package version. (`--skills-version` exists on the sibling `create-nockta-repo` CLI, where it pins
> which version of *this* package gets spawned — different concern, different tool.)

### `install`

Two paths, chosen automatically:

```bash
# Single-project, non-interactive
npx inject-nockta-skills install --type next --adapters claude,cursor,copilot,agent --yes

# Multi-type single project
npx inject-nockta-skills install --type shopify-theme,vite-react-ts --adapters claude --yes

# Tune the skill set
npx inject-nockta-skills install --type next --adapters claude \
  --exclude-skills tdd --include-skills using-git-worktrees --yes

# Plan only, write nothing
npx inject-nockta-skills install --type nest --adapters claude --dry-run

# Monorepo (see the Monorepo usage section)
npx inject-nockta-skills install \
  --target apps/web:next --target apps/api:nest --adapters claude --yes
```

Requirements & behavior:

- `--type` (or `--target`) is required for a non-interactive install; so is `--adapters`.
- `--yes` is required to actually write (there's no interactive confirmation on the non-interactive
  path). `--dry-run` bypasses this — it never writes, so there's nothing to confirm.
- On success, writes `.nockta/skills-profile.json`, `.nockta/generated-manifest.json` (and, for
  monorepos, `.nockta/targets.json`) plus the adapter output files.

### `list`

```bash
npx inject-nockta-skills list             # human summary
npx inject-nockta-skills list --details   # per-skill breakdown
npx inject-nockta-skills list --json      # machine-readable (enum-parity contract surface)
```

`list --json` is the stable surface a sibling tool uses to assert `RepoType`/`AdapterType` enum
parity, so its shape is a versioned contract.

### `doctor`

```bash
npx inject-nockta-skills doctor
npx inject-nockta-skills doctor --json
```

Read-only. Classifies every tracked file and reports overall health + a suggested next action. See
[Determinism & doctor](#determinism--doctor).

### `repair` / `upgrade`

```bash
npx inject-nockta-skills repair            # restore missing, refresh stale; skip user-modified
npx inject-nockta-skills repair --force    # also overwrite user-modified files
npx inject-nockta-skills upgrade           # re-render with the current package version
npx inject-nockta-skills upgrade --force
```

`repair` recreates missing files and safely refreshes stale-by-source ones. `upgrade` re-renders
*all* generated output at the currently-running package version and bumps the profile's version
fields, reporting the old→new delta. Both refuse to clobber user-modified files without `--force`,
and both treat "skipped user-modified files" as a *correct, warned* outcome — not a failure.

### `sync`

```bash
npx inject-nockta-skills sync            # doctor, then repair/upgrade per the confirmation policy
npx inject-nockta-skills sync --yes      # auto-apply
npx inject-nockta-skills sync --dry-run  # plan only, write nothing
```

The orchestrator: runs `doctor`, decides whether `repair` and/or `upgrade` are needed, and applies
them per the confirmation policy (interactive confirm, or `--yes` to auto-apply, or `--dry-run` to
plan only). A missing/invalid profile routes you back to `install`.

### Exit codes

Shared across every command (`--json` mode reports the same value in `exitCode`):

| Code | Name                        | Meaning                                                        |
| ---- | --------------------------- | ------------------------------------------------------------- |
| `0`  | `SUCCESS`                   | Completed successfully.                                        |
| `1`  | `INVALID_PROFILE_OR_TARGETS`| Bad/missing input, profile, or targets; invalid skill selection; user-declined wizard. |
| `2`  | `MISSING_PACKS`             | A requested pack was not found on disk.                        |
| `3`  | `RENDER_FAILURE`            | A renderer failed.                                             |
| `4`  | `SYNC_ACTION_REQUIRED`      | `doctor`/`sync` found issues, or a plan-only/declined `sync`.  |

Every command in `--json` mode prints exactly one JSON object of the shape
`{ ok, command, exitCode, summary, data, errors? }`.

---

## Adapter outputs

What each adapter writes, in detail:

| Adapter   | Files produced                                                            | Notes |
| --------- | ------------------------------------------------------------------------- | ----- |
| `claude`  | `.claude/skills/<skill>/` — the **entire** bundled skill directory copied verbatim (SKILL.md, companion docs, `scripts/`, `assets/`, …) **except** `skill.json` and `.DS_Store`. Plus `.claude/agents/<agent>.md` (flat) when the skill declares `outputs.claude.agents`. | Straight copy; a heavy skill ships fully self-contained (its `scripts/validate.mjs` runs from the target dir). |
| `cursor`  | `.cursor/rules/nockta-<pack>.mdc` — **one rule file per pack**, YAML frontmatter (`description`, empty `globs`, `alwaysApply: true`) + the pack's skills concatenated. | "Always" rules — pack guidance is always-relevant. Filename is `nockta-`-prefixed to avoid colliding with user-owned `.cursor/rules/*.mdc`. |
| `copilot` | `.github/instructions/nockta.instructions.md` — **one** combined file, one section per pack. | Never touches `.github/copilot-instructions.md`. |
| `agent`   | `AGENTS.md` at the repo root — **one** combined plain-markdown file: the standing-mode contract block as preamble, then one section per pack, with a "Generated by inject-nockta-skills" intro. | No frontmatter. Never emits agent artifacts (AGENTS.md has no agent-registration mechanism). See [Standing-mode contract](#standing-mode-contract-root-agentsmd). |
| `antigravity` | `.agents/skills/<skill>/` — the **entire** bundled skill directory copied verbatim (same blocklist as `claude`: everything **except** `skill.json` and `.DS_Store`). For Google Antigravity (the IDE and the `agy` CLI). | The full-injection **peer of `claude`** (not the text-only `agent` surface) — Antigravity gets "the `.claude/` treatment". Emits the plural `.agents/` (current default), never legacy `.agent/`. No agent files: Antigravity has no agents-dir concept, so a skill's `agents/*.md` ships only as an ordinary in-dir companion, never promoted to a registry (the worker-leaf rule rides the standing-mode contract in `AGENTS.md`, which Antigravity reads natively). |

Cross-cutting rules:

- **Skill selection is applied first.** A skill not in the effective set is skipped in every adapter.
- **Adapter restriction is a skip, not an error.** A skill whose `supportedAdapters` omits the
  adapter, or whose `outputs.<adapter>` is `false`/undeclared, simply produces no output for that
  adapter and is reported as skipped.
- **Hand-authored overrides win (D1).** A `packs/<pack>/adapters/<adapter>/…` override file replaces
  the mechanical transform at that adapter's output granularity (per-file for claude, per-pack for
  cursor/copilot/agent). No bundled pack ships an override today.
- **`subagent-delegation` is adapter-portable** (D23): its prose renders for all five adapters; only
  its `worker.md` agent artifact is promoted to a registry under `claude` (`.claude/agents/`). Under
  `antigravity` the `worker.md` still ships as an ordinary in-dir companion (full-dir injection) but
  is never promoted, and under cursor/copilot/agent only the prose renders.
- **Standing-mode contract in `AGENTS.md` (single source).** Every install also states the Nockta
  working contract — the three required skills (`subagent-delegation`, `paper-trail`, `proof-of-done`)
  govern all agent work. See the next section.
- **Metadata is separate.** Every renderer only writes its own output location under the target dir;
  `.nockta/` metadata is written by the install core, keeping the safety boundary clean.

### Standing-mode contract (root `AGENTS.md`)

The contract text lives in **exactly one place** — root `AGENTS.md`, the cross-tool standard file
that Cursor, GitHub Copilot's coding agent, Codex and others read natively, and that Claude Code
imports. Every other adapter entry file just **references** it, so there's one source of truth and
no drift:

| File | What it carries | Ownership |
| ---- | --------------- | --------- |
| `AGENTS.md` (root) | The full contract block, marker-guarded (`<!-- nockta:standing-mode:start … -->`). | Written on **every** install regardless of adapters, and **never clobbers** a consumer's own `AGENTS.md` — see below. |
| `CLAUDE.md` (root) | A marker-guarded `@AGENTS.md` import line (Claude Code pulls the imported file into context at launch). | Written when the `claude` adapter is selected. Consumer-shared, untracked. |
| `.cursor/rules/nockta-*.mdc` | A one-line reference pointing at `AGENTS.md`. | Belt-and-suspenders — Cursor reads `AGENTS.md` natively. |
| `.github/instructions/nockta.instructions.md` | A one-line reference pointing at `AGENTS.md`. | Belt-and-suspenders — Copilot's coding agent reads `AGENTS.md` natively (since 2025-08). |

Safety and idempotence:

- **Existing-repo safe — including the `agent` adapter.** A consumer's own `AGENTS.md` / `CLAUDE.md`
  is never clobbered. For `CLAUDE.md` and the non-`agent` `AGENTS.md` side-effect, the marker-guarded
  region is created if the file is absent, refreshed in place if the marker is present, or appended
  after existing content if not. **Selecting the `agent` adapter is now safe too:** the agent renderer
  wraps its whole payload (contract preamble + skill sections) in an outer guard region
  (`<!-- nockta:agents:start … -->`) and **merges** it into any pre-existing `AGENTS.md` — your
  content outside that region is preserved verbatim, Nockta's region is refreshed in place.
- **No duplication on re-install / upgrade / repair.** Re-running never adds a second import line, a
  second contract block, or a second Nockta region — `repair` restores Nockta's region without
  touching your surrounding content.
- **Doctor semantics.** `CLAUDE.md` and any `AGENTS.md` that carries consumer content are
  consumer-shared files and are **never hash-tracked** as if Nockta owned them — they sit outside
  doctor's managed scan roots, so they're neither classified nor flagged "unknown"; their correctness
  is guaranteed by the idempotent re-application on every install/repair/upgrade instead. An
  `AGENTS.md` that Nockta generated **wholly** (a repo with no pre-existing one) *is* tracked and
  doctor covers it normally.

---

## Monorepo usage

Install into named workspace targets from the monorepo root. Each `--target` is `path:type`
(repeatable), and the type portion accepts a `+`-joined multi-type list:

```bash
npx inject-nockta-skills install \
  --target apps/web:next \
  --target apps/api:nest \
  --target packages/theme:shopify-theme+vite-react-ts \
  --adapters claude,cursor --yes
```

Split form (a single bare `--target` plus `--type`) and forcing mode:

```bash
npx inject-nockta-skills install --monorepo --target packages/ui --type vite-react-ts --adapters claude --yes
```

Behavior:

- Packs are resolved and rendered **once at the monorepo root** — there's a single `.claude/`,
  `.cursor/rules/`, etc., at the root, not one per member (spec §9.4).
- Every `--target` path must exist inside the repo (all bad paths are collected into one error).
- A target whose resolved path *is* the repo root is normalized to `.` (root install), not a
  distinct member.
- If `--target` is used without any monorepo signal detected, the install proceeds but warns; pass
  `--monorepo` to silence the warning.
- The chosen targets are recorded in **`.nockta/targets.json`** (schema-versioned) with each
  target's name, path, resolved repo type(s), and installable packs.

`doctor` validates monorepo installs across every member — checking `.nockta/targets.json` and each
target's existence + shallow plausibility (a `package.json` present) — and reports per-target issues.

---

## Determinism & doctor

Because all content is bundled and versioned, a given package version renders the same output for the
same inputs. Every generated file is recorded in `.nockta/generated-manifest.json` with two hashes
(the source content hash and the rendered output hash) plus the generator version. `doctor` compares
the current on-disk reality against that manifest and against a fresh "what would we render now" plan,
classifying each tracked file:

| Classification | Meaning                                                                                   | Fixed by |
| -------------- | ----------------------------------------------------------------------------------------- | -------- |
| `intact`       | On disk, output hash matches, source hash matches, generator version current.             | —        |
| `missing`      | Tracked in the manifest but not found on disk.                                            | `repair` |
| `modified`     | On-disk content differs from the hash recorded at generation time (user-edited).          | `repair --force` (or leave it) |
| `stale`        | Generator version bumped, bundled source content changed, or the file is no longer part of the current render plan. | `upgrade` |
| `unknown`      | An untracked file under a managed scan root (`.claude/skills/`, `.claude/agents/`, or `.agents/skills/`) — never touched by repair/upgrade. | — (informational) |

`doctor` emits a **suggested action** (`no-op` / `repair` / `upgrade` / `install`) and an exit code
(`0` healthy, `4` when action is required, `1` when there's no valid profile to check). `sync` is the
one-shot: it runs doctor and applies the suggested repair/upgrade per the confirmation policy.

A typical drift-and-heal cycle:

```bash
# something deleted a generated file
npx inject-nockta-skills doctor      # exit 4: "1 missing … suggested action: repair"
npx inject-nockta-skills repair      # restores it
npx inject-nockta-skills doctor      # exit 0: "healthy"
```

---

## Skill catalog overview

Eleven packs ship in this release. `common` and `razor` are always resolved; `monorepo` is added in
monorepo mode; the rest map 1:1 to a repo type (`--type <name>` resolves the pack `<name>`).

| Pack               | Repo type(s)        | Requires        | Covers                                                                    | Tier note |
| ------------------ | ------------------- | --------------- | ------------------------------------------------------------------------- | --------- |
| `common`           | *(always)*          | —               | Core Nockta workflow: paper-trail, proof-of-done, subagent-delegation, code review, TDD, debugging, planning, git worktrees, codebase design, domain modeling, brainstorming. | required + default + optional (design cluster) |
| `razor`            | *(always, gated)*   | —               | 61 engineering-doctrine principles (discipline, architecture, security, testing, delivery, tooling, data, realtime, and stack-specific for Nest/Next/Shopify/React). | **all optional**, repo-type-gated |
| `monorepo`         | *(monorepo mode)*   | `common`        | Turborepo, Nx workspaces, workspace package linking, monorepo management.  | mixed |
| `next`             | `next`              | `common`        | Next.js App Router: React best practices, composition, view transitions, cache-components, dev loop. | mixed |
| `vite-react-ts`    | `vite-react-ts`     | `common`        | Vite + React + TS: React best practices, composition, Vite, view transitions. | mixed |
| `nest`             | `nest`              | `common`        | NestJS best practices + expert patterns.                                  | mixed |
| `shopify-app`      | `shopify-app`       | `common`        | Shopify apps: Admin API, CLI, custom data, webhooks, Polaris, Functions, billing, extensions. | mixed |
| `shopify-theme`    | `shopify-theme`     | `common`        | Shopify Liquid themes: Liquid, accessibility, theme standards.            | mixed |
| `shopify-headless` | `shopify-headless`  | `common`        | Hydrogen / Remix / custom storefronts: Storefront GraphQL, Hydrogen, Weaverse cookbooks. | mixed |
| `react-native`     | `react-native`      | `common`        | Bare React Native: New Architecture, performance, native modules, navigation, TV, brownfield. | mixed |
| `expo`             | `expo`              | `react-native`  | Expo-managed RN: expo-router, native UI, modules, EAS (build/update/hosting/workflows). | mixed |

Within a pack, individual skills carry their own tier. In `common`, the three flagship workflow
skills — `paper-trail`, `proof-of-done`, `subagent-delegation` — are `required`; the
mattpocock-style design cluster (`codebase-design`, `grilling`, `domain-modeling`,
`improve-codebase-architecture`, `grill-me`) is `optional` with dependency locks; the rest are
`default`. Use `list --details` for the authoritative per-skill breakdown at any release.

Eight repo types are recognized: `next`, `vite-react-ts`, `nest`, `shopify-app`, `shopify-theme`,
`shopify-headless`, `react-native`, `expo`.

---

## Telemetry in bundled Shopify skills

The three Shopify packs (`shopify-app`, `shopify-headless`, `shopify-theme` — 15 skills total)
bundle scripts that ship **unmodified from Shopify's own official `shopify-ai-toolkit`**:
`track-telemetry.sh` / `track-telemetry.ps1`, `log_skill_use.mjs`, and telemetry embedded inside
`validate.mjs` / `search_docs.mjs`. When the agent runs one of these skills' scripts, they
**POST usage data to `https://shopify.dev/mcp/usage`**, including:

- the skill name, version, client, and session id;
- **up to 2000 characters of the user's verbatim prompt** that triggered the skill.

This is Shopify's own documented, **opt-out** instrumentation (not something Nockta added, and not
something Nockta has modified or stripped) — it ships exactly as Shopify built it, because whether
to opt out is the consumer's call to make, not Nockta's to make for them.

**To opt out**, set this environment variable wherever the agent runs the skill scripts (shell,
CI, or however your agent's tool-execution environment is configured):

```bash
OPT_OUT_INSTRUMENTATION=true
```

This applies to any project that installs `shopify-app`, `shopify-headless`, and/or
`shopify-theme`. Installing (or upgrading/repairing) one of these packs prints a one-line reminder
of this in the command summary; it's also present as a machine-readable `notices` field in
`--json` output.

---

## Attribution & license

Nockta skills are curated from, and inspired by, excellent public agent-skill work — but the skills
Nockta *distributes* are Nockta-authored or explicitly cleared for redistribution. Per-skill origin
and license are tracked in a `PROVENANCE.md` alongside each skill by convention.

Notable clean-room re-authoring: the Shopify theme skills `liquid-a11y` and `liquid-theme-standards`
were **independently re-authored from primary public standards** (WHATWG HTML, W3C CSS specs, MDN,
Shopify's public theme docs) in Nockta's own house style, superseding earlier versions inspired by
[benjaminsehl](https://github.com/benjaminsehl)'s `liquid-skills` that carried no redistribution
license. The re-authored skills are Nockta-owned and MIT-licensed at the skill level; benjaminsehl's
original content was used only as a topic checklist, with no prose, code, tables, or structure
reused (decisions.md D26/D27).

**License.** This package is Apache-2.0-licensed (see `package.json` `"license"` field, the root
`LICENSE` file, and the root `NOTICE` file). It remains `"private": true` in `package.json` pending
the owner's decision to publish — the license declaration is independent of that gate.

The bundled `razor` pack (`packs/razor/`) is a separate case: it is Razor's personally authored
engineering-doctrine skill layer and is licensed **MIT**, not Apache-2.0 — see `packs/razor/LICENSE`.
Every other bundled pack ships under this package's Apache-2.0 license. Third-party bundled skills
retain their own original licenses/provenance (see the clean-room note above and each skill's
`PROVENANCE.md`). The licenses, copyright notices, and full license texts for **every** bundled
third-party skill are collected — grouped by upstream repository — in the root
[`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md), which ships with the npm package.

---

## Releasing

Maintainer-facing release process (tag push → CI publishes to npm with provenance, no tokens after
first release) is documented in [`RELEASING.md`](./RELEASING.md).

---

## Contributing / authoring skills

Skills and packs live under `packs/`. The two manifests:

**`packs/<pack>/pack.json`** — declares the pack:

```jsonc
{
  "name": "next",
  "displayName": "Next.js",
  "description": "…",
  "requires": ["common"],
  "skills": ["react-best-practices", "..."],
  "adapters": ["claude", "cursor", "copilot", "agent"]
}
```

**`packs/<pack>/skills/<skill>/skill.json`** — declares one skill:

```jsonc
{
  "name": "improve-codebase-architecture",
  "supportedAdapters": ["claude"],
  "outputs": { "claude": { "skills": true, "agents": true } },
  "enablement": "optional",                 // required | default | optional (absent ⇒ default)
  "requires": ["codebase-design", "grilling", "domain-modeling"],
  "description": "…",                        // sourced from SKILL.md frontmatter at import
  "clashesWith": ["codebase-design"],        // advisory overlap, optional
  "applicability": ["next", "nest"],         // razor-layer repo-type gating, optional
  "files": ["worker.md", "references.md"]    // import-hygiene allowlist beyond SKILL.md
}
```

Every skill must have a `SKILL.md` (the D6 content gate) — a pack with any missing skill file is
reported `planned` and never installed. `description` is sourced from the skill's own `SKILL.md`
YAML frontmatter at import time (never hand-authored separately, to avoid drift). The `files` field
is the import-hygiene allowlist: only declared files survive import, stripping authoring scratch.

Skills are brought into the bundled `packs/` tree via the import scripts (`scripts/import-skill.ts`,
exposed as `npm run import-skill` / `import-common-skills` / `import-razor-skills`), which read
gathered skill sources, apply the `files` hygiene declaration, and write the per-skill `skill.json`.

Local development:

```bash
pnpm install
pnpm build          # tsup -> dist/
pnpm test           # vitest
pnpm typecheck
# prepublishOnly runs build && typecheck && test automatically on `npm publish`
```

### Local development / testing this package standalone

`npx inject-nockta-skills@latest ...` always resolves from the npm registry — it does **not** see a
local `npm link`. To exercise your local build's actual CLI end-to-end (not just unit tests against
the built modules), `npm link` this package into a scratch target repo and invoke the linked bin
directly:

```bash
cd inject-nockta-skills && pnpm build && npm link
cd /path/to/scratch-repo && npm link inject-nockta-skills
inject-nockta-skills install --type vite-react-ts --adapters claude --yes --json
```

This is the same path used for the verified example above. (For testing this package as *invoked by*
`create-nockta-repo`'s own local build, see that package's README — it uses a separate
`CREATE_NOCKTA_REPO_TEST_INJECT_BIN` env-var override instead, since `create-nockta-repo` always
hardcodes `@latest`/`@<version>` when spawning this CLI and so likewise never sees a plain `npm link`.)
