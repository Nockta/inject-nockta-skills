---
name: liquid-a11y
description: "Build and audit Shopify Liquid theme accessibility against WCAG 2.2 and the ARIA Authoring Practices Guide. Use this whenever writing or reviewing .liquid sections, snippets, or blocks that render interactive storefront UI — product cards, carousels/sliders, cart drawers, add-to-cart and newsletter forms, collection filters/facets, quick-view or cart modals, predictive/instant search, mega menus, skip links, or anything touching focus, keyboard control, color contrast, or motion. Trigger this skill even when the user just says 'make this section accessible', 'add ARIA to my carousel', 'fix keyboard trap in my modal', 'a11y review my theme', or asks about screen reader support, focus management, or reduced motion in a Shopify theme — not only when they name WCAG or ARIA explicitly."
---

# Shopify Liquid Theme Accessibility (WCAG 2.2 / ARIA APG)

## Why this exists

Storefronts are commerce, not content — a shopper who can't tab through a size
picker, can't hear that "Added to cart" happened, or can't escape a discount
popup doesn't just have a bad experience, they can't buy. Liquid themes also
render the *same* handful of interaction patterns (card grid, slider, drawer,
filter panel, form) on every store, so getting each pattern right once pays
off across the whole theme.

This skill is a working reference for building those patterns correctly the
first time, and for auditing existing `.liquid` files against concrete,
citable standards rather than vibes.

## How to use this skill

1. **Name the component** you're building or fixing (product card, carousel,
   cart drawer, filter form, modal, search combobox, nav menu, etc.).
2. **Jump to its section below.** Each one states the governing WCAG 2.2
   Success Criterion (SC) and/or ARIA APG pattern, explains *why* it applies
   to that component specifically, and gives a Liquid/HTML/JS example you can
   adapt — not copy-paste blindly, since class names and IDs should match the
   theme you're in.
3. **Check semantics before ARIA.** For every pattern here, ask first whether
   a native HTML element already does the job (`<button>`, `<dialog>`,
   `<details>`, a real `<label for>`) before reaching for `role`/`aria-*`.
   Native elements ship keyboard behavior and screen-reader semantics for
   free; ARIA only *describes* behavior you still have to implement in JS.
4. **Run the verification checklist** at the end before calling a component
   done — it's the fast version of the full audit.
5. For SC wording and level (A/AA/AAA), see `references/wcag-checklist.md`.
   For the full ARIA APG interaction/keyboard tables, see
   `references/aria-patterns.md`. For longer worked examples (swatches,
   size charts, media galleries, breadcrumbs), see
   `references/liquid-recipes.md`.

## Standards this skill is grounded in

- **WCAG 2.2** (W3C Recommendation) — https://www.w3.org/TR/WCAG22/
- **ARIA Authoring Practices Guide (APG)** — https://www.w3.org/WAI/ARIA/apg/
- **Shopify accessibility guidance for themes** —
  https://shopify.dev/docs/storefronts/themes/best-practices/accessibility

Every claim below cites one of these. If you're patching a component that
isn't covered here, find its APG pattern first — most storefront widgets
(accordion, tabs, menu button, tooltip) already have one — then apply the
same "native-first, cite-the-SC" method.

---

## 1. Document structure and landmarks

**Governs:** WCAG 1.3.1 Info and Relationships (A), 2.4.1 Bypass Blocks (A),
2.4.6 Headings and Labels (AA), 2.4.10 Section Headings (AAA).

A screen reader user's first move on an unfamiliar page is usually to pull up
a landmark or heading list and jump straight to what they want. If your
`layout/theme.liquid` doesn't expose real landmarks, that navigation mode
doesn't exist for them — they're stuck reading top to bottom like the page
has no structure at all.

