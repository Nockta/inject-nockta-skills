---
name: one-source-many-outputs
description: Keep one canonical representation and derive adapters, projections, generated files, indexes, or platform-specific outputs from it.
---

# One Source Many Outputs

## Doctrine

Duplication is acceptable only when its ownership is explicit. Canonical content should be authored once; derived representations should be deterministic and replaceable.

## Apply This Skill When

- maintaining adapter-specific instructions or generated configuration
- producing search indexes, caches, reports, bundles, or API projections
- supporting multiple AI tools, clients, platforms, or output formats

## Rules

- Name the canonical source.
- Mark derived outputs as generated or disposable.
- Make transformations deterministic where practical.
- Use explicit overrides only for genuine semantic differences.
- Add drift detection when generated output is committed.

## Reject These Patterns

- hand-maintaining equivalent content in several adapters
- editing generated output to fix its source
- allowing two stores to accept authoritative writes for the same fact
- calling duplicated data canonical without precedence rules

## Completion Criteria

- the canonical source is unambiguous
- all outputs can be regenerated or reconciled
- platform-specific differences are deliberate rather than drift
