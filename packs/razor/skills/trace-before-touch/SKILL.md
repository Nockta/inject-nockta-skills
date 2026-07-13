---
name: trace-before-touch
description: Inspect and trace the existing repository and runtime path before proposing or implementing changes. Use for unfamiliar codebases, legacy systems, cross-layer work, integrations, or any task where ownership, entry points, data flow, generated files, or architectural boundaries are not already proven.
---

# Trace before Touch

## Doctrine

Do not design the ideal system in isolation and then force the repository to resemble it.

Understand the system that actually exists before changing it.

A plausible architecture inferred from filenames is not evidence. Trace the real execution path, identify the current source of truth, and determine where responsibility already lives.

## Use This Skill When

Use this skill before:

- changing behavior in an unfamiliar area;
- modifying code that crosses frontend, backend, database, integration, or deployment boundaries;
- replacing or bypassing an existing abstraction;
- editing legacy code with unclear consumers;
- changing generated, mirrored, or adapter-produced files;
- proposing a new service, state store, helper, or architectural layer;
- fixing a defect whose originating layer is not yet established.

Do not use it merely to produce a generic repository tour. Orient the investigation around the requested change.

## Required Workflow

### 1. Frame the Requested Change

Restate the requested outcome in implementation terms.

Identify:

- the observable behavior that must change;
- the user, system, or integration that observes it;
- the likely entry point;
- the required validation surface.

Do not begin with a proposed solution.

### 2. Find the Actual Entry Points

Inspect the files and symbols that can initiate the relevant behavior.

Examples include:

- routes and request handlers;
- framework entry files;
- UI event handlers;
- server actions;
- jobs and consumers;
- webhooks;
- generated bundles;
- theme sections and snippets;
- public exports;
- CLI commands;
- deployment workflows.

Do not assume the most obvious file is authoritative.

### 3. Trace the Runtime Path

Follow the behavior end to end.

Record:

1. where input enters;
2. where it is normalized or validated;
3. where authorization or ownership is enforced;
4. where state is read or changed;
5. where side effects occur;
6. where output is transformed;
7. where the result becomes observable.

Follow imports, callers, configuration, environment variables, framework conventions, generated artifacts, and integration contracts as necessary.

### 4. Identify Ownership and Sources of Truth

For each relevant responsibility, determine:

- which layer owns it;
- which file or service is canonical;
- whether another representation is generated or cached;
- whether multiple consumers depend on it;
- whether the apparent source is only an adapter, projection, or compatibility layer.

Never create a second source of truth merely because the current one is inconvenient.

### 5. Separate Evidence from Inference

Use these labels internally and in any written findings when ambiguity matters:

- **Observed:** directly supported by code, configuration, logs, tests, or runtime output.
- **Inferred:** strongly suggested but not yet proven.
- **Unknown:** not established with available evidence.

Do not present an inference as a repository fact.

### 6. Define the Minimum Correct Change Boundary

Before editing, identify:

- files that must change;
- files that may change only if evidence requires it;
- files or layers that should remain untouched;
- existing abstractions that should be reused;
- compatibility surfaces that must be preserved;
- validation commands or checks needed after the change.

Prefer the smallest change that fits the existing architecture and fully satisfies the requested behavior.

## Required Pre-Implementation Output

Before a non-trivial implementation, produce a compact system map:

```md
## System Map

### Requested behavior
...

### Runtime path
entry -> validation -> ownership -> state change -> output

### Current ownership
- Responsibility: owner
- Source of truth: file, module, service, or data store
- Derived outputs: generated or cached representations

### Change boundary
- Must change:
- Must not change:
- Conditional changes:

### Unknowns and risks
...

### Validation path
...
```

The map may remain internal for a small task, but the reasoning must still occur.

## Rules

- Inspect before inventing.
- Trace callers as well as callees.
- Treat generated files as outputs unless proven otherwise.
- Treat undocumented runtime behavior as a possible contract.
- Reuse established patterns unless they are demonstrably responsible for the problem.
- Do not introduce an abstraction until the current ownership model is understood.
- Do not call code unused without checking references, dynamic loading, framework discovery, and build-time generation.
- Do not rewrite stable code merely because another pattern is more fashionable.
- Do not confuse directory structure with runtime architecture.

## Anti-Patterns

Reject these behaviors:

- proposing a rewrite after reading only one file;
- creating a parallel service instead of locating the existing owner;
- editing compiled or generated output instead of its source;
- assuming frontend state is canonical when the server owns the decision;
- assuming CORS, UI visibility, or client validation is an authorization boundary;
- treating a framework convention as present without verifying the installed version and repository usage;
- producing a broad architecture document unrelated to the requested change.

## Completion Criteria

This skill is complete when:

- the actual runtime path is understood well enough to explain;
- ownership and sources of truth are identified;
- observed facts are separated from inference;
- the intended change boundary is explicit;
- the proposed implementation fits the existing system;
- the validation surface matches where the behavior is actually observed.