```liquid
<body>
  <a class="skip-to-content" href="#MainContent">
    {{ 'accessibility.skip_to_main' | t }}
  </a>

  <header>
    <nav aria-label="{{ 'accessibility.primary_nav' | t }}">
      {% render 'header-menu' %}
    </nav>
  </header>

  <main id="MainContent" tabindex="-1">
    {{ content_for_layout }}
  </main>

  <footer>
    <nav aria-label="{{ 'accessibility.footer_nav' | t }}">
      {% render 'footer-menu' %}
    </nav>
  </footer>
</body>
```

Rules of thumb:

- `<header>`, `<main>`, `<footer>` are landmarks *by virtue of being direct
  children of `<body>`* — nesting them inside another sectioning element
  strips the implicit role, so keep them top-level.
- Two or more `<nav>` elements on one page are indistinguishable to a screen
  reader unless each carries a distinct `aria-label`.
- `tabindex="-1"` on `#MainContent` lets the skip link *and* client-side page
  transitions move focus there programmatically (`.focus()`), even though
  `<main>` isn't natively focusable.
- Headings form an outline, not a font-size tool: one `<h1>` per page (the
  page or product title), and don't skip levels to get a smaller-looking
  heading — style it with CSS instead.

## 2. Skip link

**Governs:** WCAG 2.4.1 Bypass Blocks (A).

A repeated block of content — usually the header/nav — sits before the main
content on every single page. Sighted mouse users skip it by looking at the
page; keyboard users would otherwise re-tab through the whole nav on every
page load. A skip link is the mechanism that gives them the same shortcut.

```css
.skip-to-content {
  position: absolute;
  inset-block-start: -100vh;
  inset-inline-start: 0;
  z-index: 100;
}

.skip-to-content:focus {
  position: fixed;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--color-background, #fff);
  color: var(--color-text, #111);
  outline: 2px solid currentColor;
}
```

Move it off-screen with position, not `display: none` or `visibility:
hidden` — those remove it from the accessibility tree entirely, so it would
never receive focus in the first place. It must be the very first focusable
element in `<body>`.

## 3. Keyboard operability and visible focus

**Governs:** WCAG 2.1.1 Keyboard (A), 2.1.2 No Keyboard Trap (A), 2.4.7
Focus Visible (AA), 2.4.11 Focus Not Obscured Minimum (AA), 2.5.8 Target Size
Minimum (AA).

Every interaction a mouse user gets — opening a swatch popover, dismissing a
banner, expanding a filter group — has to be reachable and operable with
Tab/Shift+Tab, Enter/Space, and Escape alone, with no dead ends. Two failure
modes show up constantly in themes: `outline: none` with nothing replacing
it, and click handlers bound only to `mousedown`/`click` with no keyboard
equivalent (which native `<button>`/`<a>` give you automatically, but a
`<div onclick>` never will).

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-focus, #1a73e8);
  outline-offset: 2px;
}

@media (forced-colors: active) {
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: 2px solid CanvasText;
  }
}
```

- Use `:focus-visible`, not `:focus` — it suppresses the ring for mouse
  clicks while still showing it for keyboard navigation, matching how most
  browsers already treat native controls.
- Never set a positive `tabindex` (`tabindex="2"`) — it overrides DOM order
  and produces a tab sequence nobody can predict. `tabindex="0"` (join tab
  order) and `tabindex="-1"` (programmatic focus only) are the only values
  you should write by hand.
- A sticky header or announcement bar must not sit on top of the element
  that currently has focus (2.4.11) — check `scroll-margin-top` on focusable
  targets if you have a fixed header.
- Interactive controls need a minimum 24×24px hit area (2.5.8) — icon-only
  buttons (wishlist heart, close ×) commonly fail this if padding is
  trimmed for a dense layout.

## 4. Focus management for dynamic UI

**Governs:** WCAG 2.4.3 Focus Order (A), 3.2.2 On Input (A), 4.1.3 Status
Messages (AA).

Liquid themes swap content in place constantly — an AJAX cart update, a
facet filter re-rendering the grid, an item removed from a drawer. None of
that is a full page load, so nothing tells assistive tech it happened unless
you move focus or announce it yourself.

```javascript
class CartDrawer extends HTMLElement {
  #trigger = null;

