---
name: commands-ask-events-tell
description: Separate commands that request intent from events that report completed facts.
---

# Commands Ask Events Tell

## Doctrine

A command may be rejected, retried, or authorized. An event describes something the authoritative system has already accepted and committed.

## Apply This Skill When

- WebSocket protocols, queues, event buses, and integration contracts
- naming realtime messages
- designing acknowledgements and errors

## Rules

- Use imperative names for commands and past-tense facts for events.
- Validate and authorize commands.
- Acknowledge the command result separately from broadcasting events.
- Version public payloads.
- Do not let consumers reinterpret events as permission to mutate the same state again.

## Reject These Patterns

- using one message name for request and broadcast
- emitting requested state before persistence
- clients treating events as commands
- silent command failure with no acknowledgement

## Completion Criteria

- message direction and semantics are obvious
- events follow committed state
- clients can distinguish rejection from delayed delivery
