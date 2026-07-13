---
name: test-the-contract
description: Test observable behavior, contracts, and invariants rather than private method calls or incidental component structure.
---

# Test the Contract

## Doctrine

Tests should survive safe refactoring and fail when the user-visible or system-visible contract breaks.

## Apply This Skill When

- unit, integration, component, and API testing
- refactoring brittle test suites
- choosing assertions for services and React components

## Rules

- Assert outputs, state changes, emitted events, and accessible behavior.
- Mock external boundaries, not the code under test.
- Prefer realistic inputs and domain language.
- Keep implementation details unexported.
- Use integration tests where the contract spans layers.

## Reject These Patterns

- asserting internal call order without contractual need
- testing CSS class names as the primary behavior
- mocking every collaborator until no real behavior remains
- snapshotting large structures without focused assertions

## Completion Criteria

- tests explain the contract
- internal refactors do not require broad rewrites
- contract regressions fail clearly
