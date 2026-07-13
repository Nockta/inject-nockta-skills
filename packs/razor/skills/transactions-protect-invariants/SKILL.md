---
name: transactions-protect-invariants
description: Place transaction boundaries around business invariants and atomic state changes rather than arbitrary batches of ORM calls.
---

# Transactions Protect Invariants

## Doctrine

A transaction should answer: which facts must either become true together or not change at all?

## Apply This Skill When

- multi-record updates, inventory, assignments, state transitions, deduplication, and outbox writes
- workflows vulnerable to partial completion
- concurrent commands

## Rules

- Define the invariant before choosing the transaction.
- Keep external network calls outside database transactions.
- Use locking or conditional updates when concurrency requires it.
- Write events or outbox records atomically with state.
- Keep transactions short and bounded.

## Reject These Patterns

- wrapping an entire request including external APIs in one transaction
- using transactions as generic error handling
- reading state outside then assuming it remains valid
- publishing success before commit

## Completion Criteria

- partial durable states cannot occur
- concurrent execution has defined behavior
- side effects follow committed state
