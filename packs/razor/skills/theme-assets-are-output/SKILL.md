---
name: theme-assets-are-output
description: Treat bundled JavaScript, CSS, and generated Shopify theme assets as outputs of a reproducible build rather than hand-maintained source.
---

# Theme Assets Are Output

## Doctrine

Source code belongs in the development workspace. Theme assets should be regenerated predictably and deployed through the build pipeline.

## Apply This Skill When

- Vite or other bundlers targeting Shopify themes
- React and TypeScript islands
- CI-generated asset names and cleanup

## Rules

- Keep source maps and manifests intentional.
- Prevent stale chunks from accumulating.
- Avoid dynamic chunk behavior unsupported by the theme loading model.
- Make entry points stable even when content hashes change.
- Exclude generated assets from manual edits.

## Reject These Patterns

- fixing bugs directly in emitted JavaScript
- committing inconsistent bundles from local environments
- deleting all assets without distinguishing source theme files
- allowing lazy chunks that are not deployed or referenced correctly

## Completion Criteria

- a clean build reproduces the deployed assets
- entry loading is deterministic
- stale generated output is removed safely
