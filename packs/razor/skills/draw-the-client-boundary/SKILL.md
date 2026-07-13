---
name: draw-the-client-boundary
description: Place Next.js client boundaries at the smallest stable interactive island and make the server-to-client contract deliberate.
---

# Draw the Client Boundary

## Doctrine

A client boundary changes rendering, serialization, data access, and bundle behavior. Treat it as an architectural boundary.

## Apply This Skill When

- adding hooks, browser APIs, animated interactions, or client libraries
- splitting server and client components
- passing callbacks or complex objects across the boundary

## Rules

- Define a serializable prop contract.
- Keep data transformation on the server when it does not require the browser.
- Avoid importing server-only modules through client graphs.
- Group tightly coupled interactivity into one island.
- Use context only inside the client subtree that needs it.

## Reject These Patterns

- converting entire layouts to client components
- passing raw database models across the boundary
- duplicating server calculations in the browser
- creating tiny fragmented islands with excessive prop plumbing

## Completion Criteria

- the boundary is visible and justified
- serialization is safe
- server-only code cannot leak into the client bundle
