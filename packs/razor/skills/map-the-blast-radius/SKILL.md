---
name: map-the-blast-radius
description: Analyze the full impact of a proposed change before implementation. Use when a change may affect multiple layers, consumers, integrations, contracts, generated outputs, deployment behavior, data shape, security boundaries, or operational workflows.
---

# Map the Blast Radius

## Doctrine

The visible edit is not the full change.

Map every contract, consumer, projection, and operational path that can be affected before deciding the implementation scope.

The goal is not to make the change larger. The goal is to prevent a locally correct edit from causing a system-level regression.

## Use This Skill When

Use this skill for:

- schema or data-shape changes;
- shared types, packages, or libraries;
- API, event, webhook, or realtime contract changes;
- authentication or authorization changes;
- changes to exported functions or public components;
- changes to selectors, DOM structure, asset names, routes, or storage keys;
- framework or dependency upgrades;
- deployment workflow changes;
- generated adapter or build output changes;
- modifications spanning more than one runtime or repository target.

## Required Workflow

### 1. Define the Change Unit

State exactly what is proposed to change.

Distinguish:

- behavior change;
- internal refactor;
- contract change;
- data migration;
- operational change;
- generated-output change.

A task may contain more than one unit. Do not blur them together.

### 2. Identify Directly Affected Components

List the immediate implementation owners:

- files;
- modules;
- services;
- components;
- tables;
- queues;
- workflows;
- packages;
- generated artifacts.

### 3. Trace Upstream Dependencies

Identify what supplies input or assumptions to the changed area:

- callers;
- producers;
- forms;
- external systems;
- environment configuration;
- build steps;
- schema generators;
- shared types;
- user-entered data.

### 4. Trace Downstream Consumers

Identify what relies on its output or behavior:

- UI consumers;
- API clients;
- jobs;
- reports;
- exports;
- caches;
- search indexes;
- analytics;
- webhooks;
- third-party integrations;
- test fixtures;
- deployment scripts;
- monitoring and support procedures.

### 5. Inventory Contracts

Treat the following as contracts when externally observable or depended upon:

- function signatures;
- TypeScript types;
- API payloads and status codes;
- event names and payloads;
- database columns and meanings;
- route and query parameter semantics;
- DOM selectors and structure;
- CSS hooks;
- file paths and generated filenames;
- environment variable names;
- tags, metafields, headers, and storage keys;
- ordering, timing, retries, and idempotency behavior;
- error messages parsed by another system.

### 6. Assess Cross-Cutting Risk

Review the proposed change across:

- security and authorization;
- tenant and ownership boundaries;
- backward compatibility;
- data migration and rollback;
- caching and invalidation;
- concurrency and idempotency;
- performance and scale;
- observability and support;
- deployment ordering;
- generated-file drift;
- test and fixture validity.

Do not add generic warnings. Name the concrete failure mode.

### 7. Classify Impact

Use these classifications:

- **Required:** must change for correctness.
- **Compatibility:** must remain stable or receive an adapter.
- **Validation:** does not change, but must be tested.
- **Operational:** deployment, migration, monitoring, or rollback concern.
- **Unaffected:** inspected and reasonably excluded.
- **Unknown:** requires further evidence.

### 8. Reduce the Radius

After mapping impact, reduce unnecessary scope.

Ask:

- Can an existing boundary absorb the change?
- Can compatibility be maintained?
- Can a migration be staged?
- Can generated outputs remain derived?
- Can the feature be implemented without changing a public contract?
- Can cleanup be deferred to a separate change?

Impact analysis should constrain the implementation, not justify touching everything.

## Required Output

```md
## Blast-Radius Map

### Proposed change
...

### Impact table

| Area | Classification | Current contract | Potential failure | Required action | Validation |
|---|---|---|---|---|---|
| ... | Required | ... | ... | ... | ... |

### Deployment or migration order
1. ...

### Compatibility requirements
- ...

### Explicitly unaffected
- ...

### Remaining unknowns
- ...
```

## Rules

- Search for consumers, not just definitions.
- Follow generated outputs back to their canonical source.
- Include operational and deployment effects.
- Treat shared code as high-radius until proven otherwise.
- Preserve contracts unless breaking them is part of the stated requirement.
- Record why an area is unaffected when its exclusion is not obvious.
- Prefer staged compatibility over synchronized breaking changes.
- Do not inflate scope with unrelated cleanup.

## Anti-Patterns

Reject these behaviors:

- changing a shared type and fixing only the first compiler error;
- changing a database shape without checking exports, analytics, or jobs;
- changing a route or selector without checking external consumers;
- treating successful compilation as proof of system compatibility;
- listing abstract risks without a concrete failure path;
- using blast-radius analysis as an excuse for a broad rewrite;
- assuming generated artifacts update automatically without verifying the pipeline.

## Completion Criteria

This skill is complete when:

- direct, upstream, and downstream impact is mapped;
- contracts and compatibility requirements are explicit;
- concrete failure modes are identified;
- deployment or migration ordering is understood;
- unrelated areas are deliberately excluded;
- the final implementation scope is smaller or more precise because of the analysis.
