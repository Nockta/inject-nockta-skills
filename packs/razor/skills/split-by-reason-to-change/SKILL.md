---
name: split-by-reason-to-change
description: Extract React components around responsibility, reuse, state ownership, testing, and independent change—not arbitrary line counts.
---

# Split by Reason to Change

## Doctrine

A component boundary should make change safer or meaning clearer. Splitting JSX without a responsibility boundary merely moves complexity.

## Apply This Skill When

- designing new component trees
- refactoring large components
- reusing behavior across pages
- separating data orchestration from presentation

## Rules

- Name components after their responsibility.
- Keep state with the smallest component that owns it.
- Pass domain-relevant props rather than entire unrelated objects.
- Extract behavior into hooks only when it forms a reusable lifecycle.
- Preserve accessibility and semantic structure across boundaries.

## Reject These Patterns

- one component per visual wrapper
- generic components with dozens of boolean props
- prop drilling caused by incorrect ownership rather than real hierarchy
- extracting every event handler into a custom hook

## Completion Criteria

- each component has a coherent reason to change
- boundaries reduce coupling
- data and event contracts remain understandable
