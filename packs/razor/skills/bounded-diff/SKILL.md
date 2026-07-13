---
name: bounded-diff
description: Plan and execute the smallest coherent, reviewable change set that fully satisfies a requirement. Use when limiting PR size, file count, scope, architectural churn, or mixed concerns matters, especially in production repositories and incremental delivery.
---

# Bounded Diff

## Doctrine

Minimize the change surface, not the correctness.

A small diff is valuable only when it is coherent, independently understandable, and complete for the responsibility it claims to deliver.

Do not hide a broad redesign inside a feature request. Do not split work into arbitrary fragments that leave the repository broken or semantically inconsistent.

## Use This Skill When

Use this skill for:

- production changes requiring easy review;
- repositories with explicit PR or file-count limits;
- legacy systems with high regression risk;
- work that mixes feature, refactor, migration, and cleanup concerns;
- cross-layer changes that need staged delivery;
- large requests that should be decomposed into coherent increments;
- changes where generated output can create misleading diff size.

## Required Workflow

### 1. Define the Outcome Boundary

State what this change will deliver and what it will not deliver.

The boundary must describe observable or architectural value, not only a list of files.

### 2. Identify the Minimum Responsible Slice

A valid slice should be one of:

- a complete vertical behavior;
- a complete architectural prerequisite;
- a compatibility layer;
- a schema or migration step that safely precedes behavior;
- a focused refactor with unchanged behavior;
- a test or observability prerequisite needed to make the next change safe.

Avoid partial work that cannot be validated independently.

### 3. Inventory Intended Files Before Editing

List:

- files expected to change;
- why each file is necessary;
- generated files that should not be edited directly;
- files that would represent scope expansion;
- project-specific caps that apply.

If the repository limits a PR to three relevant implementation files, design a slice that respects the cap rather than ignoring it after implementation.

### 4. Separate Concerns

Do not combine these unless inseparable for correctness:

- feature behavior;
- broad refactoring;
- formatting;
- dependency upgrades;
- file moves;
- naming cleanup;
- dead-code removal;
- generated-output churn;
- unrelated test repairs.

Prefer separate changes when they can be reviewed and reverted independently.

### 5. Order Slices by Dependency

For multi-step delivery, use an order such as:

1. compatibility or observability;
2. additive schema or contract;
3. implementation behind the stable boundary;
4. consumer migration;
5. old-path removal;
6. cleanup.

Every slice should leave the system in a valid state.

### 6. Control Scope During Implementation

When a new issue appears, classify it:

- **Required for correctness:** include and update the boundary.
- **Existing defect exposed by the work:** report separately unless it blocks completion.
- **Cleanup opportunity:** exclude.
- **Architectural concern:** document for a later decision.
- **Generated consequence:** regenerate through the canonical path.

Do not allow opportunistic improvements to expand the diff silently.

### 7. Review the Final Diff as a Product

Verify:

- every changed file supports the stated outcome;
- no unrelated formatting or renaming is present;
- no duplicated source of truth was introduced;
- no temporary workaround became permanent without documentation;
- tests and validation are proportional to the risk;
- the change can be explained without reconstructing hidden context.

## Required Output

```md
## Change Boundary

### Delivers
- ...

### Explicitly excludes
- ...

### Intended files
| File | Reason |
|---|---|
| ... | ... |

### Repository limits
- ...

### Validation
- ...

### Follow-up slices
1. ...
```

For a multi-PR plan:

```md
| Slice | Coherent outcome | Dependencies | Expected files | Validation |
|---|---|---|---|---|
| 1 | ... | None | ... | ... |
```

## Rules

- Respect explicit repository limits.
- Prefer a narrow vertical slice over a broad horizontal rewrite.
- Keep behavior changes and behavior-preserving refactors separate when practical.
- Do not edit generated files directly.
- Do not add abstractions that are used only once unless they create a necessary boundary.
- Do not create placeholders that require immediate replacement.
- Do not perform cleanup tourism.
- Do not confuse fewer files with lower risk.
- Do not leave the repository broken between planned slices.
- Make excluded work visible rather than silently forgetting it.

## Anti-Patterns

Reject these behaviors:

- touching many adjacent files for stylistic consistency;
- moving files while changing their behavior;
- upgrading dependencies inside an unrelated feature;
- splitting one atomic contract change across invalid intermediate states;
- satisfying a file-count limit by hiding unrelated logic in one oversized file;
- adding a generic abstraction before a second real use exists;
- editing built assets to avoid changing their source;
- claiming a change is small because the line count is low despite a wide contract impact.

## Completion Criteria

This skill is complete when:

- the delivered outcome is explicit;
- each changed file is necessary;
- project-specific limits are respected;
- mixed concerns are removed or justified;
- every slice is coherent and valid;
- the final diff is reviewable, reversible, and free of unrelated churn.
