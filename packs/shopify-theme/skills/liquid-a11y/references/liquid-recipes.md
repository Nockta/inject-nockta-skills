# Additional Liquid Component Recipes

Patterns not already covered in `SKILL.md`, for the same WCAG 2.2 / ARIA APG
grounding. Cite: https://www.w3.org/TR/WCAG22/ and
https://www.w3.org/WAI/ARIA/apg/.

## Color and size swatches

Swatches are a single-select group, which is what `role="radiogroup"` /
`role="radio"` communicates — a plain row of `<button>`s with a CSS
"selected" class conveys the grouping and current selection visually only.

```liquid
<div role="radiogroup" aria-label="{{ 'products.color' | t }}">
  {% for value in product.options_by_name['Color'].values %}
    <button
      type="button"
      role="radio"
      aria-checked="{% if value == current_variant.option1 %}true{% else %}false{% endif %}"
      class="swatch"
      style="--swatch-color: {{ value | handleize }};"
    >
      <span class="visually-hidden">{{ value }}</span>
    </button>
  {% endfor %}
</div>
```

Arrow keys should move `aria-checked` between swatches in the group (roving
tabindex — see the tab-list pattern in `references/aria-patterns.md`, the
same mechanism applies to any single-select button group). Never rely on the
swatch's background color alone to convey which one is selected — pair it
with a visible border/check treatment too, for 1.4.1 Use of Color.

## Breadcrumbs

```liquid
<nav aria-label="{{ 'accessibility.breadcrumbs' | t }}">
  <ol>
    <li><a href="/">{{ 'general.home' | t }}</a></li>
    {% if collection %}
      <li><a href="{{ collection.url }}">{{ collection.title }}</a></li>
    {% endif %}
    <li aria-current="page">{{ product.title }}</li>
  </ol>
</nav>
```

`aria-current="page"` marks the current location without turning it into a
(pointless, self-referential) link. Use `<ol>` — the sequence is meaningful,
not just a visual list.

## Size chart / spec tables

```liquid
<table>
  <caption class="visually-hidden">{{ 'products.size_chart' | t }}</caption>
  <thead>
    <tr>
      <th scope="col">{{ 'products.size' | t }}</th>
      <th scope="col">{{ 'products.chest_in' | t }}</th>
      <th scope="col">{{ 'products.waist_in' | t }}</th>
    </tr>
  </thead>
  <tbody>
    {% for row in size_chart %}
      <tr>
        <th scope="row">{{ row.size }}</th>
        <td>{{ row.chest }}</td>
        <td>{{ row.waist }}</td>
      </tr>
    {% endfor %}
  </tbody>
</table>
```

`scope="col"`/`scope="row"` is what lets a screen reader announce "Chest,
34" when landing on a data cell instead of just "34" with no header context.
Wrap wide tables in `<div role="region" tabindex="0" aria-label="...">` so
they can be scrolled by keyboard on narrow viewports without the whole page
scrolling.

## Product media gallery (thumbnail-driven)

```liquid
<div role="region" aria-label="{{ 'products.media_gallery' | t }}">
  <div aria-live="polite">
    <img
      src="{{ current_media | image_url: width: 900 }}"
      alt="{{ current_media.alt | default: product.title | escape }}"
    >
  </div>

  <div role="group" aria-label="{{ 'products.thumbnails' | t }}">
    {% for media in product.media %}
      <button
        type="button"
        aria-current="{% if media == current_media %}true{% else %}false{% endif %}"
        aria-label="{{ 'products.show_image' | t: index: forloop.index }}"
      >
        <img src="{{ media | image_url: width: 120 }}" alt="" loading="lazy">
      </button>
    {% endfor %}
  </div>
</div>
```

The large image's alt text is real (falls back to product title) since it's
the sole visual representation at that moment; each thumbnail's `<img>` is
`alt=""` because the button's `aria-label` already names it, and the visible
main image already carries the descriptive alt — duplicating it on every
thumbnail would be repetitive. `aria-live="polite"` on the main image
wrapper means swapping `src` on thumbnail click gets announced, since
otherwise a screen reader has no way to know the image changed at all.

## Accordion (FAQ, product details tabs)

```liquid
{% for block in section.blocks %}
  <details {% if forloop.first %}open{% endif %}>
    <summary>{{ block.settings.question }}</summary>
    <div>{{ block.settings.answer }}</div>
  </details>
{% endfor %}
```

`<details>/<summary>` is the native disclosure widget — it's keyboard
operable, announces expanded/collapsed state, and requires zero ARIA or JS.
Reach for a manual `aria-expanded` button (see the disclosure pattern in
`references/aria-patterns.md`) only when you need behavior `<details>`
doesn't support, such as an accordion where opening one item must close the
others (accordion-exclusive), or content that needs to animate open/closed
with anything more than the CSS you can already apply to `<details>` itself.
