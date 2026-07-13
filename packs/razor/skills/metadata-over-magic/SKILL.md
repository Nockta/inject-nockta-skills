---
name: metadata-over-magic
description: Record repository type, selected profiles, generated ownership, and tool state explicitly rather than relying on repeated hidden inference.
---

# Metadata Over Magic

## Doctrine

Inference is useful for first contact; durable behavior should become inspectable metadata.

## Apply This Skill When

- skill injection, generators, monorepo tools, adapters, and repository automation
- supporting repeated runs
- debugging why a tool selected a behavior

## Rules

- Use clear manifests with versioned schema.
- Allow detection to propose metadata, not silently override it.
- Record generated files and selected packs.
- Keep metadata human-readable.
- Fail on contradictory metadata rather than guessing.

## Reject These Patterns

- detecting the stack differently on every run
- using package names as the only source of truth
- hiding tool decisions inside code
- rewriting metadata without preserving user choices

## Completion Criteria

- tool decisions are explainable
- repeat runs are stable
- users can intentionally override detection
