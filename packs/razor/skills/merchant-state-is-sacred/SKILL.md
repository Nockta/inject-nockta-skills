---
name: merchant-state-is-sacred
description: Protect merchant-managed templates, JSON configuration, section settings, and live theme state during development and deployment.
---

# Merchant State is Sacred

## Doctrine

A theme repository is not the whole storefront. Production contains merchant-owned state that automation must identify and preserve.

## Apply This Skill When

- theme synchronization, CI/CD, production pulls, staging refreshes, and bulk theme changes
- using rsync, theme push, or generated assets
- deciding which files belong in version control

## Rules

- Classify files as source-owned, generated, or merchant-owned.
- Preserve live JSON and configuration unless the change explicitly owns them.
- Use fixed theme IDs for deployment targets.
- Pull or reconcile production state through intentional workflows.
- Review destructive sync flags carefully.

## Reject These Patterns

- blind --delete synchronization
- using theme names as stable deployment identity
- overwriting live configuration from stale repository copies
- treating all theme files as developer-owned

## Completion Criteria

- merchant state survives deployment
- source and runtime ownership are documented
- staging and production targets are unambiguous
