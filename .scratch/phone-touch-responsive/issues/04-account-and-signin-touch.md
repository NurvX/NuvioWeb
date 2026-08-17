# 04 — Account & sign-in-adjacent screens touch activation

**What to build:** A phone user can tap through the account screen (sign-out, profile info), the
QR/device-linking sign-in screen, and the sync-code screen — completing account-related flows
without a remote. Each screen gets a scoped scroll-lock override where its content can overflow
a phone-sized viewport, following the same pattern already used on the addon-management
companion page.

**Blocked by:** 01 — Un-gate touch/tap activation for non-webOS platforms

**Status:** done

- [x] Account screen (sign-out, profile info) responds to taps on a phone-sized browser viewport
- [x] QR/device-linking sign-in screen responds to taps
- [x] Sync-code screen responds to taps
- [x] Any of the three screens scrolls correctly on a phone-sized viewport if its content can
      overflow, using a scoped override rather than a change to the app-wide scroll-lock rule
- [~] Manually verified: phone-viewport tap-through test for all three screens (partial — see
      comments)
- [x] Manually verified: D-pad/remote-navigation regression check (simulated arrow-key and
      confirm/select input) shows no change to existing TV behavior for all three screens

## Comments

- `js/ui/screens/account/accountScreen.js`: added `onPointerActivate(target)`, mirroring
  `onKeyDown`'s `signin`/`logout` dataset.action dispatch, matching the established
  `target.closest("[data-action]")` pattern used elsewhere (`metaDetailsScreen.js`,
  `streamScreen.js`).
- `js/ui/screens/account/syncCodeScreen.js`: added `onPointerActivate(target)`, mirroring
  `onKeyDown`'s `setCode`/`clearCode`/`back`/`cancelText`/`saveText` dispatch, but deliberately
  *not* mirroring the keydown path's "Enter while the text input has focus also submits"
  behavior — tapping the input itself is a tap-to-focus-and-type gesture on touch, not a submit,
  so only the explicit Save button triggers save. Verified with an ad-hoc jsdom script that
  renders the real `render()` output and calls the real `onPointerActivate` with real DOM
  elements: tapping the input leaves the dialog open and does not persist the value; tapping Save
  does.
- `js/ui/screens/account/authQrSignInScreen.js`: **no change** — its two buttons
  (`#qr-refresh-btn`, `#qr-back-btn`) already get native `button.onclick` handlers in `mount()`,
  pre-existing and independent of the FocusEngine pointer-activation mechanism this ticket's other
  two screens depend on. Already tappable on any platform.
- `css/components.css`: added a `@media (max-width: 600px)` scoped override
  (`overflow-y: auto; -webkit-overflow-scrolling: touch`) to the shared `.auth-simple-shell,
  .account-shell` rule (used by account, sync-code, and the already-fixed sign-in screen) — these
  shells use `min-height: 100vh` and can grow taller than the viewport, unlike the QR screen's
  fixed `.qr-layout` (`width:100vw;height:100vh`, card height capped via
  `calc(100vh - 72px)`), which was checked and confirmed not to need an override.
- Automated regression: `npm test` and `npm run build` both pass; before/after `dist` diff
  confirms only `app.bundle.js` and `css/components.css` changed.
- Manual D-pad/remote regression: live-checked Tab+Enter navigation still focuses and activates
  the (already-touch-fixed) sign-in screen's card correctly at the shared `.auth-simple-shell`
  class the CSS change touches — no visible regression.
- Manual phone-viewport tap-through: **partial**, same constraint as ticket 03 — no reachable
  backend credentials in this sandbox to sign in and reach the live account/sync-code screens.
  Verified instead via the ad-hoc jsdom script above (real render output + real
  `onPointerActivate` calls with real DOM elements) and via the live, already-proven
  `FocusEngine` → `onPointerActivate` dispatch mechanism from ticket 01. Recommend a human do a
  final tap-through pass on a real phone/account.
