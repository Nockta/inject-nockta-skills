---
name: fail-before-listen
description: Validate required NestJS configuration during startup so invalid environments fail before accepting traffic or jobs.
---

# Fail before Listen

## Doctrine

Operational configuration is part of the executable contract. A missing secret, malformed URL, or incompatible setting should not wait for the first production request.

## Apply This Skill When

- adding environment variables, integrations, queues, databases, storage, or feature configuration
- deploying multiple environments
- debugging failures caused by silently undefined values

## Rules

- Use a typed validation schema.
- Separate required, optional, and environment-specific settings.
- Validate cross-field conditions.
- Avoid reading process.env throughout the application.
- Do not log secrets while reporting validation failures.

## Reject These Patterns

- non-null assertions on environment variables
- fallback secrets or production defaults
- discovering missing credentials only inside a request
- configuration spread across unrelated modules

## Completion Criteria

- startup rejects invalid configuration
- runtime code consumes typed configuration
- failures identify the missing setting without exposing secrets
