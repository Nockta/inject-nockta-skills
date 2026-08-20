# Release notes — inject-nockta-skills

## 0.2.0 — (unreleased)

Recommended version: **0.2.0** (breaking).

### Breaking

1. **Every `pack.json` now requires two new fields: `tier` and `agentTrigger`.**
   - `"tier"`: `"inline-digest"` (reserved for the `common` pack) | `"companion"` (every other pack).
   - `"agentTrigger"`: a non-empty string, the "Read before/when …" trigger clause shown next to the
     pack in `AGENTS.md`'s skill-guide index.

   Any authored `pack.json` missing either field will fail validation.

   **Migration** — add both fields to each `pack.json`:
   ```jsonc
   {
     "name": "next",
     "tier": "companion",
     "agentTrigger": "Read before starting or reviewing any Next.js App Router work.",
     // ...existing fields unchanged
   }
   ```

2. **`AGENTS.md`'s output shape changed for every consumer.** Previously a single fully-inlined
   file; now a two-tier guidemap:
   - The `common` pack's contribution is inlined as a **mechanical digest** — for each skill, the
     sections whose heading exactly matches `"The idea"`, `"Doctrine"`, `"In one line"`, or
     `"Overview"` (a skill with none of those headings inlines in full instead).
   - Every pack's full rendered content — `common` included — is written in full to its own
     `docs/agents/<pack>.md` companion file.
   - `AGENTS.md` gains a trailing `## Skill guides` index, one bullet per companion file, each
     carrying the pack's `agentTrigger`.

   On this repo's own dogfood install (3 packs), this took `AGENTS.md` from 163,561 bytes down to
   ≈43,367 bytes (~73.5% smaller); the `common` pack's inline contribution alone went from 91,305 to
   40,129 bytes for the current skill selection. **Anything that parses `AGENTS.md` directly —
   expecting full skill bodies inline — breaks** and must instead follow the companion-file links.

### Added

- **`install --common-only`** — installs only the `common` pack (plus `razor` and `monorepo` where
  applicable), no stack pack. Bypasses the "a repo type is required" check. Fails closed against any
  target that also carries a repo type: refused with one shared error message when combined with
  `--type`, a colon-form `--target <path>:<type>`, or split-form `--target <path> --type <type>`. A
  bare `--target .` with no type is accepted (this is exactly the shape a monorepo root needs).
- **Digest extraction for the `common` pack's inline contribution** (`extract-digest.ts`) — pulls a
  skill's whitelisted `"The idea"` / `"Doctrine"` / `"In one line"` / `"Overview"` sections out of its
  raw `SKILL.md`, in source order; falls back to the skill's full body when none of those headings are
  present. This is what powers the `AGENTS.md` digest described above.

### Changed

- **Interactive and web wizard adapter preselection**: both now preselect **`claude` + `agent`** by
  default (previously every available adapter was preselected). Explicit adapter selections are
  unaffected. The default is single-sourced as `DEFAULT_ADAPTERS` in `src/types/adapter.ts`, consumed
  by both the terminal wizard (`select-adapters.ts`, `controller.ts`) and the web wizard/schema
  (`build-schema.ts`, `build-web-schema.ts`), so the two surfaces can't drift.

### Known limitations

- `sourceContentHash` (the staleness signal `doctor` uses to detect drifted generated output) omits
  `pack.json`'s `displayName`, `description`, and `agentTrigger` fields from its hash inputs. A
  `pack.json`-only edit to one of those three fields is therefore **not** detected as stale by
  `doctor` and won't trigger regeneration until the package's generator version is next bumped.
  Tracked as a named follow-up (see decisions.md D37).

### Upgrade notes

- After upgrading, run `upgrade` or `repair` to regenerate `AGENTS.md` and the new
  `docs/agents/<pack>.md` companion files — these are never hand-edited.
- If you author or maintain any `pack.json`, add `tier` and `agentTrigger` before upgrading, or
  install will fail validation.
- If anything in your toolchain reads `AGENTS.md` directly (rather than through an agent that follows
  the companion-file links), update it to also read `docs/agents/<pack>.md`.

---

## 0.1.2 — released 2026-08-19

- `subagent-delegation` skill: added an explicit desk-clear invariant and an anti-monitoring rule.
