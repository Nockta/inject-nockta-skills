# JavaScript patterns reference

Extended patterns for the vanilla-JS / custom-element standards in `SKILL.md`.
Grounded in the WHATWG DOM/HTML standards and MDN Web Components docs, plus
Shopify's public storefront JSON endpoints. Native browser APIs only — no
framework, no utility library.

## Custom-element lifecycle in depth

A custom element is the unit of interactive behaviour in a theme. It binds
when connected, tears down when disconnected (which the theme editor triggers
live as merchants add/remove/reorder sections), and reflects state through
attributes so CSS can style it.

```javascript
class CartDrawer extends HTMLElement {
  static observedAttributes = ['open'];

  #opener = null;                       // the element that opened us, to restore focus

  connectedCallback() {
    this.dialog = this.querySelector('[data-drawer]');
    this.addEventListener('click', this.#onClick);
    document.addEventListener('cart:updated', this.#onCartUpdated);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    document.removeEventListener('cart:updated', this.#onCartUpdated);
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'open') this.dialog.toggleAttribute('hidden', value === null);
  }

  open(opener) {
    this.#opener = opener ?? null;
    this.setAttribute('open', '');
    document.addEventListener('keydown', this.#onKeydown);
    // Focus management + trap belongs to the a11y contract — see the liquid-a11y skill.
  }

  close() {
    this.removeAttribute('open');
    document.removeEventListener('keydown', this.#onKeydown);
    this.#opener?.focus();
  }

  #onClick = (event) => {
    if (event.target.closest('[data-drawer-close]')) this.close();
  };

  #onKeydown = (event) => {
    if (event.key === 'Escape') this.close();
  };

  #onCartUpdated = (event) => {
    this.render(event.detail);
  };

  render(cart) { /* update DOM from cart state */ }
}

if (!customElements.get('cart-drawer')) {
  customElements.define('cart-drawer', CartDrawer);
}
```

Points that matter in a theme specifically:

- **Guard `define`** (`if (!customElements.get(name))`) — a repeated section's
  `assets/*.js` would otherwise throw on the second registration.
- **Class-field arrow handlers** (`#onClick = () => {}`) bind `this` and give a
  stable reference you can pass to both `addEventListener` and
  `removeEventListener`. A plain method can't be removed cleanly.
- **Reflect state to an attribute** (`open`) and let CSS react
  (`cart-drawer[open] { … }`) — don't toggle classes imperatively for state
  that CSS should own.
- Focus trapping, ARIA wiring, and reduced-motion are **not** duplicated here —
  they belong to `liquid-a11y`.

## Fetch with AbortController

Any live fetch (predictive search, facet filtering, quick-add) should cancel
its in-flight request when a newer one starts, so a slow earlier response can't
overwrite a fresh one, and abort entirely when the element leaves the DOM.

```javascript
class PredictiveSearch extends HTMLElement {
  #controller = null;

  connectedCallback() {
    this.input = this.querySelector('input[type="search"]');
    this.input.addEventListener('input', this.#onInput);
  }

  disconnectedCallback() {
    this.input.removeEventListener('input', this.#onInput);
    this.#controller?.abort();
  }

  #onInput = (event) => {
    const term = event.target.value.trim();
    if (term.length < 2) return;              // early return
    this.#search(term);
  };

  async #search(term) {
    this.#controller?.abort();                // cancel the previous request
    this.#controller = new AbortController();

    const url = new URL('/search/suggest.json', location.origin);
    url.searchParams.set('q', term);
    url.searchParams.set('resources[type]', 'product');

    try {
      const response = await fetch(url, { signal: this.#controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.#render(data.resources.results.products);
    } catch (error) {
      if (error.name === 'AbortError') return; // expected on supersede — ignore
      console.error('Predictive search failed:', error);
    }
  }

  #render(products) { /* build the results list */ }
}
```

- Build URLs with `new URL()` + `URLSearchParams` — never string concatenation
  (escaping and edge cases are handled for you).
- Distinguish an `AbortError` (expected, ignore) from a real failure.
- `async`/`await` with `try/catch`, not `.then()`/`.catch()` chains.

