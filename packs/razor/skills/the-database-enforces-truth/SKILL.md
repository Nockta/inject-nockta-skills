---
name: the-database-enforces-truth
description: Use database constraints to protect invariants even when application validation already provides friendly errors.
---

# The Database Enforces Truth

## Doctrine

Application checks improve behavior; database constraints protect truth under concurrency, alternate clients, and future code paths.

## Apply This Skill When

- uniqueness, required relations, valid ranges, ownership, deduplication, and state integrity
- reviewing Prisma schema and migrations
- handling concurrent writes

## Rules

- Use unique, foreign-key, not-null, and check constraints where appropriate.
- Translate constraint failures into domain errors.
- Do not rely on read-before-write for uniqueness.
- Keep constraint names meaningful for operations.
- Test the concurrent path for critical invariants.

## Reject These Patterns

- validation only in forms or DTOs
- catch-all database errors with no semantic mapping
- race-prone existence checks
- removing constraints because the ORM types appear safe

## Completion Criteria

- invalid durable states are rejected by the database
- application errors remain understandable
- concurrent operations preserve the invariant
