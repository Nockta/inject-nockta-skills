---
name: migrations-are-deployments
description: Treat database migrations as staged production changes with compatibility, ordering, backfill, observability, and rollback implications.
---

# Migrations Are Deployments

## Doctrine

Changing the schema changes a running system. Migration design must account for old and new code coexisting during deployment.

## Apply This Skill When

- adding, removing, renaming, or changing columns and relations
- large backfills
- deploying multiple services against one database

## Rules

- Prefer additive schema changes first.
- Separate backfill from constraint tightening when risk is high.
- Keep old readers/writers compatible during rollout.
- Estimate lock and runtime impact.
- Define rollback or forward-fix strategy.

## Reject These Patterns

- renaming or dropping columns in the same step as code rollout
- large synchronous backfills inside startup
- assuming zero-downtime without compatibility analysis
- editing applied migrations

## Completion Criteria

- deployment order is explicit
- old and new code have a safe overlap
- data quality is verified before destructive cleanup
