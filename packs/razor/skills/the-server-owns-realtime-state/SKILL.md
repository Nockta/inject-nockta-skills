---
name: the-server-owns-realtime-state
description: Keep canonical realtime state and transition validation on the server; clients request changes and reconcile to authoritative outcomes.
---

# The Server Owns Realtime State

## Doctrine

Realtime reduces latency, not authority. Clients are observers and command issuers, not independent state machines.

## Apply This Skill When

- Socket.IO, SSE, WebSocket clients, collaborative interfaces, dashboards, and mobile apps
- optimistic status updates
- multiple clients observing one resource

## Rules

- Validate every command on the server.
- Broadcast authoritative state after commit.
- Use optimistic UI only with rollback and reconciliation.
- Include stable identifiers and sequence/version information where needed.
- Provide a non-realtime read path for recovery.

## Reject These Patterns

- trusting the client's current state
- broadcasting client payloads as truth
- using connection membership as durable authorization
- requiring a full reload to recover from missed events

## Completion Criteria

- conflicting clients converge on server state
- unauthorized commands cannot alter canonical state
- recovery does not depend on perfect message delivery
