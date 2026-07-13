---
name: untrusted-edge
description: Treat browsers, mobile clients, widgets, extension code, external callers, webhooks, and imported files as untrusted input boundaries.
---

# Untrusted Edge

## Doctrine

Clients may request and display; they do not establish truth. Authentication, authorization, normalization, ownership, and privileged decisions belong on a trusted server boundary.

## Apply This Skill When

- building public forms, embedded widgets, SPAs, mobile apps, APIs, or webhooks
- accepting client-supplied identifiers, prices, tags, roles, or tenant scope
- exposing CORS-protected or storefront-facing endpoints

## Rules

- Validate and normalize all external input.
- Derive privileged fields from trusted server-side records.
- Recheck authorization for every sensitive operation.
- Rate-limit abuse-prone endpoints.
- Minimize information leakage in error responses.

## Reject These Patterns

- treating CORS as authorization
- trusting hidden fields, disabled inputs, or client-side validation
- accepting a role, tag, price, or ownership scope from the caller
- placing privileged credentials in browser-delivered code

## Completion Criteria

- the trust boundary is explicit
- the server derives authority rather than accepting it
- abuse, replay, and enumeration risks have concrete controls
