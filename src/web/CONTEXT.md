# CONTEXT.md — src/web/

## Purpose

The standalone `inject --web` mode and the `--emit-schema` composition contract (decisions.md D30,
the FIRST web milestone). `--web` opens a local browser page to run the install wizard as a
**whole-form** surface — NOT the step-by-step CLI Presenter/Controller. It reuses the D28 MVC seams
verbatim: `buildWizardSchema(ctx)` (Model) → serve a self-contained page → receive a plain
`WizardAnswers` object → `resolve(answers)` → the existing `buildInstallResult()` write path (the
same tail the CLI wizard's confirm step runs). CLI remains the default; `--web` is opt-in.

This module is ADDITIVE: it never modifies `wizard/view|core` or `wizard/controller.ts` — it only
imports their exports (`buildWizardSchema`, `resolve`, the `WizardSchema`/`WizardAnswers`/`InstallPlan`
types) and `commands/install.ts`'s `buildInstallResult`/`formatInstallHuman`.

## Files

- `display.ts` — `detectDisplay(env, platform)`: the pragmatic display-availability heuristic.
  macOS/Windows always assume a display; Linux/other requires `DISPLAY` or `WAYLAND_DISPLAY`.
- `precedence.ts` — `resolveWebPrecedence(input)`: the PURE D30 precedence resolver.
  `--web` (if display) > interactive CLI (if TTY) > `--yes` headless > clean error. Returns
  `web` | `cli` | `error`. `--web` outranks `--yes` (in that combo `--yes` only pre-seeds the page).
  Degrades to `cli` when no display but a TTY or `--yes` exists; `error` only when there's nothing to
  fall back to (never a hang). `--cli` forces the CLI route (caller ANDs `web && !cli`). `--no-open`
  counts as display-available (serve + print the URL, user opens it).
- `open-browser.ts` — `browserCommand(url, platform)` (pure mapping: `open`/`start`/`xdg-open`) +
  `openBrowser()` (best-effort spawn, detached/unref'd, never throws; the caller always prints the
  URL so a failed open degrades to manual).
- `server.ts` — `startWebWizardServer({ schema, targetDir?, packsRoot? })`: the local HTTP server.
  **Security (D30):** binds `127.0.0.1` ONLY, listens on port `0` (OS-assigned random port, read
  back), one-time crypto-random token in the URL; EVERY request must present the token or gets 403.
  `GET /` serves the first-paint page; **`GET /schema` (reactive) re-derives the offering** — same
  token gate — from the query's `types`/`adapters` CSV (plus the OPTIONAL `excluded`/`included` CSV of
  the page's current skill selection, so dependency locks re-resolve against the live toggles — see
  the forced-dependency note under `page.ts`) via `buildWebSchema({…, detect:false})` and returns the
  `WizardSchema` as JSON (empty `types` → common-only, never re-detect). `POST /submit`
  validates the token, parses the `WizardAnswers` body (1 MB cap), then (**2026-07-13, zero-type +
  truthfulness fix**): (a) VALIDATES the answers against the TTY wizard's cancel rules
  (`validateAnswers` — zero repo types / zero monorepo targets → 400 with a clear reason; before,
  the server accepted anything and the CLI backend only failed later with "missing required --type"
  after the page had already shown "Done"); (b) when the new `onSubmit` option is present, runs the
  REAL install INSIDE the handler and responds with its actual outcome — 200 `{ok:true}` +
  `waitForAnswers()` resolves on success, 422 `{ok:false,error}` on a failed install (the submit
  stays UNSETTLED so a corrected resubmit is allowed; a second POST after a successful one gets
  409). Mirrors create's web server, which always ran its pipeline in the handler and never had the
  false-success path. Without `onSubmit` (transport-only callers/tests) the old accept-and-resolve
  behavior is kept. `close()` rejects a still-pending `waitForAnswers()` (the Ctrl-C/abort path).
  `targetDir`/`packsRoot` are the derivation ctx carried through from `run-web-install.ts` so
  `/schema` recomputes per request.