  open(trigger) {
    this.#trigger = trigger;
    this.hidden = false;
    this.querySelector('[data-drawer-close]')?.focus();
    document.addEventListener('keydown', this.#onKeydown);
  }

  close() {
    this.hidden = true;
    document.removeEventListener('keydown', this.#onKeydown);
    this.#trigger?.focus(); // return focus to whatever opened this
  }

  #onKeydown = (event) => {
    if (event.key === 'Escape') this.close();
  };
}
customElements.define('cart-drawer', CartDrawer);
```

Three focus-management rules that cover most theme interactions:

| Event | Where focus goes |
|---|---|
| Overlay/drawer/modal opens | First focusable element inside it |
| Overlay/drawer/modal closes | Back to the element that opened it |
| Item removed from a list (cart line, wishlist row) | The next remaining item, or a heading/empty-state message if the list is now empty — never left dangling on a detached node |
| Filtered results re-render | Not automatically stolen — announce the count via a live region instead (see §7), since forcibly moving focus on every keystroke is disorienting |

For the "announce, don't steal focus" cases, use a live region:

```liquid
<div id="CartStatus" role="status" aria-live="polite" class="visually-hidden">
  {% if cart_updated %}
    {{ 'cart.item_added' | t: title: added_item.title }}
  {% endif %}
</div>
```

`role="status"` implies `aria-live="polite"` on its own; pairing them here is
just belt-and-suspenders for older screen reader/browser combinations. Use
`role="alert"` (implicit `aria-live="assertive"`) only for things that need
to interrupt — validation errors, not routine confirmations.

## 5. Product cards

**Governs:** WCAG 1.1.1 Non-text Content (A), 2.4.4 Link Purpose in Context
(A), 4.1.2 Name, Role, Value (A).

A card packs an image, a title, a price, and often a quick-add control into
one repeating unit. The accessibility risk is duplication: if the image, the
title, and a "Quick add" button are each separately focusable and each
announce the product name, a screen reader user tabs through the same
product three or four times per card.

```liquid
<article class="product-card">
  <a href="{{ product.url }}" class="product-card__media-link">
    <img
      src="{{ product.featured_image | image_url: width: 480 }}"
      width="480"
      height="{{ 480 | divided_by: product.featured_image.aspect_ratio }}"
      loading="lazy"
      alt=""
    >
  </a>

  <h3 class="product-card__title">
    <a href="{{ product.url }}">{{ product.title }}</a>
  </h3>

  <p class="product-card__price">
    <span class="visually-hidden">{{ 'products.price' | t }}: </span>
    {{ product.price | money }}
  </p>

  {% if product.available %}
    <button
      type="button"
      class="product-card__quick-add"
      data-product-id="{{ product.id }}"
      aria-label="{{ 'products.quick_add_named' | t: product: product.title }}"
    >
      {{ 'products.quick_add' | t }}
    </button>
  {% endif %}
</article>
```

- The image link's `alt=""` is deliberate: the adjacent title link already
  names the product, so the image is redundant decoration *in this
  context* — giving it alt text too would mean the product name gets
  announced twice back to back. (If a card ever omits the visible title,
  the image needs real alt text instead.)
- The quick-add button's `aria-label` includes the product name because,
  out of context (e.g. a screen reader's "list all buttons" view), a page
  full of buttons that just say "Quick add" is useless — each one needs to
  be disambiguated on its own.
- Keep exactly one primary link target per card for the "product name" —
  don't wrap the whole card in an anchor *and* nest another interactive
  element inside it (invalid HTML, and unpredictable in some screen
  readers).

## 6. Carousels and sliders

**Governs:** ARIA APG Carousel pattern —
https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ — plus WCAG 2.2.2 Pause,
Stop, Hide (A) and 1.4.2 Audio Control (A) if slides autoplay.

Carousels fail accessibility more often than any other storefront widget,
because the visual metaphor (things sliding past) has no obvious non-visual
analog. The APG's answer is to describe it as a labeled region containing a
sequence of numbered "slides," with explicit controls a screen reader user
can operate instead of having to watch motion to understand state.

```liquid
<section
  class="slideshow"
  role="region"
  aria-roledescription="carousel"
  aria-label="{{ section.settings.heading | escape }}"
>
  <div class="slideshow__track" id="Slides-{{ section.id }}">
    {% for block in section.blocks %}
      <div
        class="slideshow__slide"
        role="group"
        aria-roledescription="slide"
        aria-label="{{ forloop.index }} {{ 'accessibility.of' | t }} {{ forloop.length }}"
        {% unless forloop.first %}inert{% endunless %}
      >
        {{ block.settings.image | image_tag: loading: 'lazy' }}
      </div>
    {% endfor %}
  </div>

