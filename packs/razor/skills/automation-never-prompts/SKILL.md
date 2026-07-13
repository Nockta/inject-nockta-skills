---
name: automation-never-prompts
description: Make CI, deployment, migration, and automation workflows deterministic and noninteractive.
---

# Automation Never Prompts

## Doctrine

Automation must never pause for prompts, infer user intent from a terminal, or depend on hidden local state.

## Apply This Skill When

- GitHub Actions, release scripts, Shopify CLI, database migration, and build tooling
- commands originally designed for humans
- scheduled or remote execution

## Rules

- Pass explicit targets and confirmation flags.
- Fail on missing variables.
- Set timeouts for network operations.
- Capture useful logs without secrets.
- Use exit codes to stop dependent steps.

## Reject These Patterns

- commands waiting for confirmation in CI
- choosing targets from fuzzy names
- continuing after a failed critical step
- depending on local credential or shell state

## Completion Criteria

- the workflow completes or fails without human input
- targets are explicit
- failure stops the release with actionable evidence
