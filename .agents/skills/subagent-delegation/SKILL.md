---
name: subagent-delegation
description: >-
  Invoke at the start of any task that requires real work — before writing or generating code,
  scripts, or assets; before fetching, researching, or verifying data, docs, licences, or web
  sources; before reading or cross-checking multiple files; before a build spike, debugging pass,
  or multi-step investigation. When this skill is active, such work is delegated to subagents, not
  done inline: the main thread stays a clean desk for planning and talking to the user, while subagents do the reading,
  fetching, coding, and verifying and report back tersely (via the caveman skill). The skill covers
  how to rank each job by complexity and criticality, pick the weakest capable subagent and model,
  brief it, run independent jobs in parallel, and keep delegation one level deep. Trigger even when
  the user just says "write the parser," "fetch the layers," "check the licence," or "find where
  these docs contradict" and never mentions subagents — delegation is the default. Skip only
  for answering from knowledge you already hold — the moment a tool would touch a file, a shell, or
  the web, it's a worker's job, however small.
---

# Subagent Delegation

## First: ensure the `worker` agent resolves

This skill's default agent type, **worker**, is defined by `worker.md` in this skill's own folder —
but it only registers if a copy or symlink exists in a `.claude/agents/` directory. **On activation,
check your available agent types for `worker`. If it's missing, self-heal before delegating anything:**

1. From the `.claude/skills/subagent-delegation/` folder this skill was loaded from, go up to its
   `.claude/` parent and ensure an `agents/` directory exists there (`mkdir -p`).
2. Create the registration in it: a relative symlink `worker.md → ../skills/subagent-delegation/worker.md`
   (preferred — keeps a single source of truth), or a plain copy of `worker.md` where symlinks
   aren't available (e.g. Windows).
3. The agent registry re-scans on change, so `worker` should resolve immediately. If it still
   doesn't, use **general-purpose** with the two hand-written brief lines (see "The delegation
   brief") for the rest of the session, and tell the user a session restart will complete the fix.

Beyond the native agent types there is a further transport (next section); the full ladder is:
**native typed agent → generic subagent → external CLI worker → inline fallback** — prefer the
leftmost rung the job allows.

## External CLI workers

A worker need not be a native subagent. Any agent CLI on PATH with a documented headless
(non-interactive) mode can execute a delegation brief and print a report — `claude -p`,
`codex exec`, `gemini -p`, `opencode run`, and kin. Dispatch them from the Bash tool (with
`run_in_background: true`, like any long worker). They are the third transport rung: reached
deliberately, not by default.

**When to reach for one:**
- **Cross-vendor verification** — a different model family refuting a claim is more independent
  than a same-family self-check; for high-criticality checks an external backend makes the
  no-self-certification rule structural rather than aspirational.
- **Quota/cost arbitrage** — spread load across the subscriptions you already pay for.
- **Model diversity on judge panels** — adversarial and comparative reviews sharpen when the
  judges don't share priors.

**Native first, leave for cause:** the host's own model family is the *default* at any tier — it's
integrated (session tools, native subagent mechanisms, no shell-out overhead) and usually cheapest
within the running subscription. The complexity × criticality matrix picks the *tier*; the family
stays native unless one of exactly three justifications holds:
- **Decisive task affinity** — the task's dominant requirement matches another family's standout
  strength and the gap is decisive, not marginal. Marginal quality differences never justify the
  hop: for general coding/reasoning the top-tier families are all excellent, so under Codex a
  same-tier GPT worker is the right pick and under Claude Code the Anthropic ladder is — but a
  video- or audio-analysis job routes to a Gemini-family backend (`agy` / Gemini CLI) from *any*
  host, because there the gap is decisive. Image-only understanding is marginal on current
  evidence, so native-first holds for image-only tasks.
- **Independence** — cross-family verification of a claim (no-self-certification).
- **Quota/cost arbitrage** — when the native subscription is constrained.

