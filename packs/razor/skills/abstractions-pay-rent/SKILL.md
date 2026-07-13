---
name: abstractions-pay-rent
description: Delay generic React components, hooks, providers, and factories until repeated behavior and stable variation are demonstrated.
---

# Abstractions Pay Rent

## Doctrine

Reuse should follow evidence. Premature abstractions hide project-specific differences, create configuration surfaces, and make simple components harder to change.

## Apply This Skill When

- creating design-system primitives, form abstractions, table wrappers, hooks, or renderers
- seeing similar code in two places
- deciding whether to generalize a component

## Rules

- Identify the repeated invariant, not only similar markup.
- Keep one-off behavior local.
- Prefer composition over boolean configuration matrices.
- Generalize after at least two real consumers reveal stable variation.
- Allow domain-specific wrappers over low-level primitives.

## Reject These Patterns

- a universal component built for hypothetical future pages
- large prop APIs that encode several unrelated modes
- generic hooks that merely rename library APIs
- forcing unlike workflows through one abstraction

## Completion Criteria

- the abstraction removes real duplication of behavior
- consumer APIs are smaller than the duplicated implementations
- new variants fit without unrelated flags
