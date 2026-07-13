---
name: liquid-theme-standards
description: "Front-end craft standards for Shopify Liquid themes — the CSS architecture, semantic HTML, and vanilla-JS/custom-element patterns that keep a theme fast, maintainable, and merchant-safe. Use whenever authoring or reviewing the CSS/JS/HTML inside .liquid sections, snippets, and blocks or the theme's assets/ files: class naming and BEM structure, design tokens and CSS custom properties, cascade layers and a specificity budget, defensive/responsive CSS, container queries, Web Components / custom elements for interactive sections, progressive enhancement, and CLS/LCP-aware performance. Trigger this even when the user just says 'style this section', 'name these classes', 'set up theme tokens', 'write a custom element for my slider', 'why is my theme layout shifting', 'organize my theme's CSS', or asks where CSS/JS should live in a Liquid theme — not only when they name BEM, tokens, or Web Components explicitly. For accessibility specifically (ARIA, focus, contrast) use liquid-a11y; for Liquid language/objects/schema use shopify-liquid."
---

# Front-End Standards for Shopify Liquid Themes (CSS / HTML / JS craft)

## Why this exists

Every Shopify theme is the same shape underneath: a `layout/theme.liquid`
shell, a pile of `sections/*.liquid` a merchant reorders in the editor, the
`snippets/` they reuse, and the `assets/` that style and script them. Because
sections are *composed by merchants at runtime* — dropped in any order, any
number of times, on any template — theme CSS and JS have constraints a normal
site doesn't: a section can't assume what's above or below it, two copies of
the same section must not fight over global state, and a merchant's colour
pick in the editor must flow into the stylesheet without you redeploying.

Getting the front-end craft right once — how classes are named, where a value
lives, how a section wires up its behaviour — pays back on every section after,
because the theme keeps rendering the same handful of primitives (card, grid,
media, form control, disclosure, slider). This skill is the working reference
for building those primitives to a consistent, opinionated standard, and for
reviewing existing `.liquid`/`.css`/`.js` against something concrete instead
of taste.

Scope note: this is *craft and architecture* — naming, cascade, tokens,
custom elements, performance. It is **not** the accessibility skill
(`liquid-a11y` owns ARIA, focus management, contrast, reduced-motion) nor the
Liquid-language skill (`shopify-liquid` owns objects, filters, tags, schema).
Those overlap at the edges and are cross-referenced where they do.

## How to use this skill

1. **Name what you're touching** — a whole section, a reusable snippet, a
   single component's styles, or a piece of interactive behaviour.
2. **Jump to the relevant section below.** Each states what it grounds in
   (a web platform standard or a Shopify theme constraint), *why* the rule
   exists for themes specifically, and a concrete example to adapt — not
   copy blindly, since class names should match the theme you're in.
3. **Decide where the code lives first** (§1) before writing it — the biggest
   theme-CSS mistakes are placement mistakes (Liquid inside a non-processed
   `{% stylesheet %}`, global state in a repeatable section).
4. **Keep semantics native** (§6): reach for a real HTML element before a
   scripted one, so behaviour and keyboard support come for free.
5. **Run the verification checklist** at the end before calling a section done.
6. Longer worked patterns live in the references:
   `references/css-architecture.md` (layers, token system, grid/container
   recipes, defensive CSS catalogue) and
   `references/javascript-patterns.md` (custom-element lifecycle, events,
   fetch/AbortController, Section Rendering API wiring).

## Standards this skill is grounded in

- **HTML Living Standard** (WHATWG) — https://html.spec.whatwg.org/
- **CSS specifications** (W3C) — cascade & inheritance, custom properties,
  cascade layers, containment/container queries, nesting —
  https://www.w3.org/Style/CSS/
- **MDN Web Docs** (patterns/behaviour reference) —
  https://developer.mozilla.org/
- **Web Components / custom elements** (WHATWG DOM + HTML) —
  https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- **Shopify theme architecture & performance** (public docs) —
  https://shopify.dev/docs/storefronts/themes/architecture and
  https://shopify.dev/docs/storefronts/themes/best-practices/performance

Accessibility criteria referenced in passing (focus rings, reduced motion)
are owned in full by the `liquid-a11y` skill — this skill points at them but
does not restate them.

---

## 1. Where front-end code lives in a theme

