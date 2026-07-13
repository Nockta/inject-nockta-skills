import type { WizardSchema } from "../wizard/core/types.js";

/**
 * The self-contained `--web` wizard page (decisions.md D30) — one HTML string, inline CSS + JS, NO
 * external CDN/font/network reference (D30's security + offline requirement). The `WizardSchema`
 * and one-time token are embedded as JSON; ALL rendering happens client-side from that schema, so
 * a future Model change (new step, renamed choice, an added/changed `title`/`description`) flows
 * through with zero page edits — the renderer reads `choice.title ?? choice.label ?? choice.value`
 * and shows `choice.description` whenever present. `title`/`description` are populated today for
 * repo-type/adapter choices (friendly names like "Next.js"/"Claude Code" — decisions.md D30
 * reconciliation pass, 2026-07-11; see `src/wizard/CONTEXT.md`).
 *
 * VISUAL LANGUAGE: adapted from the owner's curation board (light/dark CSS-variable token system,
 * card/pack sections, mono skill names, pill toggles, tinted clash-note boxes, the razor layer's
 * purple accent). This is still a FIRST DRAFT for owner aesthetic iteration (D30). The board's
 * three-state tier segment (required/default/optional/DROP) is mapped down to the wizard's actual
 * semantics: a single on/off pill per choice, plus a forced-on + disabled "locked" pill for
 * required/dependency-locked skills — the board's DROP state is deliberately not reused.
 *
 * It renders every step the schema emits generically: repo-type/adapters as toggle groups, the
 * skills + razor steps grouped into their pack SECTIONS with headers, each choice showing its
 * description and clash note, locked/required rows forced-on + disabled with their reason. On
 * Confirm it POSTs the exact `WizardAnswers` shape `resolve()` expects and shows a done screen.
 */

