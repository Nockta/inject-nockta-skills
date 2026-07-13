---
name: boundaries-follow-authority
description: Define modules, services, and deployment boundaries around authority, lifecycle, failure, and scaling concerns rather than technical fashion.
---

# Boundaries Follow Authority

## Doctrine

A boundary exists because one part of the system owns a decision, must fail independently, scales differently, or has a distinct lifecycle. Folder names and microservice enthusiasm are not sufficient reasons.

## Apply This Skill When

- splitting a modular monolith or designing services
- creating BFFs, integration services, workers, gateways, or domain modules
- deciding whether logic belongs in a client, backend, or external adapter

## Rules

- Identify who is authoritative for each business decision.
- Keep related invariants inside the same transactional or consistency boundary.
- Split deployment units only when lifecycle, scale, security, or failure isolation justifies it.
- Keep transport boundaries separate from domain boundaries.
- Prefer a modular monolith until a real boundary requires distribution.

## Reject These Patterns

- one service per database table
- splitting systems solely by CRUD resource
- putting authority in a BFF because it is convenient
- creating network boundaries that increase failure modes without operational value

## Completion Criteria

- each boundary has a stated authority and reason to exist
- cross-boundary contracts are explicit
- the chosen topology matches actual operational needs
