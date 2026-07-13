---
name: retries-must-be-safe
description: Design retried commands, webhooks, payments, jobs, submissions, and integration callbacks so duplicate delivery does not duplicate business effects.
---

# Retries Must Be Safe

## Doctrine

Retries are normal in distributed systems. Idempotency must be attached to the boundary where duplication enters, not patched after duplicate state exists.

## Apply This Skill When

- webhooks, queues, payment callbacks, public forms, imports, and realtime commands
- operations retried by clients or infrastructure
- workflows with expensive or irreversible side effects

## Rules

- Choose an idempotency key tied to the business operation.
- Persist deduplication with the authoritative state when possible.
- Return the existing result for safe repeats.
- Separate transport retries from business retries.
- Make side effects follow committed authoritative state.

## Reject These Patterns

- relying on client behavior to prevent duplicates
- checking for duplicates with a race-prone read then write
- using timestamps as weak uniqueness
- making downstream side effects before deduplication is durable

## Completion Criteria

- duplicate delivery produces one business result
- concurrent repeats are safe
- the idempotency window and key semantics are documented
