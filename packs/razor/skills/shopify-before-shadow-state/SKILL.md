---
name: shopify-before-shadow-state
description: Prefer Shopify's canonical cart, product, customer, order, checkout, and extension primitives before creating parallel commerce state.
---

# Shopify before Shadow State

## Doctrine

Custom state should coordinate the experience, not become a conflicting commerce engine beside Shopify.

## Apply This Skill When

- building carts, checkout flows, customer registration, product selection, or order-linked features
- deciding whether to duplicate Shopify data
- integrating external workflows with storefront commerce

## Rules

- Use Shopify identifiers as references, not substitute domain truth.
- Reconcile client state against Shopify responses.
- Avoid maintaining competing totals, availability, or order status.
- Use metafields and app-owned data only for responsibilities Shopify does not own.
- Document any deliberate shadow data and its refresh policy.

## Reject These Patterns

- calculating a separate authoritative cart total
- treating cached product data as current inventory
- building custom checkout behavior that conflicts with Shopify
- duplicating customers without identity rules

## Completion Criteria

- Shopify remains authoritative for commerce state
- custom data has a distinct responsibility
- reconciliation paths are explicit