Affinity never overrides the wiring constraints: work that needs session-connected tools
(MCP servers, editor) stays native regardless. The rule is symmetric by design — "native" is
relative to whichever host this skill is installed under, so the same skill under a different host
flips its default family automatically.

**When not:** work that needs your session-connected tools (MCP servers, editor, browser), tight
back-and-forth iteration, or anything a native subagent does cheaper. Native remains the default
transport.

**The CLI roster file** — the probe result is a *file*, not a per-session ritual. Keep a
machine-readable roster in the project at `.agents/cli-roster.md` recording which agent CLIs exist
on this machine — the host itself included as the native row:

1. **Read before probing.** Before the first delegation of a session, read the roster if it
   exists — don't re-probe what it already answers.
2. **Probe once to create.** If it doesn't exist, run the probe — binary presence *and*
   auth/config state per known CLI (version probe, a help-text glance, the CLI's own status or
   doctor command where it has one) — once, and write the file. A binary without auth is not a
   backend.
3. **Trust entries; re-verify on failure or staleness.** Re-verify a row only when a dispatch
   against it fails or its last-verified date is older than ~30 days — and update the file in the
   same pass. The roster is a map: when the terrain disagrees, redraw the map (the same
   reality-wins principle as the docs discipline).
4. **Record negatives too.** "Not installed" / "installed, no auth" rows with dates prevent
   repeated wall-hits; when a wanted backend has no row at all, probe it and record the result
   either way.
5. **Machine-specific, not project truth.** Say so in the file's header, and gitignore it in
   shared repos.

```markdown
# Agent CLI roster — machine-specific; gitignore in shared repos
| CLI | Version | Headless invocation | Auth | Last verified | Status |
|---|---|---|---|---|---|
| (host, native) | … | … | ok | YYYY-MM-DD | native |
| … | … | … | ok / none | YYYY-MM-DD | available / no-auth / not installed |
```

**Dispatch contract:** the same delegation brief as any worker, plus — because an external CLI
carries no by-construction guarantees — the two hand-written lines (leaf: no spawning, no
recursion; caveman-terse report), plus an explicit bulk rule: *"write bulky output to `<path>`;
print only the path + a short summary to stdout."* Run non-interactively ONLY via the CLI's
documented headless mode — an approval prompt inside a background shell is a hung worker, not a
working one. Never bypass a CLI's sandbox/approval system with force-flags beyond its documented
non-interactive mode.

**Model mapping:** the haiku → sonnet → opus → fable ladder is Anthropic's; an external backend
maps that ladder to its own provider's tiers by cost/capability — and state the model explicitly
via the CLI's model flag.

**Trust rule:** an external worker's report gets the same treatment as any worker's — no
self-certification; verify per criticality.

**Known backends** (invocations verified against each CLI's own help text or official docs at time
of writing — re-verify with `--help` before first use on a new machine):

| CLI | Headless invocation | Model flag | Tier mapping (small → mid → large → frontier) | Notes |
|---|---|---|---|---|
| Claude Code | `claude -p "<brief>"` | `--model <model>` | `haiku` → `sonnet` → `opus` → `fable` (aliases) | `--output-format` for structured output; permission flags exist — stay within the documented non-interactive mode. Routing heuristic: agentic code-fix — decisive SWE-bench Verified lead (2026-07); peak per-token capability at highest price. |
| OpenAI Codex CLI | `codex exec "<brief>"` | `-m, --model <MODEL>` | `gpt-5.6-luna` → `gpt-5.6-terra` → `gpt-5.6-sol` (sol covers large and frontier) | `-s/--sandbox` selects sandbox policy; `-o <file>` writes the final message to a file. Routing heuristic: best price-performance tier-for-tier (decisive, 2026-07); marginal lead on terminal/long-horizon agentic benches. |
| Gemini CLI | `gemini -p "<brief>"` | `-m, --model <model>` | `gemini-2.5-flash-lite` → `gemini-3-flash-preview` → `gemini-3-pro-preview` (pro covers large and frontier) | `--approval-mode` (`default`/`auto_edit`/`yolo`/`plan`); `-o json` for structured output. Routing heuristic: video/audio multimodal — decisive (2026-07); image-only marginal; long-context claims conflicting/unverified. |
| Antigravity CLI (`agy`) | `agy -p "<brief>"` | `--model <model>` | names unverified — check `agy --help`/provider docs; Gemini-family ladder applies where Gemini models are used | Google's Antigravity CLI; the `antigravity` binary is the IDE and is NOT scriptable — script only via `agy`. Auth/config lives in `~/.antigravity/`. Routing heuristic: video/audio multimodal — decisive (2026-07); image-only marginal; long-context claims conflicting/unverified. |
| opencode | `opencode run "<brief>"` | `-m, --model <provider/model>` | reuse the addressed provider's mapping | Model is addressed as `provider/model`. |
| any other agent CLI | consult its headless-mode docs | consult its docs | see provider docs | Look for: a non-interactive/print/exec mode, a model flag, and how approvals behave headlessly. No documented headless mode → no dispatch. |

