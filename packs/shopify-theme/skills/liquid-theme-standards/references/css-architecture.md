# CSS architecture reference

Extended patterns for the CSS standards in `SKILL.md`. Grounded in the W3C
CSS specifications (cascade & layers, custom properties, containment/container
queries) and MDN. Adapt class names and token values to the theme you're in.

## The cascade-layer scaffold

Declare the layer order **once**, early, in the theme's global stylesheet
(`assets/theme.css` linked from `layout/theme.liquid`). The order of names in
this single statement *is* the override priority — later layers win over
earlier ones regardless of selector specificity.

```css
/* assets/theme.css — first CSS the theme loads */
@layer reset, tokens, base, layout, components, utilities;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  img, picture, svg, video { display: block; max-inline-size: 100%; }
  button, input, select, textarea { font: inherit; color: inherit; }
}

@layer base {
  body {
    font-family: var(--font-body);
    font-size: var(--text-m);
    line-height: 1.5;
    color: var(--color-fg);
    background: var(--color-bg);
  }
}
```

Section-local `{% stylesheet %}` blocks should place their rules into the
`components` layer so they sit below `utilities` and above `base`/`layout`:

```liquid
{% stylesheet %}
  @layer components {
    .media-card { /* … */ }
  }
{% endstylesheet %}
```

Why this ordering matters:

- A single-class utility (`.u-text-center`) in the `utilities` layer beats a
  single-class component rule in `components` **by layer alone** — no
  `!important`, no specificity inflation.
- Anything written *outside* every layer beats everything *inside* a layer, so
  reserve unlayered rules for genuine emergency overrides (e.g. neutralizing a
  third-party app's injected style) and keep all theme-authored CSS layered.

## The two-tier token system

Split tokens into a **scale tier** (raw, meaningless values) and a **role
tier** (named by what they're *for*, referencing the scale). Components consume
role tokens only — so a re-skin edits the role tier, never the components.

```css
@layer tokens {
  :root {
    /* --- Tier 1: scale (raw) --- */
    --gray-0: #ffffff;  --gray-90: #16130f;
    --gray-5: #f6f4f1;  --gray-20: #d9d4cd;
    --brand-50: #1f5eff;

    --step-3xs: 0.25rem; --step-2xs: 0.5rem; --step-xs: 0.75rem;
    --step-s: 1rem; --step-m: 1.5rem; --step-l: 2rem; --step-xl: 3rem;

    /* --- Tier 2: role (semantic, references tier 1) --- */
    --color-bg: var(--gray-0);
    --color-bg-subtle: var(--gray-5);
    --color-fg: var(--gray-90);
    --color-border: var(--gray-20);
    --color-accent: var(--brand-50);

    --space-s: var(--step-s);
    --space-m: var(--step-m);
    --space-l: var(--step-l);

    --radius-m: 0.5rem;
  }
}
```

Dark or alternate palettes flip the *role* tier only:

```css
@layer tokens {
  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg: var(--gray-90);
      --color-fg: var(--gray-0);
      --color-border: color-mix(in srgb, var(--gray-0) 20%, transparent);
    }
  }
}
```

Component-local variables are namespaced to their block and default to a role
token, so a section setting can override just that one component:

```css
.facet-panel {
  --facet-panel-gap: var(--space-s);
  --facet-panel-pad: var(--space-m);
  display: grid;
  gap: var(--facet-panel-gap);
  padding: var(--facet-panel-pad);
}
```

```liquid
<div class="facet-panel" style="--facet-panel-gap: {{ section.settings.gap }}px;">
```

## Layout recipes

**Auto-fitting product grid** — no media queries, wraps by available width:

```css
.product-grid {
  display: grid;
  gap: var(--space-m);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
}
```

**Container-query card** — reflows on the *component's* width, so it adapts
whether the merchant drops the section full-width or in a sidebar:

```css
.product-grid { container-type: inline-size; }

.media-card { display: grid; gap: var(--space-xs); }

@container (min-width: 26rem) {
  .media-card {
    grid-template-columns: 9rem 1fr;
    align-items: start;
  }
}
```

**Sidebar-and-content that collapses intrinsically** (the "holy grail" without
breakpoints), useful for collection + filters:

```css
.with-sidebar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-l);
}
.with-sidebar__aside { flex: 1 1 16rem; }         /* the filter rail */
.with-sidebar__main  { flex: 999 1 60%; }         /* grows to fill; wraps under when tight */
```

## Defensive-CSS catalogue

Small rules that prevent the recurring "broke on real content" bugs:

```css
/* Text can't blow out its container on a long unbroken string (SKUs, URLs) */
.cell { overflow-wrap: break-word; }

/* Flex/grid children can actually shrink below their content size */
.truncate { min-inline-size: 0; }

/* Reserve image space up front -> zero layout shift on load */
.thumb {
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--color-bg-subtle);   /* graceful if the image 404s */
}

/* Constrain any embedded/injected media to its box */
.embed { max-inline-size: 100%; }

/* Give a scroll container a sane overscroll + keep the page from rubber-banding */
.scroller { overflow: auto; overscroll-behavior: contain; }

/* Respect notches/safe areas on full-bleed bars */
.sticky-bar { padding-block-end: max(var(--space-s), env(safe-area-inset-bottom)); }

/* Isolate a stacking context so a component's z-index can't escape it */
.overlay-host { isolation: isolate; }
```

## Nesting, sparingly

Native CSS nesting is fine for co-locating state and media queries on one
block, but keep it shallow — nesting deep re-creates the specificity and
coupling problems flat BEM avoids.

```css
.button {
  background: var(--color-accent);
  color: var(--color-bg);

  &:hover { background: color-mix(in srgb, var(--color-accent) 85%, black); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  &[disabled] { opacity: 0.5; pointer-events: none; }

  @container (min-width: 30rem) { padding-inline: var(--space-l); }
}
```

Do **not** nest one block's rules inside another block's selector to "scope"
them — that couples the two and inflates specificity. A parent-context tweak is
the one allowed case, kept to a single level:

```css
.card--featured .card__title { font-size: var(--text-xl); }   /* fine: one level */
```

## Property order within a rule (convention)

A consistent order makes rules skimmable in review. Group top-to-bottom:

1. **Layout** — `display`, `grid-*`, `flex-*`, `position`, `inset-*`
2. **Box** — `inline-size`/`block-size`, `margin-*`, `padding-*`, `border`
3. **Typography** — `font-*`, `line-height`, `text-*`, `color`
4. **Visual** — `background`, `border-radius`, `box-shadow`, `opacity`
5. **Motion** — `transition`, `animation`, `will-change`