**Grounds in:** Shopify theme architecture (the `{% stylesheet %}` and
`{% javascript %}` tags are collected per-theme, deduplicated, and emitted
once regardless of how many times a section renders).

The single most important thing to get right before writing any CSS or JS is
*where it goes*, because the theme runtime treats each location differently.

| You're writing | Put it in | Processes Liquid? | Emitted how |
|---|---|---|---|
| Styles owned by one section/snippet | `{% stylesheet %}` in that file | **No** | Concatenated once into the theme's combined stylesheet, even if the section renders 5×|
| Styles that need a merchant/Liquid value | inline `style="--x: {{ ... }}"` **or** a `{% style %}` block | Yes | Rendered inline where it appears |
| Global tokens, resets, shared utilities | `assets/*.css` linked in `theme.liquid` | No (static asset) | One request, cacheable |
| Behaviour owned by one section | `{% javascript %}` in that file, or a custom element in `assets/*.js` | No | Concatenated once into the theme's combined script |
| Shared components / custom-element definitions | `assets/*.js` | No | Loaded once |

Two rules fall out of this table and cause most theme-CSS bugs:

- **`{% stylesheet %}` does not run Liquid.** Writing
  `.hero { background: {{ section.settings.bg }}; }` inside it ships the
  literal text `{{ section.settings.bg }}`. Dynamic values must ride in on a
  custom property set inline, and the static rule *consumes* that property:

  ```liquid
  {%- comment -%} inline: the only place the merchant value can enter {%- endcomment -%}
  <section
    class="section-hero"
    style="--hero-bg: {{ section.settings.bg_color }}; --hero-pad-block: {{ section.settings.padding }}px;"
  >
    …
  </section>

  {% stylesheet %}
    .section-hero {
      background: var(--hero-bg, var(--color-bg));
      padding-block: var(--hero-pad-block, 4rem);
    }
  {% endstylesheet %}
  ```

- **A section can render more than once, so its CSS/JS must be idempotent and
  self-scoped.** No `:root`-level state written from inside a section, no
  `id`-based styling (`id`s collide when the section repeats — see §3), and
  custom-element definitions guarded so a second copy doesn't re-`define`
  (§7). Where a value must be unique per instance, key it on `section.id`.

## 2. Class naming — BEM as the theme's shared vocabulary

**Grounds in:** CSS cascade/specificity (a flat, single-class convention keeps
every rule at the same low specificity so later rules reliably win).

Themes are edited by many hands over years; an agreed naming convention is
what lets someone read a class in the DOM and know exactly which file styles
it. BEM (Block / Element / Modifier) is that convention here because it
encodes structure into the name itself and keeps specificity flat.

```
block                  a standalone component        .price-list
block__element         a part of that block          .price-list__amount
block--modifier        a variant of the block        .price-list--compact
block__element--mod    a variant of a part           .price-list__amount--sale
```

```html
<div class="price-list price-list--compact">
  <span class="price-list__amount price-list__amount--sale">{{ price | money }}</span>
  <span class="price-list__compare">{{ compare_at | money }}</span>
</div>
```

Rules that keep BEM honest in a theme:

- **Words within a name are hyphenated** (`.media-card`), the element joiner
  is `__`, the modifier joiner is `--`. Don't camelCase class names.
- **One element level, never chained.** `.media-card__title` is right;
  `.media-card__body__title` is not — if a part needs its own sub-parts, it's
  really its own block. This flatness is deliberate: it keeps the DOM class
  names shallow even when the markup is deep.
- **A modifier never stands alone.** Write `class="button button--primary"`,
  not `class="button--primary"` — the modifier only *adjusts* the base, so the
  base must always be present or the component loses its baseline styles.
- **Start a new block the moment a part could exist on its own.** A button
  inside a card is `.button`, not `.card__button` — it's a reusable primitive
  that happens to be *placed* in the card, so it carries its own block name and
  the card only handles its placement.

## 3. A specificity budget and cascade layers

**Grounds in:** CSS cascade — specificity comparison and cascade layers
(`@layer`), which let you order whole buckets of rules regardless of selector
strength.

Specificity fights (`!important` wars, ever-longer selectors to "win") are the
classic way a theme's CSS rots. Two disciplines prevent it: a hard budget on
how strong any selector may be, and cascade layers to make override order
*intentional* rather than an accident of selector strength.

The budget:

- **Target `(0,1,0)` — a single class — for almost everything.** State and
  variants ride on modifier classes or `[data-state]` attributes, both still
  low specificity.
- **`(0,4,0)` is the ceiling** for the occasional parent-context rule; if you
  need more you have a structure problem, not a specificity problem.
- **Never style by `id`** — beyond the `(1,0,0)` specificity spike, `id`s
  aren't unique once a section repeats, so `id` styling breaks silently the
  second a merchant adds a second copy.
- **Never `!important`** except to override a hostile third-party/app style
  you don't control — and when forced, leave a comment saying what and why.
- **Prefer classes to element/descendant selectors**, so moving markup around
  doesn't quietly restyle it.

Cascade layers make the *order* explicit so low-specificity rules can still
override earlier ones by living in a later layer:

```css
/* Declared once, e.g. in assets/theme.css — order here IS the priority order */
@layer reset, tokens, base, layout, components, utilities;

@layer components {
  .button { /* … */ }
}

@layer utilities {
  /* A one-class utility beats a one-class component rule purely by layer
     order — no !important, no specificity inflation. */
  .u-hidden { display: none; }
}
```

Anything *outside* any layer beats everything *inside* a layer, so keep
theme-authored CSS in layers and reserve unlayered rules for genuine
last-word overrides.

## 4. Design tokens (CSS custom properties)

**Grounds in:** CSS custom properties (`--*`) and inheritance — a property set
on an ancestor cascades to descendants and can be overridden at any level.

Never hardcode a colour, space, radius, or type size in a component rule.
Define a token scale once, reference it everywhere; that's what lets a theme
re-skin from settings and stay internally consistent.

```css
@layer tokens {
  :root {
    /* Spacing — one scale, named by size not pixel count */
    --space-3xs: 0.25rem; --space-2xs: 0.5rem; --space-xs: 0.75rem;
    --space-s: 1rem;      --space-m: 1.5rem;   --space-l: 2rem;
    --space-xl: 3rem;     --space-2xl: 4.5rem;

    /* Type — relative units so user zoom/OS text-size is respected */
    --text-s: 0.875rem; --text-m: 1rem; --text-l: 1.25rem;
    --text-xl: 1.75rem; --text-2xl: 2.5rem;

    /* Role tokens map raw values to meanings — components use these */
    --color-bg: #ffffff;
    --color-fg: #16130f;
    --color-accent: #1f5eff;
    --radius-m: 0.5rem;
    --border-hairline: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }
}
```

- **Use `rem` for space and type**, not `px` — pixels ignore the user's font
  size preference; rem scales with it.
- **Name tokens by role or size, not by literal** — `--space-m`, not
  `--space-16`; `--color-accent`, not `--color-blue`. The whole point is that
  the meaning stays put when the value changes.
- **Two token tiers:** raw scale tokens (`--space-*`, palette) and *role*
  tokens (`--color-bg`, `--color-fg`) that reference them. Components consume
  role tokens only, so a re-skin touches the role layer, not 200 components.
- **Scope component-local vars to the block and namespace them**, so two
  components never collide on a bare `--padding`:

  ```css
  .facet-panel {
    --facet-panel-gap: var(--space-s);   /* namespaced, not just --gap */
    display: grid;
    gap: var(--facet-panel-gap);
  }
  ```

- **Merchant/section values enter as inline custom properties** (§1), landing
  on the component's own namespaced var with a token fallback:
  `style="--facet-panel-gap: {{ section.settings.gap }}px"`.

## 5. Defensive, responsive, modern CSS

**Grounds in:** CSS containment/container queries, logical properties,
intrinsic sizing functions (`min()`/`max()`/`clamp()`), `aspect-ratio`.

Theme CSS runs against content the author never sees — a merchant's 60-word
product title, a missing image, an RTL locale, a 320px phone. Write it to
survive that.

**Container queries, not (only) viewport queries.** A section can sit full-
width or in a narrow sidebar depending on where the merchant drops it, so
respond to the *component's* width, not the screen's:

```css
.product-grid { container-type: inline-size; }

@container (min-width: 30rem) {
  .media-card { grid-template-columns: 8rem 1fr; }
}
```

**Logical properties, so RTL locales work for free.** Shopify themes ship to
RTL markets; physical properties (`left`, `padding-left`, `top/right/bottom/
left`) don't flip, logical ones do:

