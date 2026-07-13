---
name: protect-the-dangerous-paths
description: Prioritize tests around authorization, money, state transitions, validation, integrations, data integrity, and other high-consequence behavior.
---

# Protect the Dangerous Paths

## Doctrine

Coverage percentage is not the objective. Protect the paths where failure causes financial, security, operational, or customer harm.

## Apply This Skill When

- planning a test strategy
- adding tests to an existing system
- working under limited delivery time

## Rules

- Rank scenarios by consequence and change frequency.
- Test invariants and negative authorization paths.
- Cover integration adapters with contract tests.
- Add smoke tests for deployment-critical flows.
- Use lower-level tests for combinatorial logic and boundary tests for wiring.

## Reject These Patterns

- chasing line coverage before protecting business flows
- testing trivial getters while transitions remain untested
- happy-path-only authorization tests
- relying exclusively on end-to-end tests

## Completion Criteria

- the highest-risk failures are protected
- test layers are chosen intentionally
- the suite provides fast feedback on common changes
