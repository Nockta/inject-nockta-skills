---
name: ownership-before-abstraction
description: Determine the existing owner of state, behavior, or policy before introducing a helper, service, store, package, or abstraction.
---

# Ownership before Abstraction

## Doctrine

An abstraction is only useful when it clarifies ownership. Never create a new layer until the current source of truth, mutation authority, and consumer boundary are known.

## Apply This Skill When

- introducing a service, shared package, state store, manager, repository, or facade
- moving behavior between frontend, backend, worker, or integration layers
- finding duplicate logic or multiple representations of the same concept

## Rules

- Name the current owner and the proposed owner.
- Keep authoritative mutations behind one owner.
- Use abstractions to enforce a boundary, not merely to reduce line count.
- Prefer extending an established owner over creating a parallel path.
- Document why the new boundary will remain stable as the system grows.

## Reject These Patterns

- creating a generic service because a file is long
- adding another cache, store, or manager without defining precedence
- sharing business logic through an unowned utility folder
- moving code without moving its responsibility and invariants

## Completion Criteria

- the owner of reads, writes, validation, and side effects is explicit
- no competing source of truth was introduced
- the abstraction has a concrete boundary and more than cosmetic value
