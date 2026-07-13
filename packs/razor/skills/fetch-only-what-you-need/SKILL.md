---
name: fetch-only-what-you-need
description: Shape Prisma and database queries around the actual response or use case instead of loading broad object graphs by default.
---

# Fetch Only What You Need

## Doctrine

Over-fetching hides performance cost, couples layers to persistence shape, and makes authorization harder to reason about.

## Apply This Skill When

- Prisma include/select design, dashboard queries, exports, and API responses
- recursive or deeply nested relations
- performance problems caused by broad hydration

## Rules

- Use select for intentional view models.
- Load relations required by policy before response decoration.
- Paginate collections before volume makes it urgent.
- Batch or aggregate rather than issuing per-row queries.
- Keep persistence models behind mapping boundaries.

## Reject These Patterns

- include: true across large relation trees
- returning complete ORM entities from every endpoint
- client-side filtering of large server datasets
- N+1 queries hidden in mapping loops

## Completion Criteria

- queries expose their cost and shape
- responses contain only required fields
- growth in related data does not unexpectedly explode work
