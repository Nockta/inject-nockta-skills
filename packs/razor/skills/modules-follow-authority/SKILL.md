---
name: modules-follow-authority
description: Structure NestJS modules around domain authority and cohesive responsibilities rather than controller folders or database tables.
---

# Modules Follow Authority

## Doctrine

A NestJS module should state who owns a business capability, its invariants, and its public application surface.

## Apply This Skill When

- creating or reorganizing NestJS modules
- splitting a growing backend
- deciding where services, repositories, policies, and events belong

## Rules

- Keep a module's mutations and invariants together.
- Export only intentional application contracts.
- Avoid circular dependencies by correcting ownership, not adding forwardRef everywhere.
- Let infrastructure adapters depend inward on domain/application contracts.
- Keep shared modules small and truly cross-cutting.

## Reject These Patterns

- one module per table
- global shared modules containing unrelated business logic
- cross-module repository access that bypasses the owner
- using forwardRef as the normal architecture

## Completion Criteria

- module ownership is explainable
- exports are deliberate
- business rules do not leak across module internals
