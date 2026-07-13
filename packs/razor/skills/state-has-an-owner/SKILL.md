---
name: state-has-an-owner
description: Assign every React state value one clear owner and avoid mirroring it across props, local state, stores, query cache, URL state, and the DOM.
---

# State Has an Owner

## Doctrine

State synchronization problems are usually ownership problems. Choose the narrowest correct owner and derive all other views from it.

## Apply This Skill When

- designing component state, context, Zustand stores, forms, filters, or cross-component coordination
- finding duplicated state or effects that keep values aligned
- integrating React with an external host such as Liquid

## Rules

- Classify state as server, URL, form, UI, or external-system state.
- Keep state close to its consumers until sharing is justified.
- Lift or centralize only when ownership truly spans boundaries.
- Expose actions that preserve invariants.
- Do not read the rendered DOM as a data store.

## Reject These Patterns

- copying props into state without a lifecycle reason
- storing query results again in Zustand
- maintaining the same filter in URL and local state independently
- using global state to avoid passing a few intentional props

## Completion Criteria

- one source of truth is identifiable
- derived views do not require synchronization effects
- updates flow through the owner