Model names verified as of 2026-07 — names churn, the ladder doesn't; when a name in this table no
longer exists, re-map by cost/capability, don't abandon the ladder.
Strength hints are routing heuristics as of 2026-07, grounded in a dated third-party benchmark
review (see `research/model-family-comparison-2026-07.md` in this skill's folder) — revise them
from your own results, not vendor marketing.
General reasoning/math: no decisive leader as of 2026-07 (top families within ~1 point on GPQA) —
native-first always holds there.

## The idea

The main thread's context is the project's scarcest resource. Every file you read, every search
you run, every doc you fetch inline gets burned into the conversation forever — it crowds out the
plan, the decisions, and the thread of talking to the user. Once it's full of raw material, your
thinking degrades and the user has to wade through clutter.

So treat the main thread as a **director's desk, not a workbench**. The desk holds the plan, the
decisions, the synthesized conclusions, and the conversation with the user. The heavy lifting —
reading, searching, fetching, generating, verifying — happens on **subagents**, who go off, do the
work, and hand back a compact result. You stay clean; they get their hands dirty.

This is the default posture wherever this skill is installed, not a special move. When a task arrives, your first
instinct should be *"who do I send for this?"*, not *"let me start reading."* The desk does **zero
project work**: its whole job is planning, deciding, and talking to the user — every act of project
work, however small, belongs to a worker.

## What to delegate, and what to keep

Delegation isn't free — spawning an agent costs a prompt, a round trip, and a brief. The answer to
that cost is batching, never doing the work on the desk. So:

**Delegate** (the default for real work):
- Codebase search and "where/which/how-many" sweeps across many files.
- Reading files, logs, large docs, or fetched pages to extract a few facts.
- Research and credibility checks (web, data sources, licences).
- Writing self-contained code, scripts, or assets to a clear spec.
- Verification passes ("is this claim true?", "does this compile/run?", "find the holes").
- Anything that produces a bulky artifact you don't need to read in full.

**Keep on the desk** (the desk's own functions):
- Talking to the user — questions, summaries, recommendations, decisions.
- The decomposition and orchestration itself (this skill).
- Final synthesis of what subagents returned.
- Reading evidence a worker hands back to verify its claim — inspecting a screenshot or log IS
  desk work; producing it is not.
- The agent's own memory/housekeeping bookkeeping.

If you catch yourself about to read a file or run a search inline, stop — that's a subagent's job.
**There is no tiny-op exception.** A one-line `mkdir`, a `grep` fact-check, a single-file read, a
quick `ls` — all of it goes to a worker. If the brief feels more expensive than the op, that's the
signal to **batch**: collect the trivial ops into one worker brief and send them together — not the
signal to do them yourself. Exceptions erode: each "it's just one command" burns context and sets a
precedent, and the desk's cleanliness *is* the product.

## No recursion: subagents are leaf workers

**This skill governs the main thread only — the director.** Delegation flows in exactly one
direction and exactly one level deep: the director sends workers; workers do not send workers.

A subagent receives its brief, does the whole job *itself*, and reports back. It must **not** spawn
its own subagents, and it must **not** re-invoke this `subagent-delegation` skill. If you are a
subagent reading this: you are a leaf worker — execute your brief directly and return the result.

The reason is survival, not style. If workers delegated too, every task would fan out into an
unbounded tree of agents, each re-triggering this skill and spawning more — a runaway loop that
burns the budget and never terminates. One director, many workers, one hop. That invariant is what
keeps the whole pattern safe.

Enforce it by construction first, brief second:
- **By construction (preferred)** — the **worker**, **Explore**, and **Plan** agent types cannot
  spawn subagents at all (the worker via `disallowedTools: Agent`; Explore/Plan have no spawn tool),
  so recursion is impossible by design. Use one of these and the guarantee is free.
- **In the brief** — only when you deliberately reach for a spawn-capable agent (e.g.
  **general-purpose**) must you add the leaf line by hand: *"do this yourself; do not spawn subagents
  or invoke the subagent-delegation skill."*

## Rank every job: complexity × criticality

Before you pick who to send, score the job on two axes. They answer different questions, and you
need both.

**Complexity — "how much capability does this need to be done *correctly*?"**
- **Low:** mechanical, well-specified, one clear answer. Grep, extract a field, run a known
  command, fetch and summarize one page, locate files.
- **Medium:** multi-step with some judgement; synthesis across a few sources; write a
  self-contained function/script to spec; trace code; compare a handful of options.
- **High:** novel design, architecture, ambiguous or open-ended reasoning, subtle cross-cutting
  debugging — work that requires holding many interdependencies at once.

**Criticality — "how much does a wrong or sloppy result cost?"**
- **Low:** scratch/exploratory; cheap to redo; nothing downstream depends on it yet.
- **Medium:** feeds a decision or other work; a wrong answer wastes real time or misleads you.
- **High:** it ships, it's hard to reverse, or it touches correctness, safety, legal, or data
  licensing — the kind of thing the user will act on directly. (Anything governed by a project's
  binding policies — legal accuracy, safety rules, data licensing — is High by default.)

**The governing rule:**
> **Complexity sets the floor** — the weakest model that can actually produce a correct result.
> **Criticality decides how far above the floor to go** — whether you stay at the floor, step up a
> tier, and/or add a second, independent agent to verify.

The bias is always **downward**: reach for the weakest agent that clears the bar, and justify every
step up the ladder by either complexity (it can't be done otherwise) or criticality (being wrong is
expensive). When you're torn between two tiers, prefer **the cheaper one plus a verification pass** —
a "do it" agent and a separate "check it" agent often beat one expensive agent, and they keep the
weakest-capable bias honest.

## Pick the agent: type + model

A delegation is two choices — **what kind of agent** and **which model tier**.

**Agent types** (see the available-agents list for the full set):
- **worker** — the default workhorse: research, multi-step tasks, reads *and*
  writes/runs. **Caveman-terse and leaf-by-construction** — it cannot spawn subagents
  (`disallowedTools: Agent`) — so the brief needn't spell out either. First choice for "go do this
  self-contained chunk." (Defined in this skill at `worker.md`, installed to `~/.claude/agents/` — see
  the worker setup note below.)
- **Explore** — read-only search/locate across many files; returns conclusions, not file dumps. Leaf
  by construction. First choice for "find / where / which" sweeps.
- **Plan** — read-only architect; returns a step-by-step plan. Leaf by construction. Use for
  high-complexity design you don't want mutating files yet.
- **general-purpose** — the built-in read+write+run workhorse. Reach for it only when you need
  something the `worker` excludes (notably: it *can* spawn) — and then the caveman + no-delegation
  lines go back into the brief by hand.

**Model tiers**, weakest → strongest: **haiku** → **sonnet** → **opus** → **fable**. Set the model explicitly
on the agent call so you're choosing deliberately, not drifting to a default. External CLI backends
map this ladder to their own providers' tiers — see the backend table in "External CLI workers".

**The matrix** (recommended model; bias downward, verify where noted):

| Complexity \ Criticality | Low | Medium | High |
|---|---|---|---|
| **Low** | haiku | haiku | haiku **+ verify** (or sonnet if the lookup is subtle/error-prone) |
| **Medium** | haiku → sonnet | sonnet | sonnet **+ independent verifier** (opus only if reasoning is genuinely hard) |
| **High** | sonnet | sonnet → opus | fable **+ adversarial verify** (a second agent tries to refute it) |

"Verify" means a separate, cheap agent (or a quick main-thread spot-check) confirms the result —
not the same agent grading its own homework.

The matrix picks a tier; the family defaults to native and leaves only for cause — see "Native
first, leave for cause" under "External CLI workers".

## The caveman contract for subagents

**If you spawn the `worker` type, this is already baked in — you can skip ahead.** What follows is
what the worker encodes, and what you must add to the brief by hand only if you deliberately spawn a
non-worker agent (Explore, Plan, general-purpose).

Every subagent's working style — and above all its final report back to you — should be terse and
telegraphic: no preamble, no hedging, no restating the brief. This serves both goals at once: the
subagent burns fewer tokens, and you read less to get the result.

Two things to make explicit in the brief so terseness doesn't backfire:
- **Caveman governs expression, not rigor.** The subagent still does the *full* work — every read,
  every check, every verification step. It just reports the outcome compactly. A wrong answer
  delivered tersely is still wrong; terseness is never licence to skip steps.
- **Push bulky output to a file, return the path.** If the work produces a lot (a big GeoJSON, a
  long file, a full report), have the subagent write it to disk and return *just the path plus a
  short summary*. That's the single biggest lever for keeping the desk clean — the bulk never
  touches the main thread at all. Where a *finalized* artifact lands is governed by the project's
  documentation discipline (e.g. the `paper-trail` skill), if one is installed — scratch output
  goes to disposable scratch space, finished knowledge goes to its canonical home.

Caveman supports intensity levels (`lite`, `full`, `ultra`). **Workers report at `ultra`** — the
hardest compression. It's safe as the default because ultra abbreviates *prose only* (code symbols,
paths, API names, and error strings stay verbatim by rule) and its Auto-Clarity rule drops back to
plain wording wherever compression would create ambiguity. Drop to `full` only when a report must
carry subtle reasoning spelled out — e.g. an adversarial verifier explaining *why* a claim fails.

