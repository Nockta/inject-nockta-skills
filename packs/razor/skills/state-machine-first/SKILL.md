---
name: state-machine-first
description: Define valid states, transitions, actors, preconditions, and terminal semantics before implementing realtime status commands or UI controls.
---

# State Machine First

## Doctrine

A status field is not a workflow. The state machine is the domain contract that every transport must obey.

## Apply This Skill When

- orders, jobs, sessions, approvals, delivery, presence-backed workflows, and long-running operations
- adding status buttons or events
- handling competing actors and retries

## Rules

- Enumerate states and allowed transitions.
- Name who may perform each transition.
- Validate current state atomically.
- Separate operational milestones with different meanings.
- Define idempotent repeats and invalid-transition errors.

## Reject These Patterns

- arbitrary status updates
- transition logic duplicated in clients
- collapsing distinct milestones into a vague completed state
- publishing events without proving the transition

## Completion Criteria

- all transitions are explicit
- invalid states are difficult to enter
- REST, jobs, and realtime paths share the same rules
