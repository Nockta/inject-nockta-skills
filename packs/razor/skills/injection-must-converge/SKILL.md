---
name: injection-must-converge
description: Make repository injection and overlay operations safe to run repeatedly without duplicating content, corrupting files, or changing unrelated architecture.
---

# Injection Must Converge

## Doctrine

Injection should converge on the desired state. Re-running the command must not create a second copy of skills, configuration, or markers.

## Apply This Skill When

- injecting skill packs, config blocks, gitignore entries, manifests, or adapter files
- upgrading previously injected repositories
- supporting partial pack selection

## Rules

- Track owned files and versions.
- Use stable markers for owned blocks.
- Merge only documented structures.
- Preserve non-owned user content.
- Plan upgrades as migrations between known states.

## Reject These Patterns

- blind append on every run
- rewriting complete user files to change one block
- assuming an existing file was created by the tool
- deleting unknown content during upgrade

## Completion Criteria

- a second run produces no unintended diff
- owned content upgrades predictably
- user-authored content remains untouched
