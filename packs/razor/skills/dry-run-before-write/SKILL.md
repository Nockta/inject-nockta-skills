---
name: dry-run-before-write
description: Resolve and display high-impact filesystem, repository, migration, synchronization, and deployment actions before performing them.
---

# Dry Run before Write

## Doctrine

A dry run is an executable explanation of intent. It should reveal targets, generated commands, overwrites, exclusions, and destructive effects.

## Apply This Skill When

- code generators, injectors, rsync workflows, migrations, bulk jobs, and deploy commands
- operations driven by inferred repository type or environment
- tools that may alter existing user work

## Rules

- Resolve all defaults during dry run.
- Show exact target paths and selected packs.
- List files created, changed, skipped, or deleted.
- Keep dry-run output deterministic.
- Ensure real execution follows the same plan object.

## Reject These Patterns

- a dry run that only prints a generic summary
- different resolution logic between preview and execution
- hiding destructive exclusions or overwrite behavior
- performing network or write side effects during preview

## Completion Criteria

- the user can predict the real change
- preview and execution share one plan
- dangerous actions are visible before confirmation