## Add to cart via the Cart AJAX API

```javascript
async function addToCart(variantId, quantity = 1) {
  const response = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items: [{ id: variantId, quantity }] }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description ?? 'Add to cart failed');
  }
  return response.json();
}
```

Wrap the call in the element's handler so the button reflects pending/disabled
state and broadcasts the result upward:

```javascript
async #onSubmit(event) {
  event.preventDefault();
  this.button.disabled = true;
  try {
    const line = await addToCart(this.dataset.variantId, 1);
    this.dispatchEvent(new CustomEvent('cart:updated', {
      detail: line,
      bubbles: true,          // a cart-drawer / cart-count listens for this
    }));
  } catch (error) {
    this.#showError(error.message);
  } finally {
    this.button.disabled = false;
  }
}
```

## Section Rendering API (re-render without a full reload)

Shopify's Section Rendering API returns fresh HTML for named sections, so a
facet change or cart update can swap just the affected markup. Request
`?sections=` and replace the inner HTML of the matching container.

```javascript
async function renderSection(sectionId, params = {}) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('sections', sectionId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Section render failed: ${response.status}`);
  const data = await response.json();
  return data[sectionId];                     // an HTML string for that section
}

// e.g. after a facet change, swap the results grid in place:
async function applyFilters(sectionId, searchParams) {
  const params = Object.fromEntries(new URLSearchParams(searchParams));
  const html = await renderSection(sectionId, params);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fresh = doc.querySelector('#ProductGrid');
  document.querySelector('#ProductGrid').replaceWith(fresh);
  history.replaceState(null, '', `?${searchParams}`);   // keep the URL shareable
}
```

Note: swapping the grid re-parents focus and drops any live-region
announcement — the *accessibility* handling of that swap (announce the new
count, keep focus sensible) is owned by `liquid-a11y`; this reference covers
only the mechanics of the swap.

## Component communication

**Child → parent (or siblings): a bubbling `CustomEvent`.** The child knows
nothing about who listens.

```javascript
this.dispatchEvent(new CustomEvent('quantity:change', {
  detail: { value },
  bubbles: true,
}));
```

**Parent → child: call the child element's public method.** The parent already
holds a reference to its subtree.

```javascript
this.querySelector('cart-count')?.update(cart.item_count);
```

Avoid cross-DOM coupling — a section reaching out with a global
`document.querySelector('.some-other-section .thing')` couples two components
that should stay independent. Prefer a document-level custom event both sides
agree on (`cart:updated`) as the contract between unrelated sections.

## JS house style (quick reference)

Keep theme scripts legible by settling these choices once, instead of
re-deciding style file by file:

**Declarations and control flow.** Default to `const`; reach for `let` only
when a binding is actually reassigned, and avoid `var` entirely. Loop with
`for (const item of items)` rather than `items.forEach(...)` once the body
has side effects — a `for...of` can `break`, `continue`, or `await` where
`forEach` can't. Guard and return early instead of nesting the happy path
inside an `if`/`else` pyramid:

```javascript
function applyLineItemDiscount(cart) {
  if (!cart.items.length) return cart;   // guard first, unindented from here
  // ...happy path
}
```

**Encapsulation and DOM wiring.** Mark internal methods and fields with
`#private` syntax, not an `_underscore` naming convention — the underscore is
only a hint to other readers, `#` is enforced by the runtime itself. Bind one
delegated listener on the host element and dispatch on `closest()`, rather
than a listener per child, so the element keeps working after it re-renders
its own markup.

**Async and networking.** Write `async`/`await` with `try`/`catch`, not
chained `.then()`/`.catch()`. Build request URLs with `new URL()` and
`URLSearchParams` instead of concatenating strings, and reach for native
`fetch`/`FormData`/`AbortController` before a bundled HTTP or utility
library — a theme ships to every visitor's connection, so each extra
dependency is weight every one of them pays for.

**Documentation.** A shared function in `assets/*.js` carries a JSDoc block
(`@param`, `@returns`, `@typedef`) — theme JS has no build step enforcing
types, so the comment is the only static contract the next editor of the
file gets.
