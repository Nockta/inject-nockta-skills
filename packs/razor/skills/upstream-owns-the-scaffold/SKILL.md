---
name: upstream-owns-the-scaffold
description: Delegate framework boilerplate to official scaffolders and apply lightweight architecture overlays afterward.
---

# Upstream Owns the Scaffold

## Doctrine

Do not become the maintainer of framework templates when the upstream tool already owns versions, defaults, and ecosystem compatibility.

## Apply This Skill When

- building project generators and starter tooling
- supporting multiple frameworks or versions
- adding organizational conventions to new repositories

## Rules

- Pass through supported upstream arguments.
- Validate the target before invoking the scaffolder.
- Stop if upstream creation fails.
- Apply overlays only to owned files and conventions.
- Keep the overlay declarative and version-light.

## Reject These Patterns

- copying entire framework templates into the package
- forking upstream defaults without a durable reason
- continuing overlays after a partial scaffold
- hard-coding one framework version into generic tooling

## Completion Criteria

- upstream updates remain consumable
- owned overlays are small
- generated projects are recognizable framework projects
