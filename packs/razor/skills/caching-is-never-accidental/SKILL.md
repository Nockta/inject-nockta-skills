---
name: caching-is-never-accidental
description: Choose Next.js caching, revalidation, and dynamic behavior explicitly for each data source and mutation path.
---

# Caching is Never Accidental

## Doctrine

Caching is not a framework detail to leave accidental. It changes freshness, authorization, load, and the user's trust in the result.

## Apply This Skill When

- fetching CMS, commerce, dashboard, authenticated, or frequently changing data
- using route handlers, server actions, tags, or revalidation
- debugging stale or cross-user results

## Rules

- Classify data by freshness and audience.
- Never share user-specific or tenant-specific data through a public cache.
- Connect mutations to precise invalidation.
- Prefer stable cache keys and tags.
- Document intentionally dynamic routes.

## Reject These Patterns

- relying on defaults without knowing their effect
- global no-cache as a substitute for policy
- caching authenticated responses across users
- invalidating the entire application after every mutation

## Completion Criteria

- freshness behavior is predictable
- authorization scope matches cache scope
- mutations update the correct cached views