  <div class="slideshow__controls">
    <button type="button" data-slide-prev aria-label="{{ 'accessibility.previous_slide' | t }}">‹</button>
    <button type="button" data-slide-next aria-label="{{ 'accessibility.next_slide' | t }}">›</button>
    {% if section.settings.autoplay %}
      <button type="button" data-slide-toggle aria-pressed="{% if section.settings.autoplay %}true{% else %}false{% endif %}">
        <span class="visually-hidden">{{ 'accessibility.pause_slideshow' | t }}</span>
      </button>
    {% endif %}
  </div>
</section>
```

- `inert` on non-current slides (rather than `aria-hidden`) is deliberate:
  `inert` removes the whole subtree from both the accessibility tree *and*
  tab order in one attribute, so an off-screen slide's links can't silently
  eat a Tab press. `aria-hidden` alone doesn't touch tabindex.
- If it autoplays, it must autoplay no faster than roughly 5s per slide,
  must stop permanently once the pause control is used, and must pause on
  keyboard focus entering the carousel, not just on mouse hover (2.2.2
  applies regardless of input device).
- Prefer `prefers-reduced-motion` short-circuiting autoplay to off entirely
  (see §11) over merely slowing the animation down.
- Arrow-key navigation between slides while a slide has focus is a nice-to-
  have per the APG, but the explicit prev/next buttons are the part that's
  load-bearing for keyboard and screen reader users — don't ship arrow-key
  support *instead of* visible buttons.

## 7. Cart and forms

**Governs:** WCAG 1.3.1 Info and Relationships (A), 3.3.1 Error
Identification (A), 3.3.2 Labels or Instructions (A), 3.3.3 Error Suggestion
(AA), 3.3.7 Redundant Entry (A), 4.1.3 Status Messages (AA).

Add-to-cart, newsletter signup, and account forms are where accessibility
bugs turn directly into lost conversions: a shopper who can't tell *why*
their form didn't submit just leaves.

```liquid
<form method="post" action="{{ routes.cart_add_url }}" accept-charset="UTF-8">
  <div class="field">
    <label for="Quantity-{{ section.id }}">{{ 'products.quantity' | t }}</label>
    <input
      type="number"
      id="Quantity-{{ section.id }}"
      name="quantity"
      value="1"
      min="1"
      inputmode="numeric"
    >
  </div>

  <div class="field">
    <label for="Email-{{ section.id }}">{{ 'newsletter.email' | t }}</label>
    <input
      type="email"
      id="Email-{{ section.id }}"
      name="contact[email]"
      autocomplete="email"
      required
      aria-describedby="EmailHint-{{ section.id }} EmailError-{{ section.id }}"
      aria-invalid="{% if form.errors contains 'email' %}true{% else %}false{% endif %}"
    >
    <p id="EmailHint-{{ section.id }}" class="field__hint">
      {{ 'newsletter.email_hint' | t }}
    </p>
    {% if form.errors contains 'email' %}
      <p id="EmailError-{{ section.id }}" role="alert" class="field__error">
        {{ form.errors.translated_fields.email }}
        {{ form.errors.messages.email }}
      </p>
    {% endif %}
  </div>

