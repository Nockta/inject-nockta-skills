---
name: effects-are-escape-hatches
description: Use React effects to synchronize with systems outside React, not to orchestrate ordinary application data flow.
---

# Effects Are Escape Hatches

## Doctrine

An effect is appropriate for subscriptions, timers, imperative APIs, browser integration, and external widgets. It is not a default replacement for event handlers, derivation, or server-state tools.

## Apply This Skill When

- reviewing useEffect usage
- integrating observers, media, storage, sockets, DOM APIs, or third-party libraries
- debugging loops, stale closures, and duplicate requests

## Rules

- First ask whether the work belongs in render, an event handler, a query, or an external adapter.
- Make setup and cleanup symmetrical.
- Keep dependencies truthful.
- Isolate imperative integration behind a hook or component boundary.
- Expect development re-execution and make effects safe.

## Reject These Patterns

- fetching routine data in effects when query ownership exists
- using effects to relay state between components
- suppressing dependency warnings to stop loops
- performing business mutations because a render condition became true

## Completion Criteria

- each remaining effect names the external system it synchronizes
- cleanup prevents leaks and duplicate subscriptions
- ordinary state flow is effect-free
