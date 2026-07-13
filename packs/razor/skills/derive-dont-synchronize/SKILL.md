---
name: derive-dont-synchronize
description: Compute values from existing React state and props whenever possible instead of storing synchronized copies.
---

# Derive Dont Synchronize

## Doctrine

Derived state should remain a calculation. Every synchronized duplicate creates another invalid state the UI can enter.

## Apply This Skill When

- totals, filtered lists, selected records, booleans, formatted values, and dependent options
- effects whose only job is to set state from other state
- bugs caused by stale or out-of-order updates

## Rules

- Derive during render when computation is cheap.
- Memoize only when measurement or referential stability justifies it.
- Store identifiers rather than duplicated objects when appropriate.
- Normalize inputs before deriving.
- Reset true lifecycle state explicitly.

## Reject These Patterns

- useEffect followed by setState for ordinary calculations
- storing both selected ID and selected object without a source rule
- duplicating form values into component state
- using memoization as a correctness mechanism

## Completion Criteria

- removing one source value automatically updates all derived views
- no effect is required to keep ordinary values aligned
- the number of representable invalid states is reduced
