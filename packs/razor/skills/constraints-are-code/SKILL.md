---
name: constraints-are-code
description: Convert requirements, design decisions, repository rules, and user corrections into an explicit constraint ledger, implementation decisions, and verifiable acceptance criteria. Use when a task contains exact limits, layout rules, ownership rules, security requirements, PR limits, units, exceptions, or multiple interacting decisions.
---

# Constraints Are Code

## Doctrine

A requirement that is not traced into implementation and validation is only a suggestion.

Treat hard constraints with the same precision as executable code: preserve their wording, map them to concrete decisions, detect conflicts, and verify every one before declaring completion.

## Use This Skill When

Use this skill when the task includes:

- exact dimensions, units, limits, counts, or thresholds;
- architecture decision records;
- repository-specific file or PR limits;
- required ownership boundaries;
- mandatory or forbidden technologies;
- security and privacy requirements;
- compatibility guarantees;
- special-case behavior;
- repeated user corrections;
- wording such as `must`, `must not`, `always`, `never`, `only`, or `unless`.

## Required Workflow

### 1. Extract Constraints Verbatim

Capture every hard requirement without paraphrasing away important qualifiers.

Preserve:

- units such as `dvh`, `dvw`, milliseconds, bytes, and percentages;
- count semantics such as physical columns versus populated columns;
- scope such as per PR, per target, per request, or global;
- exceptions and conditional clauses;
- ownership words such as canonical, generated, server-owned, or user-owned;
- explicit prohibitions.

A change from `47dvh` to `47vw` is not a minor interpretation. It is a different requirement.

### 2. Classify Each Statement

Classify requirements as:

- **Hard constraint:** must be satisfied.
- **Invariant:** must remain true across states or implementations.
- **Preference:** preferred when no stronger constraint conflicts.
- **Assumption:** currently believed but not yet proven.
- **Derived decision:** implementation choice required by one or more constraints.
- **Out of scope:** intentionally excluded.
- **Validation obligation:** evidence required before completion.

Do not silently promote assumptions into constraints or demote constraints into preferences.

### 3. Build the Constraint Ledger

For each hard constraint, record:

- stable identifier;
- exact requirement;
- source or rationale;
- implementation consequence;
- affected area;
- validation method;
- current status.

Example:

```md
| ID | Constraint | Implementation consequence | Validation | Status |
|---|---|---|---|---|
| C-01 | Menu max height is `47dvh` | Use `max-height: 47dvh`; define overflow behavior | Inspect computed style at target viewports | Planned |
```

### 4. Detect Conflicts and Ambiguity

Check constraints against one another.

Look for:

- impossible combinations;
- overlapping ownership;
- incompatible lifecycle requirements;
- hidden default behavior that violates a rule;
- a general rule overridden by a specific exception;
- units or nouns that have been substituted incorrectly;
- stale decisions superseded by later corrections.

Use the most recent explicit correction as authoritative unless the repository contains a stronger formal decision record.

Do not invent a compromise that satisfies neither requirement.

### 5. Translate Constraints into Implementation Decisions

Every hard constraint must affect at least one of:

- structure;
- control flow;
- type or schema;
- validation;
- permission boundary;
- configuration;
- migration;
- test;
- build or deployment process;
- generated output.

If a constraint has no implementation or validation consequence, it has probably been ignored.

### 6. Produce Acceptance Criteria

Write acceptance criteria that can be observed or tested.

Bad:

> The menu should look correct.

Good:

> At all supported desktop widths, the menu contains four equal physical flex columns. The fourth column contains the image only when fewer than four content columns exist.

Acceptance criteria must preserve the original semantics, not merely the general intent.

### 7. Validate the Final Result Against the Ledger

Before completion:

1. revisit every constraint;
2. mark it satisfied, intentionally deferred, or blocked;
3. provide evidence;
4. identify any deviation explicitly.

Do not declare completion while hard constraints remain unverified.

## Required Output

```md
## Constraint Ledger

| ID | Type | Exact constraint | Implementation impact | Validation | Status |
|---|---|---|---|---|---|

## Derived Decisions
- D-01 derives from C-01 and C-04: ...

## Conflicts or Superseded Decisions
- ...

## Acceptance Criteria
1. ...

## Deferred or Unverified
- ...
```

## Rules

- Preserve exact nouns, units, limits, and qualifiers.
- Treat later explicit corrections as updates to the ledger.
- Distinguish logical columns from physical columns, source files from generated files, and UI restrictions from security boundaries.
- Map every hard constraint to validation.
- Do not rely on memory when a written decision record exists.
- Do not silently relax a constraint to simplify implementation.
- Do not over-generalize a rule beyond its stated scope.
- Do not turn a project-specific constraint into a universal engineering principle.

## Anti-Patterns

Reject these behaviors:

- summarizing precise requirements into vague prose;
- changing units during implementation;
- satisfying the visual appearance while violating structural rules;
- treating a file-count limit as optional because the feature is large;
- claiming security from client-side checks;
- following an earlier decision after the user explicitly corrected it;
- writing acceptance criteria that cannot distinguish success from failure;
- validating only the happy path when the constraint describes all states.

## Completion Criteria

This skill is complete when:

- every hard constraint is recorded;
- conflicts and superseded decisions are resolved explicitly;
- each constraint has a concrete implementation consequence;
- acceptance criteria are observable;
- final validation accounts for every ledger item;
- no requirement has been silently weakened or reinterpreted.
