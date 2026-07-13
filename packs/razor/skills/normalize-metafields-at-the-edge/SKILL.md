---
name: normalize-metafields-at-the-edge
description: Translate Shopify metafield namespaces, keys, types, references, and GraphQL shapes into stable application models before UI or business logic consumes them.
---

# Normalize Metafields at the Edge

## Doctrine

Shopify data shapes are transport-specific and may vary by query or API. Components should depend on normalized domain fields.

## Apply This Skill When

- using metafields for filters, product attributes, integration IDs, or configuration
- combining Storefront API, Admin API, Liquid, and DOM fallback data
- mapping references and lists

## Rules

- Centralize namespace and key mapping.
- Validate expected metafield types.
- Resolve missing and malformed values consistently.
- Normalize all data sources to one application shape.
- Keep raw Shopify payloads at the adapter boundary.

## Reject These Patterns

- accessing namespace/key strings throughout components
- letting Liquid and GraphQL produce incompatible product models
- using display labels as stable metafield identity
- silently treating missing data as false when unknown matters

## Completion Criteria

- consumers receive one typed model
- source-specific quirks stay localized
- filter and display semantics remain consistent