*Setup: caveman is a separate skill, installed via*
`npx skills add https://github.com/juliusbrussee/caveman --skill caveman`.
*If it isn't present, tell the subagent to report back in that same terse, telegraphic style
regardless — the contract holds either way.*

*Worker setup: see "First: ensure the `worker` agent resolves" at the top of this skill. A project
can override the default `worker` by placing its own `worker.md` in `<project>/.claude/agents/`.*

**The main thread never uses caveman.** Your job is the opposite: be maximally clear for the user
and for your own planning — well-structured prose, named tradeoffs, clean summaries. Caveman is for
the workers; clarity is for the desk.

## The delegation brief

Subagents can't see this conversation — they only get what you write. A weak agent with a tight,
self-contained brief beats a strong one guessing at context. Brief like this:

```
Objective:  one sentence — exactly what to produce.
Inputs:     exact paths, URLs, bbox, prior decisions the agent needs (it sees none of our chat).
Constraints: what to respect — read-only? don't touch X? which project policies apply?
Return:     the exact shape you want back — a list? a file path + summary? a yes/no + evidence?
            Prefer "write bulky output to <path>, return the path + a short summary."
```

Spawn the **worker** type and that's the whole brief — the leaf-worker rule and the caveman-terse
contract are baked into the agent. Only if you deliberately spawn a **non-worker** agent (Explore,
Plan, general-purpose) do you append the two lines by hand:

