# WCAG 2.2 Success Criteria Cited in This Skill

Full text: https://www.w3.org/TR/WCAG22/. This table exists so you can look
up level and intent without leaving the editor — it doesn't replace the
spec, and wording below is a paraphrase for quick scanning, not a quote.

| SC | Title | Level | What breaks in a theme if you miss it |
|---|---|---|---|
| 1.1.1 | Non-text Content | A | Product images with no alt text (or redundant alt text) are silent to a screen reader, or noisy/duplicated when a title sits right next to them. |
| 1.3.1 | Info and Relationships | A | Visual grouping (a labeled filter group, a price next to a title) isn't conveyed in code — a `<div>` styled to look like a form field group isn't a `<fieldset>` to assistive tech. |
| 1.4.1 | Use of Color | A | A sold-out badge, error state, or "selected" swatch that's only distinguished by color is invisible to colorblind or low-vision shoppers. |
| 1.4.2 | Audio Control | A | Autoplaying video/audio with no way to pause it drowns out a screen reader mid-sentence. |
| 1.4.3 | Contrast (Minimum) | AA | Low-contrast text (light gray on white "sale" labels, thin-weight prices) is unreadable for low-vision users and in bright ambient light. |
| 1.4.11 | Non-text Contrast | AA | Form field borders, icon buttons, and focus rings that fade into the background can't be located by low-vision users. |
| 2.1.1 | Keyboard | A | A `<div onclick>` swatch picker or `<span>` "button" is completely inoperable without a mouse. |
| 2.1.2 | No Keyboard Trap | A | A custom modal/overlay with no Escape handling and no focus trap boundary strands keyboard users inside it, or lets Tab silently leak into content behind it. |
| 2.2.2 | Pause, Stop, Hide | A | An autoplaying hero carousel or auto-dismissing toast with no pause control removes shopper control over timing, and can interrupt assistive tech mid-announcement. |
| 2.3.1 | Three Flashes or Below Threshold | A | Rapid flashing promotional animation (sale countdown, flash banner) risks triggering seizures — independent of any user preference setting. |
| 2.3.3 | Animation from Interactions | AAA | Parallax/scroll-triggered motion with no `prefers-reduced-motion` fallback can trigger vestibular symptoms in users who have explicitly opted out at the OS level. |
| 2.4.1 | Bypass Blocks | A | No skip link means every keyboard user re-tabs through the full header/nav on every single page. |
| 2.4.3 | Focus Order | A | Opening a drawer/modal without moving focus into it, or closing one without returning focus, strands the user's tab position on a hidden or removed element. |
| 2.4.4 | Link Purpose (In Context) | A | A card with three separately-focusable "read more"-style links (image, title, quick-add) that all say the same generic thing, with no distinguishing context. |
| 2.4.6 | Headings and Labels | AA | Headings used for font size instead of structure (skipping from h1 to h4) break the "jump by heading" navigation mode screen reader users rely on. |
| 2.4.7 | Focus Visible | AA | `outline: none` with no replacement makes it impossible to tell where keyboard focus currently is. |
| 2.4.10 | Section Headings | AAA | Long pages (collection pages, PDPs with tabs/accordions) with no heading per section force a linear read-through with no way to skip ahead. |
| 2.4.11 | Focus Not Obscured (Minimum) | AA | A sticky header or cookie banner that overlaps the currently focused element hides it from view even though it's technically still focused. |
| 2.5.8 | Target Size (Minimum) | AA | Icon-only buttons (wishlist heart, close ×) under roughly 24×24px with tight spacing are hard to hit precisely for users with motor impairments. |
| 3.2.2 | On Input | A | A `<select>` or checkbox that auto-submits/navigates on change with no warning surprises users who didn't expect the page to move. |
| 3.3.1 | Error Identification | A | A failed add-to-cart or checkout submit with only a color change (red border) and no text gives no information to a screen reader user. |
| 3.3.2 | Labels or Instructions | A | Placeholder-only inputs lose their label the moment the user starts typing, and aren't reliably exposed as labels by every screen reader. |
| 3.3.3 | Error Suggestion | AA | An error that says "Invalid" instead of "Enter a valid email address" gives a sighted user a visual cue (which field) but gives a screen reader user nothing actionable. |
| 3.3.7 | Redundant Entry | A | Re-asking for information already provided earlier in the same flow (e.g. re-entering shipping details already captured) adds unnecessary cognitive and motor burden. |
| 4.1.2 | Name, Role, Value | A | A custom control (swatch, quick-add button, toggle) with no accessible name or wrong implied role reports nothing useful when a screen reader lands on it. |
| 4.1.3 | Status Messages | AA | AJAX cart updates, filter result counts, and search suggestion counts that only update visually give no signal at all to a screen reader user who isn't looking at the screen. |
