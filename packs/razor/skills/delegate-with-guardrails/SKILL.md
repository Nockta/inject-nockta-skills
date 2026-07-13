---
name: delegate-with-guardrails
description: Preserve the flexibility of upstream CLIs and tools while enforcing local safety, compatibility, and ownership constraints.
---

# Delegate with Guardrails

## Doctrine

A wrapper should not unnecessarily reimplement the upstream interface. It should validate what matters locally, then delegate.

## Apply This Skill When

- wrapping scaffolders, build tools, Shopify CLI, package managers, or deployment commands
- supporting future upstream flags
- building a stable organizational command

## Rules

- Forward unknown safe arguments when the contract allows it.
- Reserve wrapper-owned flags clearly.
- Validate conflicting and destructive options.
- Show the final delegated command in dry-run mode.
- Return upstream exit status and errors faithfully.

## Reject These Patterns

- duplicating every upstream flag in wrapper code
- silently discarding unsupported arguments
- changing upstream semantics without documentation
- swallowing upstream failures and continuing

## Completion Criteria

- users retain upstream capability
- local policy remains enforced
- delegation is transparent
