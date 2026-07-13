---
name: use-cases-before-crud
description: Model NestJS application services around meaningful business operations rather than generic CRUD wrappers.
---

# Use Cases before Crud

## Doctrine

CRUD is a transport shape, not a domain model. Services should express intent such as assign, claim, complete, publish, register, or reconcile.

## Apply This Skill When

- a service is becoming a collection of create/update methods
- operations require permissions, transitions, side effects, or invariants
- multiple callers need the same business action

## Rules

- Name methods after business intent.
- Validate preconditions at the use-case boundary.
- Keep orchestration explicit.
- Return authoritative outcomes rather than leaking ORM models by default.
- Use generic repositories only where the domain is genuinely generic.

## Reject These Patterns

- a BaseCrudService for unrelated domains
- accepting arbitrary update DTOs for stateful entities
- letting callers assemble business workflows from low-level methods
- exposing Prisma models as every public contract

## Completion Criteria

- operations reveal domain intent
- invariants are enforced once
- callers cannot bypass required workflow steps
