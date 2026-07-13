---
name: liquid-owns-the-shell
description: Let Shopify Liquid own merchant-configurable theme composition, initial storefront structure, and server-rendered content.
---

# Liquid Owns the Shell

## Doctrine

Liquid is the storefront shell and merchant integration surface. Do not replace stable theme responsibilities with React merely to standardize implementation.

## Apply This Skill When

- building or refactoring Shopify themes
- adding React islands to Liquid storefronts
- working with sections, blocks, snippets, and theme settings

## Rules

- Keep merchant-editable structure in sections and blocks.
- Render stable SEO and initial content through Liquid.
- Provide intentional mount points and serialized configuration to interactive islands.
- Preserve theme editor behavior.
- Keep graceful behavior when JavaScript is unavailable where practical.

## Reject These Patterns

- rendering the entire theme through a client bundle
- hard-coding merchant content into React
- querying the DOM to reconstruct data Liquid could serialize
- breaking section re-rendering in the theme editor

## Completion Criteria

- merchants retain configuration control
- initial structure is server-rendered
- React integrates through explicit mount contracts
