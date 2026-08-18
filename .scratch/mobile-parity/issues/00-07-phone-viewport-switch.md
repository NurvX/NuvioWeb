# 00-07 — Phone-viewport runtime switch

**What to build:** Add `Platform.isPhoneViewport()` to `js/platform/index.js`:
`Platform.isBrowser() && window.matchMedia("(max-width: 600px)").matches`. This is the single
predicate every phone-mode screen dispatch (Phase 1+) checks at the top of `render()` to
decide whether to delegate to its sibling `<screen>Phone.js` module — mirroring the existing
`classicHomeLayout.js`/`gridHomeLayout.js`/`modernHomeLayout.js` dispatch pattern already in
`js/ui/screens/home/homeScreen.js`.

Also establish (as a small shared helper, not duplicated per screen) the `mount()`-time
`matchMedia` listener registration pattern: on change, re-run `render()` so a resized browser
window flips live between phone/TV mode, matching how `--phone-*` CSS tokens are already
viewport-reactive via `@media`. Document this pattern (e.g. a short helper function
`watchPhoneViewport(callback)` that screens call once in `mount()` and clean up in
`cleanup()`) so Phase 1+ tickets don't each reinvent the listener wiring/teardown.

No screen consumes this yet — it's pure infrastructure, verified via a small manual check or
unit test of the predicate logic itself.

**Blocked by:** None — can run in parallel with the rest of Phase 0.

**Status:** done

- [x] `Platform.isPhoneViewport()` correctly reflects `Platform.isBrowser() &&
matchMedia("(max-width: 600px)")`, returns `false` on Tizen/webOS unconditionally
- [x] `watchPhoneViewport()` (or equivalent) correctly fires its callback on viewport
      crossing 600px in either direction, and can be torn down cleanly
- [x] `Router.routes` is untouched — confirm no screen's route registration changed
- [x] No TV/D-pad code path touched
- [x] `npm test` covers the predicate/listener logic where practical

## Comments

- Added `Platform.isPhoneViewport()` and `Platform.watchPhoneViewport(callback)` directly to
  the existing `Platform` object in `js/platform/index.js` (no new module — two small methods
  didn't warrant one), sharing a single `PHONE_VIEWPORT_QUERY` constant with a comment noting
  it must stay in sync with `--phone-*` tokens' `@media` scoping in `css/base.css`.
- `watchPhoneViewport` uses `addEventListener("change", ...)` with an `addListener` fallback
  for older WebKit, and is a no-op (returns a no-op unsubscribe) off the browser platform, so
  Tizen/webOS never register a listener at all.
- `js/platform/index.test.mjs`: new test file covering both methods with a fake
  `MediaQueryList` (jsdom's own `matchMedia` isn't reliably mockable app-side, so the test
  substitutes `globalThis.matchMedia`) — 4 tests: browser-platform reflection, off-browser
  short-circuit, fire-on-change + clean unsubscribe, and off-browser no-op registration.
- `Router.routes` confirmed untouched via `git diff`.
