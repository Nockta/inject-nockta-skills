---
name: url-state-is-public-state
description: Represent shareable, navigable, bookmarkable Next.js state in the URL rather than hiding it solely in component memory.
---

# Url State is Public State

## Doctrine

Search, filters, pagination, sorting, tabs, and report ranges become part of the product contract when users need to share or revisit them.

## Apply This Skill When

- building search, dashboards, tables, reports, or multi-step views
- supporting back/forward navigation and shared links
- keeping server-rendered results aligned with UI controls

## Rules

- Define canonical parameter names and defaults.
- Parse and validate URL input on the server.
- Avoid writing default values unnecessarily.
- Preserve unrelated parameters during updates.
- Use local state only for uncommitted interaction where appropriate.

## Reject These Patterns

- maintaining separate URL and component filter truth
- serializing sensitive state into query parameters
- letting invalid parameters reach database queries
- breaking navigation by replacing history indiscriminately

## Completion Criteria

- a copied URL reproduces the same view
- server data and controls use the same parsed state
- navigation behaves predictably