```css
padding-inline: var(--space-m);   /* not padding-left/right */
margin-inline-start: auto;        /* not margin-left */
border-inline-end: var(--border-hairline);
inset-block-start: 0;             /* not top */
text-align: start;                /* not left */
```

**Defensive defaults** — the small set that prevents most "it broke on real
content" bugs:

```css
.media-card__title {
  overflow-wrap: break-word;   /* long unbroken words don't blow out width */
  min-inline-size: 0;          /* lets a flex/grid child actually shrink */
}
.media-card__image {
  max-inline-size: 100%;
  aspect-ratio: 3 / 4;         /* reserves space -> no shift when it loads (§8) */
  background: var(--color-bg-subtle);  /* graceful when the image is missing */
  object-fit: cover;
}
```

**Fluid sizing without breakpoints** where it reads well:

```css
.section { padding-block: clamp(var(--space-l), 6vw, var(--space-2xl)); }
.prose   { inline-size: min(100%, 68ch); }   /* readable measure, never overflows */
```

Prefer `dvh` to `vh` for full-height section heroes so mobile browser chrome
doesn't clip them. For animation and reduced motion, see §8 and defer to
`liquid-a11y` for the motion-preference contract.

## 6. Semantic HTML first

**Grounds in:** HTML Living Standard — native elements ship behaviour,
keyboard support, and assistive-tech semantics that a scripted `<div>` never
gets for free.

Reach for the platform element before scripting one. Each swap below removes
behaviour you'd otherwise have to hand-build and keep in sync with assistive
tech, rather than getting it for free from the browser:

- **A clickable action** is a `<button type="button">` — never a `<div>` or
  `<span>` wired up with `onclick`, which is missing keyboard focus, the
  Enter/Space activation, and the implicit `role="button"` a screen reader
  needs.
- **Navigation to another URL** stays an `<a href>`. Swapping in a `<button>`
  that calls `location.assign(...)` throws away middle-click, "open in new
  tab", and the browser's own history/back-button handling.
- **A set of related form controls** (a radio group, a delivery-method
  choice) belongs inside `<fieldset><legend>`, not a `<div>` with a heading
  floating near it — only the `<fieldset>` gives assistive tech a
  programmatic group with an announced label.
- **A show/hide panel** — an FAQ answer, a "read more" — is
  `<details><summary>`, not a `<div>` toggled by a click handler that tracks
  its own open/closed state in JS.
- **A modal dialog** is `<dialog>` opened with `.showModal()`, not an overlay
  `<div>` with a hand-rolled focus trap, Escape-key listener, and
  scroll-lock.
- **A lightweight, non-modal popup** — a menu, a tooltip-style panel — reaches
  for the `popover` attribute before a positioned `<div>` you show, hide, and
  dismiss-on-outside-click yourself in JS.
- **A page's search entry point** sits inside the `<search>` landmark, not a
  bare, unlabelled `<form>` off in the header markup — the landmark gives
  assistive tech a place to jump straight to instead of scanning generic
  containers for it.

Progressive enhancement follows from this: build the markup so it *works with
zero JS*, then layer behaviour on:

```liquid
{%- comment -%} Functional without JS: native disclosure {%- endcomment -%}
<details class="accordion">
  <summary class="accordion__summary">{{ block.settings.heading }}</summary>
  <div class="accordion__panel">{{ block.settings.content }}</div>
</details>
```

JS then *enhances* (animate the open/close, sync analytics) but the content is
readable and toggleable before a byte of script runs — which also means it
survives a script error or a slow network.

Images are the highest-leverage HTML detail in a theme, because they drive
layout stability and LCP (§8):

```liquid
{{
  image
  | image_url: width: 800
  | image_tag:
      loading: 'lazy',
      sizes: '(min-width: 750px) 50vw, 100vw',
      widths: '400, 600, 800, 1200',
      alt: image.alt | escape,
      width: image.width,
      height: image.height
}}
```

Always emit `width`/`height` (so the box is reserved before load), `loading:
'lazy'` for anything below the fold — but **not** for the LCP hero, which
should load eagerly (§8) — and a real `sizes`/`widths` set so the browser
picks an appropriately sized source.

## 7. Interactive sections as custom elements

**Grounds in:** Web Components / custom elements (`customElements.define`,
`connectedCallback`/`disconnectedCallback`) — a standards-based way to attach
behaviour to a chunk of markup, with a real lifecycle, no framework.