```
Scope:  you are a leaf worker — do this yourself; do NOT spawn subagents or invoke this skill.
Style:  invoke the `caveman` skill at `ultra`; report terse; rigor unchanged.
```

**Label every dispatch `backend:model`.** Every worker thread's title starts with the backend and
model it runs on, then the task: `<backend>:<model> — <short task>` — e.g.
`claude:opus — decode vendor DLL`, `codex:gpt-5.6-terra — verify importer`,
`agy:gemini-3-pro — video analysis`, `gemini:flash — fetch licence pages`.
- **Backend** = the CLI name as it appears in the roster (`claude`, `codex`, `gemini`, `agy`, …);
  native workers use the host's own name.
- **Model** = the short alias actually requested (`haiku`, `opus`, `terra`, `gemini-3-pro`); if
  dispatching on the CLI's default model, use the neutral tier name instead (`mid`, `frontier`) so
  the label never lies.
- **Where it goes:** the host's task-label field for native workers (Claude Code: the Agent tool's
  `description` param); for external CLI workers, the shell task's description/label field.

The fleet view becomes an audit trail: family routing, tier choices, and native-first compliance
are visible at a glance instead of buried in transcripts.

## Parallelism

When subtasks are independent, spawn them **in one batch** so they run concurrently and you
synthesize once — this is where delegation pays off most. When one feeds the next, either chain
them or give a single agent the whole chain. Don't serialize work that has no dependency between
its parts.

