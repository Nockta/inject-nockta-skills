---
name: generated-not-maintained
description: Treat generated instructions, adapters, bundles, manifests, clients, and artifacts as outputs that are regenerated rather than independently edited.
---

# Generated not Maintained

## Doctrine

Generated files should advertise their ownership and remain disposable. Manual fixes belong in the generator, source, or explicit override layer.

## Apply This Skill When

- code generation, adapter rendering, Prisma clients, theme bundles, and compiled output
- committing generated files
- handling platform-specific derived content

## Rules

- Mark generated files clearly.
- Record source and generator version.
- Regenerate deterministically.
- Provide explicit override locations when necessary.
- Add drift checks for committed outputs.

## Reject These Patterns

- manual edits inside generated files
- two-way synchronization without precedence
- generated files that contain undocumented hand-written sections
- fixing output without testing regeneration

## Completion Criteria

- generated output can be deleted and recreated
- manual customization has a separate owned path
- drift is detectable