For anything a section actually *does* — add to cart, filter, slide, quantity
step — a custom element beats a loose `querySelectorAll` script: the element
owns exactly its subtree, wires up when connected, and tears down when
removed, which matters because the Shopify theme editor adds and removes
sections live.

```javascript
class QuantityStepper extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('[data-qty-input]');
    this.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
  }

  #onClick = (event) => {
    const step = event.target.closest('[data-qty-step]');
    if (!step) return;                       // early return, not nested ifs
    const delta = Number(step.dataset.qtyStep);
    const next = Math.max(1, this.value + delta);
    this.value = next;
    this.dispatchEvent(new CustomEvent('quantity:change', {
      detail: { value: next },
      bubbles: true,                         // let the section above react
    }));
  };

  get value() { return Number(this.input.value) || 1; }
  set value(v) { this.input.value = String(v); }
}

if (!customElements.get('quantity-stepper')) {
  customElements.define('quantity-stepper', QuantityStepper);   // guard re-define
}
```

```liquid
<quantity-stepper class="qty">
  <button type="button" class="qty__btn" data-qty-step="-1" aria-label="{{ 'products.decrease' | t }}">−</button>
  <input class="qty__input" type="number" inputmode="numeric" min="1" value="1" data-qty-input>
  <button type="button" class="qty__btn" data-qty-step="1" aria-label="{{ 'products.increase' | t }}">+</button>
</quantity-stepper>
```

Conventions that keep custom elements robust in a theme:

- **Guard the `define`** with `if (!customElements.get(name))` — a section can
  render twice and its `assets/*.js` shouldn't throw on the second `define`.
- **Bind in `connectedCallback`, unbind in `disconnectedCallback`** so the
  editor removing a section leaves no dangling listeners; use class fields
  (`#onClick = () => {}`) so `this` is bound and the reference is stable to
  remove.
- **Talk upward with `CustomEvent({ bubbles: true })`, downward by calling a
  child element's method** — don't reach across the DOM with global selectors;
  it couples sections that shouldn't know about each other.
- **Prefer event delegation** (one listener on the host, `closest()` to the
  target) over a listener per button — it survives markup the element
  re-renders.
- **Native APIs only** — `fetch`, `URL`/`URLSearchParams`, `FormData`,
  `AbortController`; no jQuery, no utility libs. The full fetch/abort and
  Section Rendering API wiring is in `references/javascript-patterns.md`.

Small JS style rules that keep theme scripts legible: `const` by default,
`for…of` over `Array.prototype.forEach`, `async`/`await` over `.then()`
chains, `#private` methods over `_underscore` convention, early returns over
nested `if`/`else`, and `new URL()` + `URLSearchParams` over string-built URLs.

## 8. Performance: protect CLS and LCP

**Grounds in:** Shopify theme performance guidance and Core Web Vitals
(Cumulative Layout Shift, Largest Contentful Paint) — themes are graded on
these and merchants feel them as conversion.

Two metrics are almost entirely in the theme front-end's hands:

**Cumulative Layout Shift (things jumping as the page loads).** Every box
whose size isn't known up front is a shift waiting to happen:

- Emit `width`/`height` on every `<img>` and set `aspect-ratio` on its CSS box
  (§5/§6) so the space is reserved before the pixels arrive.
- Reserve space for anything injected late — a sticky bar, a loaded review
  widget, an embedded video — with `min-block-size` or `aspect-ratio` rather
  than letting it push content down when it appears.
- Load web fonts with `font-display: swap` and a metrics-matched fallback so
  the text swap doesn't reflow the layout.

**Largest Contentful Paint (how fast the main hero/image shows).**

- The LCP image (hero, first product image) loads **eagerly** with
  `fetchpriority="high"`, and is **not** `loading="lazy"` — lazy-loading the
  LCP element is a common, self-inflicted LCP regression:

  ```liquid
  {{ hero_image | image_url: width: 1600 | image_tag:
       loading: 'eager', fetchpriority: 'high',
       sizes: '100vw', widths: '800, 1200, 1600, 2000',
       width: hero_image.width, height: hero_image.height }}
  ```

- Everything below the fold is `loading="lazy"` so it doesn't compete with the
  hero for bandwidth.
- Keep render-blocking CSS lean — the `{% stylesheet %}` collation already
  helps by shipping one file; don't undo it by linking many extra
  stylesheets.

