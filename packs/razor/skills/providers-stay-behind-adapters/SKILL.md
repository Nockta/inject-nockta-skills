---
name: providers-stay-behind-adapters
description: Place payment, delivery, ERP, Shopify, search, storage, email, and other provider behavior behind explicit adapter contracts.
---

# Providers Stay Behind Adapters

## Doctrine

External providers are replaceable infrastructure with unreliable boundaries. Core application logic should depend on stable capabilities, not provider SDK shapes.

## Apply This Skill When

- adding third-party SDKs or external APIs
- supporting more than one provider
- testing workflows without live integrations
- handling provider-specific retries or payloads

## Rules

- Define application-facing interfaces in owned modules.
- Normalize provider responses and errors.
- Keep credentials and transport details inside adapters.
- Make webhook translation symmetrical with outbound commands.
- Record provider identifiers without making them the domain identity.

## Reject These Patterns

- importing provider SDK types throughout the domain
- branching on provider names in core services
- leaking external error messages directly to clients
- coupling business state to provider lifecycle states without mapping

## Completion Criteria

- core use cases can be tested with a fake adapter
- provider changes stay localized
- external failures have defined application semantics
