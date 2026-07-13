---
name: server-by-default
description: Keep Next.js App Router components and data access on the server by default, introducing client execution only where browser interactivity requires it.
---

# Server by Default

## Doctrine

Server rendering is the baseline architecture, not an optimization to recover after marking the page client-side.

## Apply This Skill When

- building App Router pages, layouts, data views, and authenticated screens
- choosing where fetching and transformation occur
- reducing client bundle size and credential exposure

## Rules

- Fetch protected data on the server.
- Keep secrets and privileged SDKs out of client graphs.
- Pass serializable view models to client islands.
- Use streaming and suspense intentionally.
- Do not mark a parent client-side merely because one descendant is interactive.

## Reject These Patterns

- placing 'use client' at the page root by default
- fetching server-owned data again in the browser without need
- passing ORM or non-serializable objects to clients
- using server components as thin wrappers around client pages

## Completion Criteria

- the client graph begins at real interaction boundaries
- protected data remains server-owned
- client bundles contain only required code