## Don't freeze the desk: run workers in the background

Delegating is only half the move — *how you wait* matters just as much. The failure mode is
dispatching a worker on a **blocking** call and then sitting frozen until it returns: the chat goes
dead, and the user's only way to say anything is to interrupt a running tool. A frozen desk isn't a
clean desk, it's an abandoned one. The director keeps talking while the workers are out.

So **default to background execution.** Dispatch the worker with `run_in_background: true`, then
immediately hand control back to the user with a useful message — what you sent, what you expect
back, and what you'll do with it — and end your turn. The desk stays **live**: the user can react,
redirect, add a constraint, kick off something else, or ask an unrelated question while the work
runs. When the worker finishes you're notified, and you pick the thread back up and synthesize.
(This is exactly how the user has had to *force* questions in mid-task — make a live desk the norm,
not the exception they have to interrupt for.)

**Block on a foreground call only when waiting costs the user nothing** — the job is genuinely quick
*and* you have nothing useful to say or do until it returns. If you'd otherwise be narrating
"working on it…" while a multi-minute agent grinds, that's the tell: background it instead.

Background and parallelism compose: fire a whole independent batch in the background at once, keep
talking to the user, and fold in each result as it reports — and you can check on a long run or pull
partial output without stalling. The rule of thumb: **after you dispatch, your next act is to talk
to the user, never to stall.**

## Worked examples

**A — "What's in this data slice?"** (fetch a dataset/page for a given scope, summarize contents.)
Low–medium complexity, low–medium criticality. → a **haiku** `worker` (or
**Explore** for a pure repo read). Write the raw output to a file, return counts + highlights + the path.

**B — "Write the importer module."** (foundation code that ships.)
Medium–high complexity, **high** criticality. →
a **sonnet** `worker` writes it, returning the file path + a terse note on what it does and any
TODOs — then a **separate** `worker` confirms it compiles and the core logic is right.

**C — "Confirm the data source's licence."** (legal, will be acted on.)
Low complexity but **high** criticality. → a **haiku** `worker` fetches and reads the source, but
**verify** (a second `worker`, or a main-thread check) because the cost of being wrong is high.
Return the licence + a direct source quote.

**D — The desk line:** the user asks a one-line question about the plan — answer from what you
already hold; that's desk work. But the one-known-line doc edit that used to ride along "because
it's quicker" goes to a **small** worker, batched with whatever else is pending — the desk itself
touches nothing.

## In one line

Director's desk stays clean, clear, and live: send the weakest worker who clears both the complexity
and the criticality bar, run them in the background, keep talking to the user while they work, and
synthesize the caveman-terse result when it lands — the desk itself touches nothing.