- `page.ts` — `renderWizardPage(schema, token)`: ONE self-contained HTML string (inline CSS/JS, NO
  external CDN/font/network). Renders every step the schema emits GENERICALLY (repo-type/adapters as
  on/off toggle groups; skills + razor grouped by pack/category; each choice's description + clash
  note; required/locked rows forced-on + disabled with reason). **REACTIVE (2026-07-11):** the
  repo-type/adapter cards are static; toggling any of them debounces (~150ms), fetches
  `GET /schema?t=…&types=…&adapters=…`, and re-renders ONLY the skills + razor cards from the response
  (stale responses ignored via a request seq; skill/razor `checked` reset to the new schema's
  per-type defaults — matches the CLI's `runSkillStep`; deltas are NOT preserved across a type change
  that drops a skill). This is the fix for Bug A ("only Common" when launched with no `--type`).
  **Forced-dependency locks re-resolve on skill toggles (Bug: "phantom grilling", fixed).** A skill/
  razor row toggle now also debounces + refetches `GET /schema`, but WITH the page's current
  `excluded`/`included` deltas, and re-renders — so a `requires` dependency lock re-resolves against
  the live selection (server-side, via the shared `resolveSkillLayerRound`). The concrete case:
  `grill-me` is enablement `default` and `requires: ["grilling"]` (optional). First paint / every
  re-derive now renders `grilling` LOCKED-ON (checked + disabled "needed by grill-me") — the same
  lock the CLI wizard shows — instead of a bare "Off" toggle; and toggling `grill-me` OFF RELEASES
  `grilling` (no stale lock). Before the fix the page showed `grilling` Off while the install
  correctly pulled it in as `grill-me`'s dependency (installed on EVERY web install), a UI/reality
  mismatch. Note the install-side inclusion was always correct (owner ruling: `grill-me` intentionally
  forces `grilling`); the profile records `included:["grilling"]` as a dependency-closed delta — this
  fix is DISPLAY-truthfulness only, it does not touch `resolveSkillSelection`/the install path.
  **Residual client-delta leak (same pass, caught by owner eyeball of the schema fix):** delta
  collection (`deltasFor` — used by BOTH the re-lock refetch AND `POST /submit`) used to scrape every
  row's checkbox state off the DOM, including LOCKED rows, so the forced-on `grilling` (tier
  optional, checked, disabled) leaked into `included` — after releasing `grill-me`, `grilling`
  re-rendered free-but-ON and would still have installed. Fixed with a name-keyed `userIntent` map
  (value → last clicked state) written ONLY by the skill/razor click handlers and cleared on a
  repo-type/adapter re-derive (reset-to-defaults semantics): a LOCKED row contributes a delta only
  when the map holds an explicit earlier toggle for it (a forced row's checked state is the
  closure's doing, never user intent), so a dependency returns to its tier default when its forcer
  goes off — UNLESS the user explicitly toggled it at some point, in which case that intent survives
  a lock/release cycle of the forcer.
  **Confirm gating + truthful outcome (2026-07-13, same pass):** the Confirm button is DISABLED
  (with the hint swapped to the reason) while zero repo types (single-project) or zero targets
  (monorepo) are selected — `updateConfirmGate()`, re-checked on every repo-type/targets toggle and
  after a failed submit; mirrors the TTY wizard's cancel rule (`controller.ts`: empty selection →
  cancel, never an install). On a submit the page now renders the SERVER'S real verdict: `{ok:true}`
  → done screen; `{ok:false,error}` → "Install failed: <reason>" in the error slot, form kept,
  Confirm re-enabled for a corrected retry. (The page's error branch existed before, but the server
  used to answer `{ok:true}` unconditionally — see `server.ts`'s truthfulness note.)
  **Card-per-domain + divider rows (2026-07-11, presentational pass):** `renderStepCards(step)`
  dispatches per step id instead of one card per step. The `skills` step fans out to ONE CARD PER
  PACK/DOMAIN (`renderSkillCards`) — Common, and one card per selected framework pack (e.g. "Next.js",
  "NestJS") — each card headed by the pack's friendly title (`packCardTitle`, read off the
  non-reactive `repo-type` step's `choice.title` map, e.g. "next" -> "Next.js"; falls back to the
  section's own label, e.g. "Common", when the pack has no matching repo type). The `razor` step
  stays its OWN single card (`renderRazorCard`) but now inserts a `<hr class="group-divider">` row
  BETWEEN each category group (Core / Architecture / … / Domain: Next.js) inside it. Both share
  `sectionRuns(step)`, the common walk that groups `step.choices` by the GENERIC key
  `(choice.section ?? choice.pack) === (section.key ?? section.pack)` (was `choice.pack ===
  section.pack`, which never rendered the razor CATEGORY sub-groups since every razor skill shares
  one pack — same fix the CLI presenter's `paginated-frame.ts` already carries) and drops empty
  groups. repo-type/adapters/targets keep the old single-card-per-step render (`renderSimpleCard`,
  unchanged shape). Rows carry `data-stepid`/`data-value`/`data-tier` so reads (`collectAnswers()`)
  survive re-render without positional indices — the card-per-domain fan-out changes DOM layout only,
  never the POST payload. Reads `choice.title ?? choice.label ?? choice.value` and shows
  `choice.description` when present — this generic read was written ahead of the field landing;
  **2026-07-11 (reconciliation pass): the field is now populated** for repo-type/adapter choices
  (`build-schema.ts`'s `buildRepoTypeStep()`/`buildAdapterStep()` set `title` to the friendly display
  name, e.g. "Next.js"/"Claude Code", and `description` to a consumer-facing one-liner — see
  `src/wizard/CONTEXT.md`), so this page now shows friendly names + descriptions with the zero-edit
  flow-through this comment always intended. On Confirm it POSTs the exact `WizardAnswers` shape and
  shows a done screen. **Visual language adapted from the owner's curation board** (light/dark
  CSS-variable tokens, card/pack sections, mono skill names, pill toggles, tinted clash-note boxes,
  razor purple accent, now a subtle hairline `.group-divider` row); the board's DROP state is
  deliberately not reused (wizard is on/off + locked). FIRST DRAFT for owner aesthetic iteration.
- `build-web-schema.ts` — `buildWebSchema(opts)`: assembles the `WizardSchema` (detection +
  `resolvePacks` + `buildSkillCatalog` + `buildWizardSchema`, single-project branch). It threads
  `excludeSkills`/`includeSkills` INTO `buildWizardSchema`, which resolves each skill layer's
  dependency closure through the shared `resolveSkillLayerRound` (so `requires` locks render, and
  release when their forcer is deselected). `applyPreseeds()` therefore handles ONLY repo-type +
  adapter `checked` flags now; skill/razor `checked`/`disabled` are resolved authoritatively upstream
  (NOT flag-flipped in place, which would leave a forced dependency's lock stale). Shared by `--web`
  and `--emit-schema`.
- `run-web-install.ts` — `runWebInstall(options)` (impure orchestration: build schema → serve →
  open browser → await submit → print → exit; narration on STDERR so `--json` stdout stays clean;
  SIGINT closes cleanly with a non-zero exit). **The write now happens INSIDE the server's
  `onSubmit`** (2026-07-13 truthfulness fix): `buildInstallResultFromAnswers` runs before the HTTP
  response, its result is captured for the terminal summary/exit code, and a failed result is
  returned to the browser as `{ok:false, error: result.summary}` — the answers promise only
  resolves on success, so the post-close tail never re-runs the install. Also exports
  `buildInstallResultFromAnswers()` (the pure tail: `resolve` → `buildInstallResult`) and
  `runEmitSchema()` (prints schema JSON, exits 0).

## Wiring

`cli.ts` declares `--web`/`--cli`/`--no-open`/`--emit-schema` root-only (same commander
duplicate-flag reasoning as `--type` et al) and adds a `wizard` subcommand.
`commands/install-entry.ts`'s `runInstallEntry()` now: short-circuits `--emit-schema` →
`runEmitSchema`; computes the precedence decision; routes `web` → `runWebInstall`, `error` → a clean
exit-1, `cli` → the existing wizard-vs-non-interactive routing (unchanged).

## Known limitations (first-draft holes, documented)

- **~~Whole-form catalog is resolved once, up front.~~ RESOLVED (2026-07-11).** The page now
  re-derives the skills + razor offering on every repo-type/adapter toggle via `GET /schema` (see
  `server.ts`/`page.ts`). First paint still uses the `--type` preset / detection; subsequent toggles
  are authoritative (`detect:false`). Remaining coupling to flag: **adapter → skill** filtering is
  re-derived too (an adapter toggle refetches), but the razor step's applicability is driven by repo
  type only, as before.
- **Skill deltas are computed client-side as tier-defaults deltas** (default-unchecked → excluded,
  optional-checked → included) — exactly what `--exclude-skills`/`--include-skills` express, so the
  dependency closure + re-locking happens server-side in the same install path the CLI uses.
  **Dependency locks are now shown truthfully and re-resolve reactively (2026-07-13, "phantom
  grilling" fix):** the emitted schema renders a `requires`-forced skill locked-on, and a skill/razor
  toggle refetches `GET /schema` with the live deltas so the lock re-resolves (forcer off → dependency
  released). The re-resolution runs SERVER-SIDE through the one shared `resolveSkillLayerRound` — the
  browser JS holds no copy of the resolver (consistent with the repo/adapter re-derive path). Locked
  rows contribute deltas only via explicit recorded user intent (see the `page.ts` leak note above).
  The client wiring IS now driven headlessly: `test/web-page-client.test.ts` extracts the page's
  inline script and runs it in `node:vm` against a minimal DOM stub (real client logic, no browser);
  the rendered VISUAL still stays owner-eyeball territory.
- **Monorepo `targets` step is a best-effort stub** (checked candidate → `{path, types}` from its
  detected guess). The owner-run path is single-project; monorepo web is not exercised yet.
- **The browser VISUAL is not self-certified** — owner eyeball required (proof-of-done). The server
  + wiring ARE demonstrated end-to-end (see tests + the owner-run command in the root `context.md`).

## Tests

- `test/web-precedence.test.ts` — `resolveWebPrecedence` (all branches), `detectDisplay`,
  `browserCommand`/`openBrowser`.
- `test/web-schema.test.ts` — `buildWebSchema`/`--emit-schema`: JSON round-trip, step/section shape,
  required-locked rows, flag pre-seeds. **Forced-dependency locks ("phantom grilling"):** a default
  skill forcing an optional one (`grill-me` → `grilling`) renders the dependency locked-on (checked +
  disabled "needed by grill-me"); excluding the forcer RELEASES it (no stale lock).
- `test/web-server-e2e.test.ts` — server end-to-end WITHOUT a browser: loopback/random-port/token
  URL, GET page embeds schema, bad-token 403 (GET + POST), POST answers → `resolve` →
  `buildInstallResult` writes into a temp target, close-before-submit rejects. **`GET /schema`
  reactive re-derivation** (`types=next` → common+next+Domain: Next.js; `types=next,nest` → both
  packs + Domain: NestJS; `types=` → common-only, razor gated off; bad/missing token → 403).
  **`GET /schema` re-resolves dependency locks against the live selection** (default → `grilling`
  locked-on; `&excluded=grill-me` → `grilling` released). **Zero-type + truthfulness (2026-07-13):**
  a zero-repo-type submit → 400 with "select at least one project type", answers NOT resolved; with
  `onSubmit` wired to the real install tail, a failing install (empty adapters) → 422 `{ok:false}`
  with the backend's reason and NOTHING written, then a corrected resubmit → 200, answers resolve,
  files land.
- `test/web-page-client.test.ts` — the page's CLIENT JS headlessly: the inline script from
  `renderWizardPage()` runs in `node:vm` against a minimal DOM stub (createElement/querySelectorAll/
  listeners/timers/fetch stubs). Pins the client-delta leak: default → toggle `grill-me` off → the
  re-lock refetch URL AND the `POST /submit` payload carry NO `grilling` in `included` (and
  `grill-me` in `excluded`); `grilling` re-renders free + Off; the captured payload through the real
  `buildInstallResultFromAnswers` tail writes NO `grilling`/`grill-me` skill dirs and a profile
  without them. Second sequence: an EXPLICIT `grilling` include survives its forcer's lock/release
  cycle (the name-keyed intent map, not DOM scraping). **Gating + truthfulness (2026-07-13):**
  zero-repo-type first paint → Confirm disabled with the "select at least one project type" hint,
  checking a type opens the gate (and unchecking closes it); a failed submit (`{ok:false,error}`)
  keeps the form (masthead visible), shows "Install failed: <reason>", re-enables Confirm; a
  successful retry reaches the done screen.