  <button type="submit">{{ 'newsletter.submit' | t }}</button>
</form>
```

- Every input gets a real `<label for>` — placeholder text is not a label
  (it disappears once you type, and many screen readers don't reliably
  expose it as one at all).
- `aria-describedby` lists *both* the hint and the error `id` — a screen
  reader concatenates every referenced element's text when the field
  receives focus, so both stay associated without needing to be the same
  node.
- The error message states what's wrong *and* how to fix it (3.3.3), not
  just "Invalid" — "Invalid" tells a sighted user which red box to look at;
  it tells nobody using a screen reader anything actionable.
- `role="alert"` on the error is what makes it interrupt and get announced
  immediately on a failed submit even though the user's focus never left
  the field — without it, a screen reader has no reason to re-visit content
  that appeared elsewhere on the page.
- Group related checkboxes/radios (size, shipping method) in
  `<fieldset><legend>`, not a bare `<div>` with a styled label above it —
  the `<legend>` is what lets a screen reader announce "shipping method"
  once instead of leaving each radio button contextless.
- Don't ask for information the browser/theme already has and could
  autofill or infer (3.3.7) — e.g. re-asking for a shipping name that
  matches billing on a form the same session already collected it on.

## 8. Collection filters and facets

**Governs:** WCAG 4.1.3 Status Messages (AA), 2.4.3 Focus Order (A), 1.3.1
Info and Relationships (A).

Facet filtering is almost always implemented as a same-page AJAX swap of the
product grid. Sighted users see the count and grid change instantly; without
a live region, a screen reader user gets no signal that anything happened at
all after checking a filter checkbox.

```liquid
<form id="Facets-{{ section.id }}" data-facets>
  <fieldset>
    <legend>{{ 'filters.availability' | t }}</legend>
    <label>
      <input type="checkbox" name="filter.v.availability" value="1">
      {{ 'filters.in_stock' | t }}
    </label>
  </fieldset>

  <fieldset>
    <legend>{{ 'filters.size' | t }}</legend>
    {% for value in collection.filters[1].values %}
      <label>
        <input type="checkbox" name="filter.v.option.size" value="{{ value.value }}">
        {{ value.label }} ({{ value.count }})
      </label>
    {% endfor %}
  </fieldset>

  <p id="FacetsStatus-{{ section.id }}" role="status" aria-live="polite" class="visually-hidden">
    {{ 'filters.results_count' | t: count: collection.products_count }}
  </p>
</form>
```

- Update `#FacetsStatus` text via JS every time the AJAX response lands —
  the count itself, not a generic "updated" message, is what tells the
  shopper whether their filter combination is too narrow.
- If a facet group is collapsible, use a disclosure button
  (`aria-expanded` + `aria-controls`, see the disclosure pattern in
  `references/aria-patterns.md`) rather than hiding the `<fieldset>` with
  no way to know it's collapsed.
- Keep focus where the shopper is (on the checkbox/button they just
  activated) — don't yank focus to the top of the results grid on every
  filter change; that's disorienting for keyboard users mid-way through
  checking several boxes, and the live region already covers the
  announcement.

## 9. Modals and dialogs (quick view, cart popover, age gate)

**Governs:** ARIA APG Dialog (Modal) pattern —
https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — plus WCAG 2.1.2 No
Keyboard Trap (A) and 2.4.3 Focus Order (A).

The native `<dialog>` element, opened with `.showModal()`, already gives you
a real modal: it traps focus, blocks interaction with the rest of the page,
closes on Escape, and is exposed to assistive tech as `role="dialog"` with
`aria-modal="true"` automatically. Reach for it before building a custom
focus trap in JS.

```liquid
<dialog id="QuickView-{{ product.id }}" class="quick-view" aria-labelledby="QuickViewTitle-{{ product.id }}">
  <button type="button" data-dialog-close autofocus aria-label="{{ 'accessibility.close' | t }}">
    &times;
  </button>
  <h2 id="QuickViewTitle-{{ product.id }}">{{ product.title }}</h2>
  <div class="quick-view__body">
    {% render 'product-media', product: product %}
  </div>
</dialog>
```

```javascript
const dialog = document.getElementById(`QuickView-${productId}`);

openTrigger.addEventListener('click', () => {
  dialog.showModal();
});

dialog.addEventListener('close', () => {
  openTrigger.focus(); // native <dialog> handles Escape/backdrop click already
});
```

- `showModal()` (not `.show()` or toggling a `hidden` attribute) is what
  produces the real modal behavior — `.show()` opens it as a non-modal panel
  with none of the focus trapping.
- `autofocus` on the close button gives predictable initial focus without
  extra JS; put it on the first meaningful control instead if the dialog's
  main job isn't dismissing (e.g. focus a search input in a search overlay).
- If you can't use `<dialog>` (older browser support requirement, or a
  non-modal "stay on page" panel), you must reimplement everything it gives
  you for free: trap Tab/Shift+Tab inside the panel, close on Escape, block
  scroll and interaction on the page behind it, and restore focus to the
  trigger on close. See `references/aria-patterns.md` for the manual focus
  trap.
