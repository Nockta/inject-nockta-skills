---
name: transport-stays-thin
description: Keep controllers, gateways, consumers, resolvers, and webhook handlers focused on transport translation rather than business decisions.
---

# Transport Stays Thin

## Doctrine

Transport code should authenticate, parse, validate, map, dispatch, and format. Business rules belong in application or domain services that can be reused across transports.

## Apply This Skill When

- adding REST, GraphQL, WebSocket, queue, webhook, or CLI entry points
- finding duplicated logic across controllers and gateways
- testing business behavior without a network stack

## Rules

- Translate transport DTOs into application commands or inputs.
- Keep authorization context explicit.
- Return transport-specific responses after application work completes.
- Use exception mapping at the boundary.
- Share use cases, not controller helpers.

## Reject These Patterns

- performing Prisma mutations directly in controllers
- embedding state transitions in gateway handlers
- duplicating business validation across transports
- passing raw framework request objects deep into services

## Completion Criteria

- business behavior can run without the transport
- each transport enforces equivalent policy
- handlers remain small and intention-revealing
