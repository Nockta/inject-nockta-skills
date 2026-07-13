# ARIA APG Pattern Reference

Full patterns: https://www.w3.org/WAI/ARIA/apg/patterns/. This file collects
the keyboard interaction tables and edge-case notes for the patterns
`SKILL.md` uses, plus a manual focus-trap implementation for when native
`<dialog>` isn't available.

## Carousel

Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/carousel/

| Key / control | Effect |
|---|---|
| Tab | Moves focus onto the carousel's own controls (prev/next/pause), not automatically into slide content |
| Left / Right Arrow (when a slide control has focus) | Optional: move to previous/next slide |
| Prev / Next buttons | Required: move to previous/next slide, always visible, always operable by click and by Enter/Space once focused |
| Pause/Play toggle | Required if the carousel auto-rotates at all; stops rotation permanently (not just until mouse-out) |

Structural notes:

- The outer container is `role="region"` with `aria-roledescription="carousel"`
  and an `aria-label` naming what the carousel is (not just "carousel").
- Each slide is `role="group"` with `aria-roledescription="slide"` and a
  label identifying its position ("2 of 5").
- Rotation must pause on any focus entering the carousel (keyboard tab-in),
  not only on mouse hover — hover-only pausing misses keyboard and
  touch-device users entirely.
- If slides contain their own interactive content (a "shop the look"
  carousel with links per slide), non-visible slides should be `inert` (or,
  as a fallback for older browsers, `aria-hidden="true"` combined with
  removing every descendant from tab order) so Tab can't walk into an
  off-screen slide.

## Dialog (Modal)

Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

| Key | Effect |
|---|---|
| Tab | Moves to next focusable element inside the dialog; wraps from last back to first |
| Shift+Tab | Moves to previous focusable element; wraps from first back to last |
| Escape | Closes the dialog, returns focus to the trigger |

Native `<dialog>` opened via `.showModal()` implements all three rows for
you, plus `aria-modal="true"` and blocking interaction with background
content. Use it as the default. The manual implementation below is only for
cases where `<dialog>` genuinely can't be used.

```javascript
class KeyboardFocusScope {
  #panel;
  #handleKeydown = (event) => {
    if (event.key !== 'Tab') return;

    const focusables = this.#focusableElements();
    if (focusables.length === 0) return;

    const lastIndex = focusables.length - 1;
    const currentIndex = focusables.indexOf(document.activeElement);
    const atStart = event.shiftKey && currentIndex <= 0;
    const atEnd = !event.shiftKey && currentIndex === lastIndex;

    // Let the browser handle every Tab press in between natively — only
    // step in at the two wrap-around boundaries.
    if (atStart || atEnd) {
      event.preventDefault();
      focusables[atStart ? lastIndex : 0].focus();
    }
  };

  constructor(panel) {
    this.#panel = panel;
  }

  #focusableElements() {
    return [...this.#panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((el) => !el.disabled && el.tabIndex !== -1);
  }

  open() {
    document.addEventListener('keydown', this.#handleKeydown);
    this.#focusableElements()[0]?.focus();
  }

  close() {
    document.removeEventListener('keydown', this.#handleKeydown);
  }
}
```

Query the focusable elements fresh on every keypress rather than caching
them once at open time — content inside a quick-view or drawer is often
swapped in after the panel already exists in the DOM, so a cached list
would go stale.

## Combobox (List Autocomplete, e.g. predictive search)

Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ (the "list
autocomplete with manual selection" variant is closest to a typical
predictive search box)

| Key | Effect |
|---|---|
| Any printable character | Updates the query, re-opens/updates the listbox |
| Down Arrow | Opens the listbox if closed; otherwise moves the highlighted option down one |
| Up Arrow | Moves the highlighted option up one (does not close on reaching the top) |
| Enter | If an option is highlighted, selects it and closes the listbox; otherwise submits the raw query |
| Escape | Closes the listbox without selecting; a second Escape may clear the input |
| Tab | Moves focus away and closes the listbox without selecting |

State ownership: `role="combobox"`, `aria-expanded`, `aria-controls`, and
`aria-activedescendant` all live on the `<input>`. The listbox itself is
`role="listbox"`; each suggestion is `role="option"` with a unique `id` that
`aria-activedescendant` points at. Actual DOM focus never leaves the input —
highlighting an option is purely visual + `aria-activedescendant`, which is
what lets the user keep editing their query while browsing suggestions.

## Disclosure (show/hide toggle)

Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/

| Key | Effect |
|---|---|
| Enter / Space (button has focus) | Toggles the associated content's visibility |

```liquid
<button type="button" aria-expanded="false" aria-controls="FilterGroup-Size">
  {{ 'filters.size' | t }}
</button>
<div id="FilterGroup-Size" hidden>
  <!-- checkboxes -->
</div>
```

Flip `aria-expanded` and the `hidden` attribute together in JS on click. If
the collapsible content is a static block of text/links with no interactive
form controls (an FAQ answer, a policy blurb), prefer native
`<details>/<summary>` instead — it gets this entire pattern for free with no
JS or ARIA required, including built-in Ctrl/Cmd+F "find in page" support
for collapsed content in current browsers.
