# 01-01 — Home screen phone rebuild

**What to build:** `js/ui/screens/home/homeScreenPhone.js`, dispatched from
`homeScreen.js`'s `render()` when `Platform.isPhoneViewport()` is true (00-07). Single
scrolling column, no top app-bar — `phoneNavBar.js` (00-02) floats over the bottom.

- **Hero**: auto-advancing pager (8s interval, `gestureEngine.attachPager` for swipe, 00-03),
  full-bleed banner image, bottom-rounded corners (`--phone-radius-card`, 24px — closest
  existing token to the mobile app's 28dp), gradient fade into the background color at the
  bottom, logo (fallback: large bold title) + type/genre/date meta line, a "View Details"
  pill button, tappable dot indicators for page position. Reuse the existing hero
  data-fetching/state logic already in `homeScreen.js` — only the markup/interaction is new.
- **Continue Watching**: `phoneShelf.js` in its larger landscape-card variant (00-05), reuse
  existing continue-watching data logic. Removing an item uses a CSS fade+scale+
  height-collapse transition (`--phone-motion-slow`, ~350ms) as the documented substitute for
  NuvioMobile's particle "disintegration" effect (see epic spec's Fidelity trade-offs).
- **Catalog/collection shelves**: standard `phoneShelf.js` rows, one per user-ordered
  catalog/collection, "view all" navigating to the phone Catalog-see-all / Folder screens
  (Phase 3 — until those exist, wire "view all" to the existing routes; the TV screens will
  render if Phase 3 hasn't shipped yet, which is an acceptable interim state).
- **Long-press on any poster** → build `js/ui/components/posterZoomOverlay.js` here (first
  and most common long-press surface in the app): the pressed poster animates to
  screen-center over a blurred/dimmed backdrop (CSS `transition`/`transform` using
  `--phone-ease-emphasized`, not spring physics — per Fidelity trade-offs), title+subtitle
  above it, a cascading action list below (mark watched, add/remove library, etc. — wire to
  whatever mutation functions the existing TV poster-options menu already calls).

**Blocked by:** 00-01 through 00-07 (all of Phase 0)

**Status:** ready-for-agent

- [ ] Hero pager auto-advances, responds to swipe, and dot indicators work
- [ ] Continue Watching and catalog/collection shelves render real data via the existing
      data layer, unchanged
- [ ] Long-press opens the zoom overlay with correct actions; a plain tap still opens Detail
- [ ] Resizing the browser window across the 600px breakpoint flips live between this and the
      existing TV home layout with no console errors
- [ ] D-pad/remote regression check on TV-mode home screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport — flag explicitly if this needs a real
      signed-in account with real catalog data to fully verify (per the epic spec's
      auth-gated verification note)
