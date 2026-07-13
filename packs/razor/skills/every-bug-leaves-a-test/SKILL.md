---
name: every-bug-leaves-a-test
description: Add a focused regression test whenever a defect reveals an unprotected contract or invariant.
---

# Every Bug Leaves a Test

## Doctrine

A bug fix without a reproducing test can silently return. Capture the smallest test that would have failed before the fix.

## Apply This Skill When

- fixing production or QA defects
- repairing edge cases, data-shape mismatches, race conditions, or stale state
- refactoring after an incident

## Rules

- Reproduce the defect before applying the fix when possible.
- Test at the lowest layer that proves the contract and add a boundary test when needed.
- Name the scenario, not the ticket number alone.
- Include the unaffected comparison case when it matters.
- Avoid overfitting to the exact implementation.

## Reject These Patterns

- adding a test that passes before the fix
- only testing the new helper introduced by the patch
- huge snapshots for a narrow bug
- fixing the test instead of the behavior

## Completion Criteria

- the test fails on the previous behavior
- the fix makes it pass
- the scenario remains understandable to future maintainers
