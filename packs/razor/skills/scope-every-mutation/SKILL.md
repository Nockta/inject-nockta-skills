---
name: scope-every-mutation
description: Enforce tenant, vendor, branch, business-unit, user, or resource ownership at every state-changing boundary.
---

# Scope Every Mutation

## Doctrine

A valid identity is not enough. Every mutation must prove that the caller is allowed to affect the specific resource in the specific scope.

## Apply This Skill When

- multi-tenant CRUD, commands, jobs, exports, uploads, webhooks, and realtime actions
- operations that accept resource IDs from clients
- admin and staff tools with hierarchical access

## Rules

- Resolve caller scope once from trusted identity and policy.
- Load or mutate resources within that scope rather than filtering afterward.
- Enforce ownership in services and queries, not only UI routes.
- Prevent cross-scope identifiers from becoming confused deputies.
- Apply the same policy to background and realtime paths.

## Reject These Patterns

- checking only that the user is authenticated
- loading by global ID and then forgetting the tenant check
- trusting a client-provided tenant or branch ID
- securing REST routes while leaving jobs or gateways unscoped

## Completion Criteria

- every mutation has an explicit authorization predicate
- queries cannot accidentally cross scope
- alternate transports enforce the same policy
