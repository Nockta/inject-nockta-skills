---
name: one-source-one-artifact
description: Produce deployable artifacts from canonical source in a controlled build rather than rebuilding differently across environments.
---

# One Source One Artifact

## Doctrine

Deployment should promote a known artifact or reproduce it from the same locked source and configuration—not depend on untracked local output.

## Apply This Skill When

- CI/CD pipelines, frontend bundles, containers, theme assets, and release packaging
- staging and production promotion
- debugging environment-specific builds

## Rules

- Pin dependency resolution.
- Record source revision and build metadata.
- Keep environment-specific runtime configuration separate from source compilation when possible.
- Do not modify generated artifacts after validation.
- Use the same build path for staging and production.

## Reject These Patterns

- building production from a developer workstation
- different undocumented commands per environment
- patching an artifact after tests
- committing stale generated output as release evidence

## Completion Criteria

- the artifact maps to a source revision
- staging and production use equivalent build logic
- rebuilds are reproducible