- Age gates and cookie banners are dialogs too — a full-screen overlay that
  isn't a real `<dialog>`/modal-role element with trapped focus is a common
  WCAG 2.1.2 violation, since sighted users perceive it as blocking but
  keyboard users can often tab straight through it into the page behind.

## 10. Predictive search / autocomplete

**Governs:** ARIA APG Combobox pattern (list autocomplete) —
https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ — plus WCAG 4.1.3 Status
Messages (AA).

A predictive search box is a combobox: a text input that owns a popup
listbox of suggestions. The APG pattern is specific about which element owns
which ARIA state, because it's easy to end up with a search box that *looks*
right visually but announces nothing useful.

```liquid
<div class="predictive-search">
  <label for="SearchInput" class="visually-hidden">{{ 'search.label' | t }}</label>
  <input
    type="text"
    id="SearchInput"
    role="combobox"
    aria-expanded="false"
    aria-controls="SearchResults"
    aria-autocomplete="list"
    autocomplete="off"
  >
  <ul id="SearchResults" role="listbox" aria-label="{{ 'search.suggestions' | t }}" hidden></ul>
  <p id="SearchStatus" role="status" aria-live="polite" class="visually-hidden"></p>
</div>
```

- `aria-expanded` on the *input*, not the listbox, reflects whether the
  suggestion list is currently showing.
- `aria-controls` points from the input to the listbox it owns.
- As the user types, update `aria-activedescendant` on the input (not
  actual DOM focus) to point at the `id` of the highlighted `role="option"`
  item — real focus must stay in the text input the whole time, or the user
  loses the ability to keep typing/editing their query.
- Push result counts into `#SearchStatus` ("12 results for 'boots'") so
  screen reader users get the same feedback sighted users get by glancing
  at the dropdown — this is the same status-message obligation as facets
  (§8) and cart updates (§4), just on a different widget.
- Arrow Up/Down move the highlighted option, Enter selects it, Escape
  closes the listbox and clears `aria-activedescendant`. Full key table in
  `references/aria-patterns.md`.

## 11. Color contrast

**Governs:** WCAG 1.4.3 Contrast (Minimum) (AA), 1.4.11 Non-text Contrast
(AA), 1.4.1 Use of Color (A).

| Content | Minimum ratio |
|---|---|
| Body text under ~18px (or under ~14px bold) | 4.5:1 |
| Large text (~18px+, or ~14px+ bold) | 3:1 |
| Icons, form field borders, focus rings, other meaningful graphics | 3:1 |
| Purely decorative elements | No requirement |

