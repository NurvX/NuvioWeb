# 01 — Un-gate touch/tap activation for non-webOS platforms

**What to build:** The focus-navigation engine already has a working tap/click-to-activate
mechanism — find the nearest focusable element under the event, focus it, then invoke the
current screen's pointer-activation handler — but it's currently restricted to the webOS
platform only. Lift that restriction so the same mechanism runs on the plain-browser platform
too (what a phone browser reports as). The webOS-specific mouse-move-based pointer-cursor
tracking (used for the Magic Remote's on-screen cursor) is unrelated to tap/click activation and
stays webOS-only — a touch device has no hover/cursor-preview concept, so it doesn't need it.

Add a dev-only DOM-simulation dependency (this repo's test runner has no DOM of its own) and
write the first automated test in this repo at this seam: register a fake screen implementing
the pointer-activation interface, dispatch a synthetic click on a focusable element, assert the
handler fires with the correct target on a platform where this path was previously disabled
entirely.

This is itself a demoable slice: any screen that already implements the pointer-activation
handler (today only reachable via webOS) becomes tappable on a phone browser the moment this
lands, with no further changes needed to that screen.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Tap/click activation via the focus-navigation engine's pointer-click dispatch works on the
      plain-browser platform, not just webOS
- [x] webOS's mouse-move pointer-cursor tracking behavior is unchanged
- [x] Tizen and webOS D-pad/remote navigation behavior is unchanged (manual regression check:
      simulated arrow-key + confirm/select input)
- [x] A dev-only DOM-simulation dependency is added and does not appear in the shipped app bundle
- [x] An automated test at this seam passes, asserting the current screen's pointer-activation
      handler is invoked with the correct target on a non-webOS platform
- [x] Manually verified: a screen that already implements the pointer-activation handler (e.g.
      the stream picker's existing handler) now responds to a tap in a phone-sized browser
      viewport, without any changes to that screen's own code

## Comments

Implementation notes:

- `js/ui/navigation/focusEngine.js`: `init()` now registers the `click` listener under
  `Platform.isWebOS() || Platform.isBrowser()` instead of inside the webOS-only block;
  `handlePointerClick()`'s early-return guard was widened the same way. The webOS-only
  `mousemove`/`pointermove` listener registration, the `webos-pointer-remote` class toggling, and
  `processPointerMove()`'s `Platform.isWebOS()` gate are untouched — cursor-preview tracking stays
  webOS-only as specified. No changes to `handleKey`/`handleKeyUp`/`handleTizenHardwareKey`
  (D-pad/remote path).
- Added `jsdom` as a devDependency (not referenced by any file `js/app.js` bundles into
  `dist/app.bundle.js`; `npm run build`'s core-js-leak check and a `dist/` grep both confirm
  `jsdom` doesn't reach the shipped bundle).
- `js/ui/navigation/focusEngine.test.mjs`: first automated test in the repo. Boots a jsdom
  document, calls the real `FocusEngine.init()` (so the test exercises the actual
  listener-registration seam this ticket un-gated, not just `handlePointerClick`'s internal
  guard), monkey-patches `Router.getCurrentScreen()` with a fake screen implementing
  `onPointerActivate`, then dispatches a real `click` DOM event on a `.focusable` element and
  asserts the fake screen's handler fires with that element as the target. Verified the test fails
  (times out) against the pre-fix code and passes against the fix.
- Manual verification (phone-sized viewport, `npm run serve` + `dist/`, "browser" platform, no
  webOS/Tizen globals present):
  - Confirmed via live-page `dispatchEvent` on an injected `.focusable` element inside the active
    screen's container that a real click now reaches `FocusEngine`'s pointer-click dispatcher and
    focuses the target (`classList.contains("focused")` became true) — this exercises the exact
    mechanism un-gated here, independent of any one screen's own click wiring (the sign-in screen
    turned out to have its own native `click` listener unrelated to this seam, so that path alone
    wasn't sufficient proof).
  - Confirmed keydown-based confirm/select (D-pad/remote emulation via `Enter`) still activates
    the sign-in screen's own button exactly as before — no observable regression to the existing
    keyboard/remote path, consistent with no code changes to `handleKey`/`handleKeyUp`.
  - Did not have Tizen/webOS device/emulator access in this session; relying on the fact that no
    code in the Tizen (`handleTizenHardwareKey`) or webOS (`handlePointerMove`,
    `processPointerMove`, cursor-class toggling) paths was touched, plus the keydown-path spot
    check above.
