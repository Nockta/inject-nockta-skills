---
name: react-owns-the-interaction
description: Use React for complex stateful interaction inside Shopify themes while keeping its boundary explicit and compatible with Liquid.
---

# React Owns the Interaction

## Doctrine

React should own the interactive island end to end: state, events, async lifecycle, and cleanup. It should not partially compete with Liquid or ad hoc DOM scripts for the same behavior.

## Apply This Skill When

- predictive search, cart interactions, complex menus, configurators, dashboards, and rich widgets
- migrating legacy DOM scripts into React
- coordinating multiple storefront interactions

## Rules

- Choose one owner for each interactive behavior.
- Define mount, props, custom events, and teardown contracts.
- Normalize Shopify data before it enters components.
- Keep generated bundle loading deterministic.
- Support theme editor remounts when required.

## Reject These Patterns

- React and jQuery mutating the same subtree
- multiple isolated states for one cart or product selection
- reading rendered markup as the canonical model
- mounting duplicate roots after section reload

## Completion Criteria

- one system owns the interaction
- host integration is documented
- remount and cleanup behavior are safe