/** JSON for a `<script>` context — escapes the only sequences that can break out of it. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/[\u2028\u2029]/g, function (ch) {
      return "\\u" + ch.charCodeAt(0).toString(16);
    });
}

export function renderWizardPage(schema: WizardSchema, token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nockta — Install skills</title>
<style>
  :root {
    --bg: #eef1f5; --bg-raised: #f7f9fb; --surface: #ffffff; --surface-2: #f3f6f9;
    --ink: #1a2029; --ink-soft: #3a4250; --muted: #5c6675; --faint: #8993a3;
    --border: #dde3ea; --border-strong: #c7d0da;
    --accent: #2f6690; --accent-ink: #1f4a6b; --accent-tint: #e4edf4; --accent-ring: rgba(47,102,144,0.35);
    --on: #2f7a56; --on-tint: #e3f2ea;
    --lock: #46505f; --lock-tint: #e7eaee;
    --razor: #7d4f9e; --razor-ink: #5e3a79; --razor-tint: #f1e8f7;
    --clash: #b0446a; --clash-ink: #8f2f52; --clash-tint: #f9e6ec;
    --shadow-card: 0 1px 2px rgba(20,28,38,0.06), 0 8px 20px -12px rgba(20,28,38,0.18);
    --radius: 10px; --radius-sm: 6px;
    --font-body: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12161c; --bg-raised: #171c23; --surface: #1a2029; --surface-2: #212832;
      --ink: #e9edf2; --ink-soft: #c4ccd6; --muted: #96a1af; --faint: #6d7885;
      --border: #2a323d; --border-strong: #384252;
      --accent: #6fa8d4; --accent-ink: #bcdcf5; --accent-tint: #1c2c38; --accent-ring: rgba(111,168,212,0.4);
      --on: #6fc79b; --on-tint: #17301f;
      --lock: #b9c2cf; --lock-tint: #262d37;
      --razor: #b98fda; --razor-ink: #d9bdf0; --razor-tint: #2a2036;
      --clash: #e08aa8; --clash-ink: #f0c2d2; --clash-tint: #35202a;
      --shadow-card: 0 1px 2px rgba(0,0,0,0.3), 0 12px 26px -14px rgba(0,0,0,0.55);
    }
  }
  * { box-sizing: border-box; }
  html { color-scheme: light dark; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  ::selection { background: var(--accent-ring); }
  .mono { font-family: var(--font-mono); }

  .masthead { max-width: 900px; margin: 0 auto; padding: 34px 22px 8px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--faint); }
  .masthead h1 { font-size: 25px; letter-spacing: -0.01em; margin: 6px 0 0; font-weight: 700; text-wrap: balance; }
  .masthead p { margin: 6px 0 0; color: var(--muted); max-width: 62ch; font-size: 14px; }
  .masthead .meta { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  .meta-chip { padding: 4px 11px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 12px; color: var(--ink-soft); }
  .meta-chip.type { color: var(--accent-ink); background: var(--accent-tint); border-color: var(--accent-ring); font-family: var(--font-mono); }

  .wrap { max-width: 900px; margin: 0 auto; padding: 10px 22px 130px; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card); overflow: hidden; margin-top: 18px; }
  .card > .card-head { padding: 15px 20px; background: var(--surface-2); border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .card > .card-head h2 { font-size: 17px; font-weight: 700; margin: 0; }
  .card.razor { border-color: var(--razor); border-left-width: 3px; }
  .card.razor > .card-head { background: var(--razor-tint); }
  .card.razor > .card-head h2 { color: var(--razor-ink); }
  .razor-badge { font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; color: var(--razor-ink); background: var(--razor-tint); border: 1px solid var(--razor); padding: 2px 9px; border-radius: 999px; }
  .card-body { padding: 6px 20px 14px; }
  .preamble { white-space: pre-wrap; font: 12px/1.5 var(--font-mono); color: var(--ink-soft); background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin: 12px 0; overflow-x: auto; }

  .section-h { margin: 16px 0 4px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--faint); font-weight: 700; }
  .card.razor .section-h { color: var(--razor-ink); }
  .section-h:first-child { margin-top: 4px; }

  /* Divider row between category sections inside a multi-group card (razor). Subtle — a hairline,
     not a heavy rule — so it reads as a separator, not a new region. */
  .group-divider { height: 1px; margin: 14px 0 2px; background: var(--border); border: none; }
  .card.razor .group-divider { background: var(--razor); opacity: 0.3; }

  .choice { display: flex; gap: 14px; padding: 12px 6px; border-bottom: 1px solid var(--border); align-items: flex-start; }
  .choice:last-child { border-bottom: none; }
  .choice .cbody { min-width: 0; flex: 1; }
  .choice .cname { font-family: var(--font-mono); font-weight: 700; font-size: 13.5px; color: var(--ink); }
  .choice .cname .enum { color: var(--faint); font-weight: 400; font-size: 11.5px; margin-left: 7px; }
  .choice .cdesc { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; line-height: 1.45; max-width: 60ch; }
  .choice .clocknote { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--lock); margin-top: 6px; }
  .clash-note { font-size: 11.5px; color: var(--clash-ink); background: var(--clash-tint); border: 1px solid var(--clash); border-radius: var(--radius-sm); padding: 5px 9px; margin-top: 7px; line-height: 1.45; max-width: 60ch; }
  .clash-note b { font-weight: 700; }
  .clash-note .clash-names { font-family: var(--font-mono); }

  /* on/off pill toggle (adapted from the board's .opt pill; DROP state intentionally omitted) */
  .toggle { position: relative; flex: none; }
  .toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
  .toggle .pill { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 82px; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease; }
  .toggle .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex: none; }
  .toggle input:checked + .pill { background: var(--on); border-color: var(--on); color: #fff; }
  .toggle input:checked + .pill::before { background: #fff; }
  .toggle input:focus-visible + .pill { outline: 2px solid var(--accent); outline-offset: 2px; }

  .lock-pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 82px; padding: 7px 12px; border-radius: 999px; background: var(--lock-tint); color: var(--lock); font-size: 11.5px; font-weight: 700; border: 1px solid var(--border-strong); cursor: default; }

  .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: color-mix(in srgb, var(--bg-raised) 92%, transparent); backdrop-filter: blur(10px) saturate(1.1); -webkit-backdrop-filter: blur(10px) saturate(1.1); border-top: 1px solid var(--border); }
  .bar .inner { max-width: 900px; margin: 0 auto; padding: 13px 22px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .bar .hint { color: var(--faint); font-size: 12.5px; }
  .bar .err { color: var(--clash-ink); font-size: 12.5px; }
  button.confirm { appearance: none; background: var(--accent); color: #fff; border: 1px solid var(--accent); border-radius: 999px; padding: 10px 22px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background 0.12s ease, transform 0.05s ease; }
  button.confirm:hover { background: var(--accent-ink); border-color: var(--accent-ink); }
  button.confirm:active { transform: translateY(1px); }
  button.confirm:disabled { opacity: 0.5; cursor: default; }

  .done { text-align: center; padding: 130px 24px; }
  .done .check { width: 68px; height: 68px; margin: 0 auto; border-radius: 50%; background: var(--on-tint); color: var(--on); display: flex; align-items: center; justify-content: center; font-size: 34px; border: 1px solid var(--on); }
  .done h2 { font-size: 22px; margin: 18px 0 6px; font-weight: 700; }
  .done p { color: var(--muted); }
</style>
</head>
<body>
<div class="masthead">
  <div class="eyebrow">Nockta skill installer</div>
  <h1>Install Nockta skills</h1>
  <p>Pick your project type, agent tools, and skills. Nothing is written until you confirm.</p>
  <div class="meta" id="mast-meta"></div>
</div>
<div id="app" class="wrap"></div>
<script>
(function () {
  "use strict";
  var SCHEMA = ${embedJson(schema)};
  var TOKEN = ${embedJson(token)};

  // The skills + razor steps re-derive on every repo-type/adapter toggle (Bug A fix). Everything
  // else — repo-type, adapters, confirm, monorepo flag — is fixed for the life of the page and read
  // straight off SCHEMA. The reactive steps live in their own array, swapped on each /schema fetch.
  var reactiveSteps = (SCHEMA.steps || []).filter(function (s) { return s.id === "skills" || s.id === "razor"; });

  // The user's explicit skill/razor toggles, name-keyed (value -> last clicked state). Written ONLY
  // by actual click handlers; cleared when a repo-type/adapter re-derive resets the offering to its
  // defaults. A LOCKED row's checked state is the dependency closure's doing, never user intent —
  // delta collection must not scrape it off the DOM, or a forced-on optional (grilling, forced by
  // default grill-me) leaks into the included deltas and survives its forcer's release: after
  // toggling grill-me off, grilling would re-render free-but-ON and still install. Locked rows
  // contribute a delta only when this map holds an explicit earlier toggle for them.
  var userIntent = {};

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function displayName(c) { return c.title != null ? c.title : (c.label != null ? c.label : c.value); }
  /** The generic grouping key: a choice/section falls back to its real pack when no section key is set. */
  function groupKey(x) { return x.section != null ? x.section : (x.key != null ? x.key : x.pack); }

  /** pack value -> friendly title (e.g. "next" -> "Next.js"), read off the (non-reactive) repo-type
      step's choices, which already carry the friendly title (build-schema.ts's REPO_TYPE_TITLES).
      Packs with no matching repo type (e.g. "common") fall back to the section's own label. */
  var packTitles = (function () {
    var map = {};
    (SCHEMA.steps || []).forEach(function (s) {
      if (s.id === "repo-type" && s.choices) {
        s.choices.forEach(function (c) { if (c.title) map[c.value] = c.title; });
      }
    });
    return map;
  })();
  function packCardTitle(section) { return packTitles[section.pack] || section.label; }

  /** Runs of choices for a step's sections, in section order, skipping empty ones — the shared walk
      behind both the per-domain skill cards and the razor card's divided groups. */
  function sectionRuns(step) {
    var choices = step.choices || [];
    var sections = step.sections || [];
    var runs = sections
      .map(function (sec) {
        var key = groupKey(sec);
        return { section: sec, choices: choices.filter(function (c) { return groupKey(c) === key; }) };
      })
      .filter(function (r) { return r.choices.length > 0; });
    var grouped = sections;
    var leftover = choices.filter(function (c) {
      return !grouped.some(function (s) { return groupKey(s) === groupKey(c); });
    });
    if (leftover.length > 0) runs.push({ section: null, choices: leftover });
    return runs;
  }

  // All rows carry data-stepid + data-value (+ data-tier for skills/razor, data-types for targets),
  // so reads survive a re-render and never depend on a positional index that shifts when the razor
  // step appears/disappears.
  function renderChoice(step, choice) {
    var row = el("div", "choice");

    if (choice.disabled) {
      var lock = el("span", "lock-pill");
      lock.appendChild(document.createTextNode("🔒 Locked"));
      row.appendChild(lock);
      var hidden = el("input");
      hidden.type = "checkbox"; hidden.checked = !!choice.checked; hidden.disabled = true; hidden.style.display = "none";
      tagInput(hidden, step, choice);
      row.appendChild(hidden);
    } else {
      var t = el("label", "toggle");
      var box = el("input");
      box.type = "checkbox"; box.checked = !!choice.checked;
      tagInput(box, step, choice);
      var pill = el("span", "pill");
      var pillText = el("span", null, box.checked ? "On" : "Off");
      pill.appendChild(pillText);
      box.addEventListener("change", function () { pillText.textContent = box.checked ? "On" : "Off"; });
      // Toggling a repo-type or adapter re-derives the skills+razor offering (debounced); toggling
      // a skill/razor row re-locks (re-resolves dependency locks against the live selection).
      // repo-type/targets toggles also re-check the Confirm gate (at least one must be selected).
      if (step.id === "repo-type" || step.id === "adapters") {
        box.addEventListener("change", function () { if (step.id === "repo-type") { updateMetaTypes(); updateConfirmGate(); } scheduleRederive(); });
      } else if (step.id === "skills" || step.id === "razor") {
        box.addEventListener("change", function () { userIntent[choice.value] = box.checked; scheduleRelock(); });
      } else if (step.id === "targets") {
        box.addEventListener("change", updateConfirmGate);
      }
      t.appendChild(box); t.appendChild(pill);
      row.appendChild(t);
    }

    var body = el("div", "cbody");
    var name = el("div", "cname");
    name.appendChild(document.createTextNode(displayName(choice)));
    if (choice.title != null && choice.value !== choice.title) name.appendChild(el("span", "enum", choice.value));
    body.appendChild(name);
    if (choice.description) body.appendChild(el("div", "cdesc", choice.description));
    if (choice.disabled && choice.disabledReason) body.appendChild(el("div", "clocknote", choice.disabledReason));
    if (choice.clashesWith && choice.clashesWith.length) {
      var clash = el("div", "clash-note");
      clash.appendChild(el("b", null, "⚠ Overlaps with "));
      clash.appendChild(el("span", "clash-names", choice.clashesWith.join(", ")));
      clash.appendChild(document.createTextNode(" — enable at your discretion."));
      body.appendChild(clash);
    }
    row.appendChild(body);
    return row;
  }

  function tagInput(input, step, choice) {
    input.setAttribute("data-stepid", step.id);
    input.setAttribute("data-value", choice.value);
    if (choice.tier != null) input.setAttribute("data-tier", choice.tier);
    if (choice.types != null) input.setAttribute("data-types", JSON.stringify(choice.types));
  }

  /** Confirm step: at most one card (the preamble review box), or none when there's no preamble. */
  function renderConfirmCards(step) {
    if (!step.preamble) return [];
    var pc = el("div", "card");
    var ph = el("div", "card-head"); ph.appendChild(el("h2", null, step.title || "Review")); pc.appendChild(ph);
    var pb = el("div", "card-body"); var pre = el("pre", "preamble"); pre.textContent = step.preamble; pb.appendChild(pre); pc.appendChild(pb);
    return [pc];
  }

  /** repo-type / adapters / targets: one card for the whole step (unchanged from before this pass —
      these steps have no sections today, but the sectioned-with-headers fallback is kept generic). */
  function renderSimpleCard(step) {
    var card = el("div", "card");
    var head = el("div", "card-head");
    head.appendChild(el("h2", null, step.title));
    card.appendChild(head);

    var body = el("div", "card-body");
    if (step.preamble) { var p = el("pre", "preamble"); p.textContent = step.preamble; body.appendChild(p); }

    var runs = sectionRuns(step);
    if (runs.length > 0) {
      runs.forEach(function (run) {
        if (run.section) body.appendChild(el("div", "section-h", run.section.label));
        run.choices.forEach(function (c) { body.appendChild(renderChoice(step, c)); });
      });
    } else {
      (step.choices || []).forEach(function (c) { body.appendChild(renderChoice(step, c)); });
    }
    card.appendChild(body);
    return [card];
  }

  /** skills step: ONE CARD PER PACK/DOMAIN (Common, Next.js, NestJS, …) instead of a single lumped
      card — the pack/domain's friendly title (packCardTitle) becomes that card's header. A pack with
      zero offerable choices for the current selection simply produces no card. */
  function renderSkillCards(step) {
    var runs = sectionRuns(step);
    if (runs.length === 0) return [];
    return runs.map(function (run) {
      var card = el("div", "card");
      var head = el("div", "card-head");
      head.appendChild(el("h2", null, run.section ? packCardTitle(run.section) : step.title));
      card.appendChild(head);
      var body = el("div", "card-body");
      run.choices.forEach(function (c) { body.appendChild(renderChoice(step, c)); });
      card.appendChild(body);
      return card;
    });
  }

  /** razor step: stays ONE card (its own, separate from the skill domain cards), but with a visible
      divider row between each category group (Core / Architecture / … / Domain: Next.js) inside it. */
  function renderRazorCard(step) {
    var runs = sectionRuns(step);
    var card = el("div", "card razor");
    var head = el("div", "card-head");
    head.appendChild(el("h2", null, step.title));
    head.appendChild(el("span", "razor-badge", "Razor · engineering doctrine"));
    card.appendChild(head);

    var body = el("div", "card-body");
    if (step.preamble) { var p = el("pre", "preamble"); p.textContent = step.preamble; body.appendChild(p); }
    runs.forEach(function (run, i) {
      if (i > 0) body.appendChild(el("hr", "group-divider"));
      if (run.section) body.appendChild(el("div", "section-h", run.section.label));
      run.choices.forEach(function (c) { body.appendChild(renderChoice(step, c)); });
    });
    card.appendChild(body);
    return [card];
  }

  /** One step -> zero or more cards. Dispatches per step id: skills fans out to per-domain cards,
      razor stays one card with internal dividers, everything else is the simple single-card render. */
  function renderStepCards(step) {
    if (step.id === "confirm") return renderConfirmCards(step);
    if (step.id === "skills") return renderSkillCards(step);
    if (step.id === "razor") return renderRazorCard(step);
    return renderSimpleCard(step);
  }

  // ---- DOM-driven reads (index-free; survive re-render of the reactive region) ----
  function inputsFor(stepId) { return document.querySelectorAll('input[data-stepid="' + stepId + '"]'); }

  function checkedValues(stepId) {
    var out = [];
    inputsFor(stepId).forEach(function (inp) { if (inp.checked) out.push(inp.getAttribute("data-value")); });
    return out;
  }

  // Deltas off the tier defaults — exactly what --exclude-skills / --include-skills express, so the
  // dependency closure + re-locking happens server-side in the same install path the CLI uses.
  function deltasFor(stepId) {
    var excluded = [], included = [];
    inputsFor(stepId).forEach(function (inp) {
      var tier = inp.getAttribute("data-tier"); var v = inp.getAttribute("data-value");
      var on;
      if (inp.disabled) {
        // Locked/forced row (required, or dependency-locked): its checked state is NOT user
        // intent. Only an explicit earlier user toggle (recorded by the click handler) counts —
        // otherwise contribute no delta; the server-side closure re-forces it while needed.
        if (!Object.prototype.hasOwnProperty.call(userIntent, v)) return;
        on = userIntent[v];
      } else {
        on = inp.checked;
      }
      if (tier === "default" && !on) excluded.push(v);
      if (tier === "optional" && on) included.push(v);
    });
    return { excluded: excluded, included: included };
  }

  function collectTargets(stepId) {
    var out = [];
    inputsFor(stepId).forEach(function (inp) {
      if (!inp.checked) return;
      var types = []; try { types = JSON.parse(inp.getAttribute("data-types") || "[]"); } catch (e) {}
      out.push({ path: inp.getAttribute("data-value"), types: types });
    });
    return out;
  }

  function presentStepIds() {
    var ids = {};
    (SCHEMA.steps || []).forEach(function (s) { if (s.id !== "skills" && s.id !== "razor") ids[s.id] = true; });
    reactiveSteps.forEach(function (s) { ids[s.id] = true; });
    return ids;
  }

  function collectAnswers() {
    var answers = { monorepo: !!SCHEMA.monorepo };
    var ids = presentStepIds();
    if (ids["repo-type"]) answers.repoTypes = checkedValues("repo-type");
    if (ids["adapters"]) answers.adapters = checkedValues("adapters");
    if (ids["skills"]) answers.skills = deltasFor("skills");
    if (ids["razor"]) answers.razor = deltasFor("razor");
    if (ids["targets"]) answers.targets = collectTargets("targets");
    answers.confirmed = true;
    return answers;
  }

  // ---- Reactive re-derivation (debounced, stale-safe) ----
  var reactiveEl = null;
  var deriveSeq = 0;
  var deriveTimer = null;

  function renderReactive() {
    if (!reactiveEl) return;
    reactiveEl.innerHTML = "";
    reactiveSteps.forEach(function (step) { renderStepCards(step).forEach(function (c) { reactiveEl.appendChild(c); }); });
  }

  function scheduleRederive() {
    if (deriveTimer) clearTimeout(deriveTimer);
    deriveTimer = setTimeout(function () { fetchOffering(false); }, 150);
  }

  // A skill/razor toggle re-fetches the offering WITH the page's current deltas so the server
  // re-resolves dependency locks against the live selection (toggling the forcing skill grill-me
  // off RELEASES the forced grilling, instead of leaving it stale-locked). Same debounce + seq
  // guard as a repo/adapter re-derive; the returned schema already reflects the sent deltas, so the
  // user's toggles are preserved across the re-render.
  function scheduleRelock() {
    if (deriveTimer) clearTimeout(deriveTimer);
    deriveTimer = setTimeout(function () { fetchOffering(true); }, 150);
  }

  /** Current skill + razor deltas (both layers merged) — what --exclude/--include-skills express. */
  function collectSkillDeltas() {
    var s = deltasFor("skills");
    var r = deltasFor("razor");
    return { excluded: s.excluded.concat(r.excluded), included: s.included.concat(r.included) };
  }

  function fetchOffering(withDeltas) {
    var types = checkedValues("repo-type");
    var adapters = checkedValues("adapters");
    var seq = ++deriveSeq;
    var url = "/schema?t=" + encodeURIComponent(TOKEN) +
      "&types=" + encodeURIComponent(types.join(",")) +
      "&adapters=" + encodeURIComponent(adapters.join(","));
    if (withDeltas) {
      var d = collectSkillDeltas();
      url += "&excluded=" + encodeURIComponent(d.excluded.join(",")) +
        "&included=" + encodeURIComponent(d.included.join(","));
    }
    fetch(url).then(function (r) { return r.json(); }).then(function (newSchema) {
      if (seq !== deriveSeq) return; // a newer toggle already fired — ignore this stale response
      if (!newSchema || !newSchema.steps) return;
      // A repo/adapter change (withDeltas=false) resets skill/razor to the freshly-derived per-type
      // defaults (matches the CLI's runSkillStep, which re-defaults on a type change; deltas are
      // NOT preserved across a change that drops a skill from the offer set) — recorded user intent
      // is cleared with them. A skill toggle (withDeltas=true) preserves the selection — the sent
      // deltas are baked into the new schema.
      if (!withDeltas) userIntent = {};
      reactiveSteps = newSchema.steps.filter(function (s) { return s.id === "skills" || s.id === "razor"; });
      renderReactive();
    }).catch(function () { /* transient network error — the next toggle retries */ });
  }

  function updateMetaTypes() {
    var meta = document.getElementById("mast-meta");
    if (!meta) return;
    meta.querySelectorAll(".meta-chip.type").forEach(function (n) { n.remove(); });
    checkedValues("repo-type").forEach(function (t) { meta.appendChild(el("span", "meta-chip type", t)); });
  }

  function showDone() {
    document.querySelector(".masthead").style.display = "none";
    var bar = document.querySelector(".bar"); if (bar) bar.style.display = "none";
    var app = document.getElementById("app"); app.className = ""; app.innerHTML = "";
    var d = el("div", "done");
    var chk = el("div", "check"); chk.textContent = "✓"; d.appendChild(chk);
    d.appendChild(el("h2", null, "Done — you can close this tab"));
    d.appendChild(el("p", null, "Nockta is writing your files. Return to the terminal for the summary."));
    app.appendChild(d);
  }

  function submit(btn, errNode) {
    btn.disabled = true; errNode.textContent = "";
    fetch("/submit?t=" + encodeURIComponent(TOKEN), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, answers: collectAnswers() })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) showDone();
      else { errNode.textContent = "Install failed: " + ((j && j.error) || "unknown error"); btn.disabled = false; updateConfirmGate(); }
    }).catch(function (e) { errNode.textContent = "Network error: " + e; btn.disabled = false; updateConfirmGate(); });
  }

  // ---- Confirm gating (mirrors the TTY wizard's cancel rules: zero repo types / zero targets is
  // never installable — the CLI backend requires at least one, so the page must not offer a submit
  // that can only fail after claiming success) ----
  var confirmBtn = null;
  var hintNode = null;
  var DEFAULT_HINT = "Nothing is written until you confirm.";

  function updateConfirmGate() {
    if (!confirmBtn) return;
    var ids = presentStepIds();
    var blocked = null;
    if (ids["repo-type"] && checkedValues("repo-type").length === 0) blocked = "Select at least one project type to continue.";
    if (ids["targets"] && checkedValues("targets").length === 0) blocked = "Select at least one workspace package to continue.";
    confirmBtn.disabled = !!blocked;
    hintNode.textContent = blocked || DEFAULT_HINT;
  }

  function render() {
    var meta = document.getElementById("mast-meta");
    meta.appendChild(el("span", "meta-chip", SCHEMA.monorepo ? "Monorepo" : "Single project"));

    var app = document.getElementById("app");
    // Static steps render once; the first skills/razor step marks where the reactive region goes.
    (SCHEMA.steps || []).forEach(function (step) {
      if (step.id === "skills" || step.id === "razor") {
        if (!reactiveEl) { reactiveEl = el("div"); reactiveEl.id = "reactive"; app.appendChild(reactiveEl); }
        return;
      }
      renderStepCards(step).forEach(function (c) { app.appendChild(c); });
    });
    if (!reactiveEl) { reactiveEl = el("div"); reactiveEl.id = "reactive"; app.appendChild(reactiveEl); }
    renderReactive();
    updateMetaTypes();

    var bar = el("div", "bar"); var inner = el("div", "inner");
    var left = el("div");
    hintNode = el("div", "hint", DEFAULT_HINT);
    left.appendChild(hintNode);
    var errNode = el("div", "err"); left.appendChild(errNode);
    var btn = el("button", "confirm", "Confirm & install"); btn.type = "button";
    btn.addEventListener("click", function () { submit(btn, errNode); });
    inner.appendChild(left); inner.appendChild(btn); bar.appendChild(inner);
    document.body.appendChild(bar);
    confirmBtn = btn;
    updateConfirmGate();
  }

  render();
})();
</script>
</body>
</html>`;
}
