---
name: authenticate-once-authorize-again
description: Use NestJS guards and authentication infrastructure to establish a trusted principal and access context once, then pass that context explicitly.
---

# Authenticate Once Authorize Again

## Doctrine

Authentication should not be repeatedly reconstructed inside every service. Guards establish identity and coarse access; application services enforce resource-specific policy.

## Apply This Skill When

- authenticated APIs, multi-tenant backends, staff/admin routes, and realtime handshakes
- repeated token parsing or tenant lookup
- different transports needing equivalent principal context

## Rules

- Create a typed principal and scope model.
- Keep token parsing and session validation at the edge.
- Do not let decorators hide critical authorization inputs from tests.
- Recheck resource ownership in application logic.
- Keep authentication and authorization distinct.

## Reject These Patterns

- parsing JWTs inside business services
- assuming a role grants access to every resource of that type
- trusting tenant IDs from request payloads
- using decorators as the only evidence of authorization

## Completion Criteria

- principal context is consistent across transports
- resource policy is testable
- services do not depend on framework request objects
