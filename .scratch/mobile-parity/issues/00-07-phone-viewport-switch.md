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

**Status:** ready-for-agent

- [ ] `Platform.isPhoneViewport()` correctly reflects `Platform.isBrowser() &&
      matchMedia("(max-width: 600px)")`, returns `false` on Tizen/webOS unconditionally
- [ ] `watchPhoneViewport()` (or equivalent) correctly fires its callback on viewport
      crossing 600px in either direction, and can be torn down cleanly
- [ ] `Router.routes` is untouched — confirm no screen's route registration changed
- [ ] No TV/D-pad code path touched
- [ ] `npm test` covers the predicate/listener logic where practical