Theme settings that let merchants pick arbitrary text-on-background color
combinations are the most common source of contrast failures — a merchant
choosing a pastel accent color for a "Sale" badge has no idea they've just
dropped below 3:1. Where the theme editor allows free color choice for
text/background pairs, either compute and warn on low contrast in the
editor, or constrain the picker to a vetted palette.

Never encode meaning in color alone (1.4.1) — a sold-out badge that's
"just red text," a required-field asterisk with no accompanying `aria-
required`/`required`, or a size swatch where the only signal for
"selected" is a colored border, all fail this for anyone who can't
perceive that color difference. Pair color with text, an icon, or a
pattern every time.

## 12. Reduced motion

**Governs:** WCAG 2.3.3 Animation from Interactions (AAA, but treat as a
baseline for theme UI) and 2.2.2 Pause, Stop, Hide (A) for anything that
auto-plays.

Parallax scroll effects, auto-advancing carousels, and entrance animations
can trigger real physiological reactions (vestibular disorders) in some
users, not just mild annoyance — `prefers-reduced-motion` is the browser
telling you the user has opted out at the OS level, and themes should treat
it as an instruction, not a suggestion.

```css
/* Nockta's reduced motion strategy:
 * Elements with [data-animate] explicitly opt into animation.
 * When a user requests reduced motion, animations on those
 * opt-in elements pause immediately. Non-animated affordances
 * (focus rings, hover states, transitions on non-motion properties)
 * continue to ensure responsiveness stays intact.
 */
@media (prefers-reduced-motion: reduce) {
  [data-animate],
  [data-animate]::before,
  [data-animate]::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }

  html {
    scroll-behavior: auto !important;
  }
}
```

```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  carousel.dataset.autoplay = 'false'; // don't just speed up the CSS transition — stop it
}
```

- The CSS blanket rule handles decorative transitions/animations for free.
  Anything driven by JS timers (autoplay carousels, auto-dismissing
  toasts) needs the JS check too, since a `setInterval` doesn't respect
  media queries on its own.
- No content should flash more than three times per second, full stop —
  this isn't a reduced-motion-only concern, it's a seizure-risk one (WCAG
  2.3.1) that applies regardless of user preference.

---

## Verification checklist

Before marking a component done, walk it with a keyboard alone (unplug the
mouse, or just don't touch it) and confirm:

- [ ] Every interactive element is reachable via Tab, in an order that
      matches visual reading order.
- [ ] Focus is always visible, and never trapped in a spot with no way
      out via keyboard.
- [ ] Opening an overlay moves focus in; closing it returns focus to the
      trigger.
- [ ] Every `<input>` has a real `<label for>`; every error is associated
      via `aria-describedby` and announced (`role="alert"`).
- [ ] Dynamic content changes (cart, filters, search results) update a
      live region — check with a screen reader, since this is invisible
      in a purely visual review.
- [ ] Carousels/auto-playing content have a working pause control and
      respect `prefers-reduced-motion`.
- [ ] Text and meaningful UI elements meet the contrast ratios in §11,
      and nothing relies on color alone.
- [ ] Run axe DevTools or Lighthouse's accessibility audit as a floor,
      not a ceiling — automated tools catch roughly a third of WCAG
      failures; the keyboard/screen-reader walk above catches the rest.

## Further reading in this skill

- `references/wcag-checklist.md` — every WCAG 2.2 Success Criterion cited
  above, with full title, level, and a one-line "what breaks in a theme if
  you miss this."
- `references/aria-patterns.md` — full keyboard interaction tables for the
  ARIA APG patterns used here (carousel, dialog, combobox, disclosure), plus
  the manual focus-trap implementation for when `<dialog>` isn't an option.
- `references/liquid-recipes.md` — additional component recipes not covered
  above: color/size swatches, breadcrumbs, size-chart tables, product media
  galleries, and accordions.
