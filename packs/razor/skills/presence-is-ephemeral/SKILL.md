---
name: presence-is-ephemeral
description: Treat online status, socket membership, heartbeats, and active sessions as ephemeral operational signals rather than durable business truth.
---

# Presence is Ephemeral

## Doctrine

Connections disappear without clean shutdown. Presence can guide routing and UX but should not define irreversible business state.

## Apply This Skill When

- tracking online users, staff, vendors, rooms, or active devices
- routing realtime notifications
- assigning work based on availability

## Rules

- Use expirations or heartbeat windows.
- Separate presence IDs from business entities.
- Expect duplicate and stale connections.
- Recompute presence from active sessions.
- Persist only business facts that survive disconnection.

## Reject These Patterns

- a boolean online column as canonical truth
- marking work complete because a client disconnected
- assuming one user has one socket
- using room membership as permanent assignment

## Completion Criteria

- stale connections expire
- multi-device sessions behave predictably
- business state remains correct during network failure
