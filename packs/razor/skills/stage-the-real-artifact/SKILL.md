---
name: stage-the-real-artifact
description: Use staging to validate the same artifact, integration path, configuration class, and deployment mechanism intended for production.
---

# Stage the Real Artifact

## Doctrine

Staging is evidence only when it exercises production-like behavior. A separate ad hoc build or manual path proves little.

## Apply This Skill When

- designing release workflows
- promoting frontend, backend, theme, or infrastructure changes
- deciding what staging tests must cover

## Rules

- Deploy through the production mechanism.
- Use production-like permissions and integrations with safe accounts.
- Validate migrations and generated assets.
- Record the tested artifact identity.
- Keep environment differences explicit.

## Reject These Patterns

- manual staging deployment followed by automated production
- testing different source revisions
- using staging as a dumping ground for unfinished changes
- declaring readiness from unit tests alone

## Completion Criteria

- the production candidate is identifiable
- staging validates deployment and runtime behavior
- remaining environment differences are known
