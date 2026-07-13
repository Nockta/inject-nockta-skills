---
name: admin-power-never-ships
description: Keep Shopify Admin API credentials and privileged customer, order, metafield, tag, billing, or configuration mutations on an authenticated server.
---

# Admin Power Never Ships

## Doctrine

Storefront code and extensions are public clients. They may request privileged work but never receive administrative authority.

## Apply This Skill When

- Shopify apps, public widgets, theme extensions, checkout extensions, and storefront integrations
- creating customers, adding tags, reading protected data, or mutating admin resources
- exposing app proxy or CORS endpoints

## Rules

- Authenticate the shop and caller where applicable.
- Validate requested resources against server-side records.
- Use least-privilege Shopify scopes.
- Keep tokens encrypted and outside browser output.
- Audit sensitive mutations without logging personal data unnecessarily.

## Reject These Patterns

- embedding Admin tokens in themes or extension code
- using obscurity or CORS as credential protection
- accepting arbitrary tags or resource IDs from public clients
- performing privileged calls directly from the storefront

## Completion Criteria

- no privileged credential reaches the client
- server policy determines each mutation
- Shopify scopes match actual responsibilities
