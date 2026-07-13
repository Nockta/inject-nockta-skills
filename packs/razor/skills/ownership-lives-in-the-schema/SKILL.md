---
name: ownership-lives-in-the-schema
description: Model database relations so authority, tenancy, lifecycle, and domain meaning are explicit rather than inferred from loose identifiers.
---

# Ownership Lives in the Schema

## Doctrine

A schema is an executable statement of the domain. Important ownership paths should be visible and enforceable in the data model.

## Apply This Skill When

- designing Prisma models, tenant relationships, branch structures, roles, inventory, or integration records
- deciding whether an entity is a root or dependent relation
- preventing ambiguous ownership

## Rules

- Model required ownership with real relations.
- Use domain-meaningful unique constraints.
- Distinguish global roots from tenant-owned entities.
- Avoid polymorphic shortcuts unless their trade-offs are explicit.
- Keep integration IDs separate from primary domain identity.

## Reject These Patterns

- free-form ownerId fields without enforceable meaning
- duplicating tenant fields inconsistently across relations
- using nullable foreign keys to represent unrelated concepts
- deriving ownership through fragile multi-hop assumptions

## Completion Criteria

- ownership queries are straightforward
- invalid relationships are difficult to represent
- the schema supports authorization and lifecycle rules
