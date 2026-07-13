---
name: paper-trail
description: >-
  Where finished knowledge lives and what to consult before deciding. Invoke when substantial work
  concludes (feature built, bug root-caused, research finished, architecture decided) to file its
  documentation; before designing or briefing architecture (consult decision records first); when
  creating a module (seed its docs); or when the user says 'document this', 'update the docs', or
  asks where something is documented. Encodes: one canonical home per piece of knowledge; a root
  context.md as index-with-takeaways updated in the same pass; module-level CONTEXT.md/USAGE.md as
  the primary sources (in-module, docs/<module>/ mirror, or central docs/ — a declared layout
  profile); decision records consulted before new architecture.
---

# Paper Trail

## The idea

Knowledge that isn't filed is knowledge the next session rediscovers from scratch. Every finished
piece of work — a feature built, a bug root-caused, a research question answered, an architecture
decided — produces knowledge, and that knowledge either lands in a canonical, findable home or it
decays into chat scrollback and scratch files. This skill is the filing discipline: where finished
knowledge lives, how it stays findable, and what you consult before deciding anything that touches
existing structure.

## One canonical home

Every finished piece of knowledge has exactly **one** canonical home in the repo. Not two copies
that drift, not a scratch write-up that quietly becomes the reference — one home, declared and
indexed. Scratch and intermediate write-ups are disposable by definition: they serve the pass that
produced them and are deleted (or left to expire in scratch space) once the finished version is
filed. A scratch file that lingers is shadow documentation — the reader can't tell it from the real
thing, so it must not linger.

## The root map: context.md

The root `context.md` is the map of the project's documentation: an index with a **one-line
takeaway per entry** — enough for a reader to decide whether to open the doc, never a substitute
for reading it. It holds pointers and takeaways **only**, never content; the moment prose
accumulates in the map, it has become a second (unindexed) doc.

**Iron rule: `context.md` is updated in the same pass/commit as any doc it indexes. A doc that
isn't indexed doesn't exist** — nobody will find it, so writing it was wasted work.

In larger workspaces the root layer may split into companions — an `architecture.md` deep-dive, a
`constraints.md` rulebook that agents read before changing unfamiliar code — but `context.md`
remains the single entry point, and its index-with-takeaways duty is unchanged: every companion is
itself indexed there with a takeaway.

## Module docs are the primary source

Module-level docs are the **primary** source of truth; the root layer is a table of contents.
Reading priority when trying to understand a module: its own docs first, the root map for
orientation only. If the root map and a module doc disagree, the module doc wins (and the map gets
fixed in the same pass).

## Two doc kinds per module

**`CONTEXT.md` — internal architecture, agent-first (humans welcome).** Lives in every module and
sub-module whose design needs explaining. Write it **first** — before or alongside implementation —
because stating purpose and dependencies clarifies scope while there's still time to change it.

```markdown
# CONTEXT.md — <module>

## Purpose
## Dependencies
## Dependents
## Directory Layout   <!-- optional -->
## Key Concepts
```

**`USAGE.md` — the public contract, human-first.** For modules that others consume, typically
top-level only. Write it **after** the module is implemented and tested — a contract documented
before it stabilizes is a contract you'll document twice.

```markdown
# USAGE.md — <module>

## Installation & Setup
## API Reference
## Configuration
## Extending This Module
## Failure Modes
```

## Decision records

Significant architecture decisions get recorded. Three legal forms: an `ADR/` directory, a root
`architecture.md`, or a rolling `CHANGES.md`-style decision log — the project declares which one it
uses in its root `context.md`.

**Always read the decision records before writing an architecture brief or making a design decision
that touches existing structure.** They are the memory of *why* things are the way they are; a
design that ignores them re-litigates settled questions blind. A decision that contradicts a
recorded one requires **updating the record** — stating what changed and why — never silently
ignoring it.

## Update discipline

Docs change in the **same commit/pass** as the code change they describe — documentation is part of
the change, not a follow-up task that never comes. The trigger: whenever a module's public API or
key architecture changes, **both** module files (`CONTEXT.md` and `USAGE.md`) update together, in
that same pass. Use the commit prefix `docs:` when a documentation change ships standalone.

## Code wins over docs

When a doc contradicts the code, the code is the more recent reality. Update the doc in the same
pass and call the correction out in the report or PR description — the divergence itself is a
finding worth surfacing. A doc is never left knowingly wrong: either fix it now or you've created
documentation that actively misleads.

## Layout profiles

Three profiles; pick one and declare it once in root `context.md`:

- **Federated** (the default for module-structured codebases): `CONTEXT.md`/`USAGE.md` live inside
  each module directory, next to the code they describe. Distance kills docs — adjacency makes the
  same-pass law cheap to obey, and docs move and rename with their module.
- **Mirrored**: all module docs live under `docs/<module_name>/*.md` at the repo root, mirroring
  the module tree (`CONTEXT.md` and `USAGE.md` keep their names and templates inside each
  `docs/<module>/` directory). Mirrors drift: module renames and splits in the source tree must be
  mirrored in `docs/` in the same pass, and a module without a `docs/` directory is an
  undocumented module.
- **Centralized**: a flat `docs/` folder plus root index — for small repos, cross-cutting specs,
  or non-code projects.

The invariants above — one canonical home, index-with-takeaways in the same pass, module docs
first as the reading priority, the authoring order, decision records consulted first, code wins —
hold identically under all three profiles.

## In one line

One canonical home per piece of knowledge, a root map of takeaways updated in the same pass, module
docs as the primary source, decision records read before deciding — and no doc ever left knowingly
wrong.
