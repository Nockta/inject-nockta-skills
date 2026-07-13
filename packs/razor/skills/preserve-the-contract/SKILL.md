---
name: preserve-the-contract
description: Refactor or replace internals without unintentionally changing observable behavior or dependent interfaces. Use for legacy refactors, framework migrations, component rewrites, service extraction, generated-output changes, and any work where undocumented consumers or compatibility risk may exist.
---

# Preserve the Contract

## Doctrine

Structure is negotiable. Observable behavior is not, unless the requirement explicitly changes it.

Treat every behavior relied upon by users, integrations, deployments, tests, or adjacent code as a contract until evidence proves otherwise.

Legacy code is not automatically correct, but it is also not automatically disposable.

## Use This Skill When

Use this skill for:

- behavior-preserving refactors;
- replacing a framework, library, or implementation;
- extracting services or components;
- changing React, Liquid, server, or integration boundaries;
- renaming exports, routes, events, selectors, assets, or storage keys;
- moving ownership between layers;
- rebuilding a component from an existing production implementation;
- changing generated-file structure or adapter output;
- removing code that appears unused.

## Contract Inventory

Before changing internals, inspect these possible contracts.

### Code Contracts

- public exports;
- function signatures;
- types and schemas;
- dependency injection tokens;
- module boundaries;
- error classes and return shapes.

### Network and Integration Contracts

- routes and methods;
- payload fields;
- status codes;
- headers;
- webhook topics;
- event names;
- retry and idempotency behavior;
- ordering and timing expectations.

### Data Contracts

- table and column meanings;
- nullability;
- enum values;
- tags and metafields;
- cache keys;
- search-document shape;
- analytics event properties;
- import and export columns.

### UI and Browser Contracts

- DOM structure consumed by scripts;
- CSS selectors and hooks;
- custom events;
- `postMessage` payloads;
- URL parameters;
- local and session storage keys;
- accessibility semantics;
- focus and keyboard behavior;
- asset filenames and loading order.

### Operational Contracts

- environment variables;
- build outputs;
- deployment paths;
- workflow artifact names;
- log fields used by support;
- migration order;
- monitoring checks;
- rollback assumptions.

## Required Workflow

### 1. State the Intended Contract

Define whether the task is:

- fully behavior-preserving;
- behavior-preserving except for named changes;
- a breaking change with an explicit migration;
- an internal replacement hidden behind compatibility.

Do not call a task a refactor if it intentionally changes behavior without naming the change.

### 2. Discover Existing Consumers

Search for:

- static references;
- dynamic imports;
- framework discovery;
- string-based event names;
- selector usage;
- build and deployment references;
- external documentation;
- test fixtures;
- generated code;
- integrations outside the immediate module.

Absence of a TypeScript reference is not proof of no consumer.

### 3. Record the Contract Baseline

Capture the existing observable behavior with:

- tests;
- snapshots;
- request and response samples;
- DOM or accessibility assertions;
- generated-file manifests;
- logs;
- runtime traces;
- build output;
- documented examples.

Prefer executable evidence where practical.

### 4. Change Internals Behind the Boundary

Refactor inside the established contract.

When the new implementation differs, use:

- adapters;
- compatibility wrappers;
- additive fields;
- dual-read or dual-write migration;
- feature flags;
- deprecation windows;
- staged consumer migration.

Do not expose a new internal shape simply because it is cleaner.

### 5. Compare Before and After

Validate the contract at the boundary, not only inside the new implementation.

Examples:

- call the public API;
- inspect the final DOM;
- run the production build;
- verify generated filenames;
- consume the emitted event;
- exercise the integration callback;
- export the report;
- inspect the actual deployed artifact when available.

### 6. Remove Compatibility Only Deliberately

Remove old behavior only when:

- all known consumers have migrated;
- the migration was explicitly in scope;
- rollback implications are understood;
- the removal is separately reviewable when risk is significant.

## Required Output

```md
## Contract Baseline

### Must remain unchanged
- ...

### Intended behavior changes
- ...

### Known consumers
- ...

### Compatibility mechanism
- ...

### Boundary validation
- ...

### Deferred removals
- ...
```

## Rules

- Test the boundary, not only the implementation.
- Preserve public and de facto contracts.
- Treat selectors, file paths, event names, and generated assets as contracts when consumed.
- Search dynamic and string-based references.
- Prefer additive migration before destructive replacement.
- Keep refactoring separate from intentional behavior changes.
- Do not remove compatibility merely because internal compilation succeeds.
- Do not rewrite stable behavior for stylistic consistency.
- Do not preserve a defect silently when the stated requirement is to correct it; name the intended behavior change instead.

## Anti-Patterns

Reject these behaviors:

- replacing a component while ignoring scripts that query its DOM;
- renaming an event because the new name is cleaner;
- changing an error shape without checking clients;
- removing code based only on editor reference search;
- editing an adapter output while leaving the canonical source unchanged;
- migrating every consumer in one synchronized breaking change when compatibility is feasible;
- claiming a refactor is behavior-preserving without boundary evidence;
- keeping both implementations indefinitely without a source-of-truth decision.

## Completion Criteria

This skill is complete when:

- the intended contract is explicit;
- known and plausible consumers have been investigated;
- a baseline exists;
- internal changes remain behind the boundary or have a migration;
- before-and-after behavior is validated at the real observation point;
- compatibility removal, if any, is deliberate and reviewable.
