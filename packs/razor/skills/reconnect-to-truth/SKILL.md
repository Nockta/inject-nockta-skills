---
name: reconnect-to-truth
description: Design reconnect behavior around fetching canonical state and resubscribing, not replay assumptions alone.
---

# Reconnect to Truth

## Doctrine

Messages can be missed during disconnection. A reconnecting client must be able to establish what is true now.

## Apply This Skill When

- mobile and browser realtime clients
- long-lived dashboards
- networks with intermittent connectivity
- deployments that restart gateways

## Rules

- Reauthenticate on reconnect.
- Rejoin authorized scopes from current server policy.
- Fetch canonical state or deltas from a durable cursor.
- Deduplicate events already reflected in state.
- Show connection state without treating temporary loss as business failure.

## Reject These Patterns

- assuming the socket library guarantees complete history
- replaying from client memory as authority
- keeping stale room memberships after permissions change
- requiring manual refresh after every reconnect

## Completion Criteria

- clients converge after missed events
- permission changes take effect on reconnect
- recovery is testable under dropped connections
