---
name: remote-data-is-not-local-state
description: Use a server-state library such as TanStack Query for remote data lifecycle and keep local React state for transient interface behavior.
---

# Remote Data is not Local State

## Doctrine

Remote data has caching, invalidation, staleness, retry, and reconciliation semantics. Treating it as ordinary component state creates duplicate authority.

## Apply This Skill When

- fetching, caching, mutating, invalidating, or prefetching API data
- building dashboards, search, pagination, or shared data views
- mixing fetched data into local stores

## Rules

- Define stable query keys around actual inputs.
- Invalidate or update caches from authoritative mutation results.
- Keep presentation state separate from remote records.
- Use server defaults when filters are absent.
- Handle loading, empty, error, and stale states deliberately.

## Reject These Patterns

- fetching in effects and copying into local state
- using a global store as an ad hoc request cache
- mutating cached objects without query ownership
- assuming the currently rendered page is the full dataset

## Completion Criteria

- remote state has one cache owner
- mutations reconcile predictably
- UI state can reset without corrupting server data
