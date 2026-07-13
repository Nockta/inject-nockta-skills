---
name: danger-needs-consent
description: Make destructive, privileged, ambiguous, or high-impact operations opt-in, explicit, and reviewable.
---

# Danger Needs Consent

## Doctrine

The default path should preserve user data, repository state, production configuration, and recoverability. Convenience does not justify silent destruction.

## Apply This Skill When

- filesystem tools, code generators, deployment scripts, migrations, sync jobs, and admin operations
- commands that overwrite, delete, force, reset, or publish
- automation acting on an existing repository or environment

## Rules

- Fail closed when the target is ambiguous.
- Require explicit flags for destructive behavior.
- Prefer additive changes and backups where practical.
- Show the resolved target before high-impact execution.
- Stop on upstream errors instead of continuing with partial assumptions.

## Reject These Patterns

- implicit overwrite of user-owned files
- defaulting to force, delete, or reset
- continuing after a failed scaffold or migration step
- guessing a production target from a human-readable label

## Completion Criteria

- safe behavior requires no special flag
- destructive behavior is explicit
- failure leaves the system in a known recoverable state
