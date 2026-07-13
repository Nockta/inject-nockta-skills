---
name: deploy-with-an-exit
description: Define recovery, rollback, or forward-fix strategy as part of every risky deployment and migration.
---

# Deploy with an Exit

## Doctrine

A deployment plan is incomplete if it only describes the happy path. Recovery must account for schema compatibility, artifacts, configuration, and irreversible side effects.

## Apply This Skill When

- database migrations, contract changes, theme deployments, infrastructure updates, and integration releases
- changes with data backfills or external side effects
- high-impact production fixes

## Rules

- Identify what can be rolled back safely.
- Keep old artifacts and configuration available.
- Prefer additive changes that support code rollback.
- Use forward fixes when data reversal is unsafe.
- Define the trigger and owner for recovery.

## Reject These Patterns

- assuming git revert reverses database or external effects
- dropping compatibility before the new version is proven
- relying on undocumented manual steps
- calling a backup a rollback plan without testing restoration

## Completion Criteria

- recovery actions are explicit
- schema and code compatibility are understood
- the team knows when to rollback versus forward-fix