**Animate only compositor-friendly properties.** `transform` and `opacity`
animate without triggering layout/paint; animating `width`, `top`, `margin`,
or `box-shadow` thrashes the main thread:

```css
.drawer { transition: transform 200ms ease; }
.drawer[hidden] { transform: translateX(100%); }

/* will-change only while the drawer is actually mid-transition: toggle this
   class on just before flipping [hidden], remove it on `transitionend` so
   the browser isn't asked to keep a compositor layer around at rest. */
.drawer.is-animating { will-change: transform; }
```

Use `will-change` sparingly and only for the duration it's needed, and use
`contain: content` on independent, repeated components (cards in a grid) so a
change inside one doesn't invalidate layout for the whole page.

## 9. File and section organization

**Grounds in:** Shopify theme architecture (`layout/`, `sections/`,
`snippets/`, `blocks/`, `assets/`, `templates/`, `config/`, `locales/`).

A theme's maintainability is mostly a filing discipline:

- **One section = one concern.** A section owns its own `{% schema %}`, its
  `{% stylesheet %}`, and (if interactive) its custom element. Keep a
  section's CSS *with the section* unless it's genuinely shared.
- **Reuse via `snippets/`, not copy-paste.** A card, a price, a rating that
  appears in several sections is a `{% render 'price', ... %}` snippet with an
  explicit input contract — `{% render %}` (isolated scope) over the legacy
  `{% include %}` (leaky scope).
- **Global truly-shared CSS lives in `assets/*.css`** and is linked once in
  `theme.liquid`: the reset, the `@layer` order declaration (§3), the token
  `:root` (§4), and cross-section utilities. Everything else is section-local.
- **Never hand-edit `templates/*.json`, `sections/*.json` (section groups),
  or `config/settings_data.json` as text** — they're structured JSON. Edit
  them with `jq` (validates structure, handles escaping) rather than string
  replacement:

  ```bash
  # add a section to a template
  jq '.sections.promo = {"type":"promo-banner","settings":{}} | .order += ["promo"]' \
     templates/index.json > tmp && mv tmp templates/index.json
  # change a setting
  jq '.current.sections.header.settings.sticky = true' \
     config/settings_data.json > tmp && mv tmp config/settings_data.json
  ```

- **User-facing strings go through `locales/` and `| t`**, never hardcoded —
  it's the same discipline that makes translation and RTL (§5) possible.

---

## Verification checklist

Before marking a section done:

- [ ] Every dynamic/merchant value enters via an inline custom property; no
      Liquid inside `{% stylesheet %}` (§1).
- [ ] The section renders correctly when placed **twice** on one page — no
      `id`-based styles, no `:root` state written from the section, custom
      element `define` guarded (§1, §3, §7).
- [ ] Class names follow BEM; no chained elements, no lone modifiers, no
      camelCase (§2).
- [ ] No selector exceeds the `(0,4,0)` budget; no `id` selectors; no
      `!important` except a commented third-party override (§3).
- [ ] No hardcoded colours/space/type — all reference tokens; component-local
      vars are namespaced (§4).
- [ ] Logical properties throughout; layout survives a long title, a missing
      image, and a narrow container (container queries, not just viewport)
      (§5).
- [ ] Native element used where one exists; markup works with JS disabled,
      script only enhances (§6).
- [ ] Interactive behaviour is a custom element that binds in
      `connectedCallback` and cleans up in `disconnectedCallback`; talks up
      via bubbling `CustomEvent` (§7).
- [ ] Every `<img>` has `width`/`height` + `aspect-ratio`; the LCP image is
      eager + `fetchpriority="high"`, everything else lazy; animations touch
      only `transform`/`opacity` (§8).
- [ ] Section CSS/JS lives with the section; shared bits are snippets/assets;
      JSON edited with `jq`; strings via `locales` + `| t` (§9).
- [ ] Accessibility pass done separately against `liquid-a11y` (focus rings,
      ARIA, contrast, reduced motion) — this checklist does not cover it.

## Further reading in this skill

- `references/css-architecture.md` — the full `@layer` scaffold, the two-tier
  token system worked out, grid/container-query recipes, and a defensive-CSS
  catalogue.
- `references/javascript-patterns.md` — custom-element lifecycle in depth,
  fetch + `AbortController`, the cart/add and Section Rendering API wiring,
  and component-to-component communication patterns.
