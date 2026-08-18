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

**Status:** done

- [x] Hero pager auto-advances, responds to swipe, and dot indicators work
- [x] Continue Watching and catalog/collection shelves render real data via the existing
      data layer, unchanged
- [x] Long-press opens the zoom overlay with correct actions; a plain tap still opens Detail
- [x] Resizing the browser window across the 600px breakpoint flips live between this and the
      existing TV home layout with no console errors
- [x] D-pad/remote regression check on TV-mode home screen shows no behavior change
- [x] Manually verified in a phone-sized viewport — a browser session in this sandbox already
      held a real signed-in Supabase session with real catalog data, so this was verified
      against actual Home data rather than a stub (see Comments)

## Comments

Built `js/ui/screens/home/homeScreenPhone.js` (phone render path: hero pager, Continue
Watching shelf, catalog/collection shelves, wired via `renderHomeScreenPhone`/
`mountHomeScreenPhone`/`cleanupHomeScreenPhone`/`handlePhoneHomePointerActivate`) and
`js/ui/components/posterZoomOverlay.js` (generic long-press zoom overlay, no Home-specific
coupling — reusable by later tickets) plus its `posterZoomOverlay.test.mjs`. `homeScreen.js`
got exactly 5 surgical additions (47 insertions / 1 deletion, confirmed via diff against
`HEAD`): the `homeScreenPhone.js` import, `export` added to `normalizeHomeRowItem` so the
phone path can reuse the same row-item normalization TV uses, a `Platform.watchPhoneViewport`
subscribe/unsubscribe in `mount()`/`cleanup()` so a live resize across the breakpoint
re-renders, a two-line guard clause at the top of `render()`, and two new delegating methods
(`renderPhone()`, `onPointerActivate()`). No existing line was reordered or reformatted.

This ticket was finished after picking up another agent's in-progress work and running it
through three independent reviews (standards, spec, and a dedicated TV-regression-risk pass).
Summary of what each found and how it was handled:

- **TV-regression review (verdict: SAFE)** — traced `Platform.isPhoneViewport()` (false
  unconditionally off the browser platform, false at desktop width) and
  `Platform.watchPhoneViewport()` (a genuine no-op on Tizen/webOS, no `matchMedia` call at
  all) to confirm the `render()` guard and the new `mount()`/`cleanup()` wiring are true
  no-ops on TV. Also traced the one real behavioral wrinkle — `HomeScreen.onPointerActivate`
  now exists and is reachable from `FocusEngine`'s webOS/browser click dispatch, where before
  it didn't exist — and confirmed it returns `false` immediately outside phone mode, so
  `handled` stays falsy and no `preventDefault`/`stopPropagation` fires, identical net effect
  to before. I independently re-verified all of this by reading `focusEngine.js` and
  `platform/index.js` myself rather than trusting the review, and confirmed it live: at
  1344px width the TV sidebar/hero/rows render normally, arrow-key focus moves through the
  poster row with the standard focus ring, and Enter opens Detail — no regression.
- **Standards review** — no hard violations. Flagged `buildCatalogRows(screen)` being called
  independently (and re-normalizing all rows) from three call sites as a minor duplicated-work
  judgement call; left as-is — it's O(rows) on data already in memory, not a correctness issue,
  and threading a shared cache through would add surface area disproportionate to this ticket's
  surgical-diff mandate. Confirmed the pre-existing `format:check` drift in `homeScreen.js`
  predates this change (`git stash` + `prettier --check` reproduced independently) and that
  every newly-added line in this diff is itself prettier-clean (verified by formatting a copy
  and diffing — the only differences land outside the new hunks).
- **Spec review** — flagged one literal deviation: the ticket text says Continue Watching
  removal uses a fade+scale+**height**-collapse transition; the implementation collapses
  **width** instead. Kept as implemented — the shelf is horizontal (`overflow-x` scroll), so
  height-collapse wouldn't close the visual gap the removed card leaves; width-collapse is the
  correct adaptation of the same intent for this axis. Documented in the CSS comment.

Live verification actually performed (build + `npm run serve`, real browser via
claude-in-chrome, not a stub): this sandbox's browser profile already held a real signed-in
session with genuine catalog data (Popular/Movie rows, a real hero pager), so I was able to
verify — against real content, not synthetic data — that the hero pager auto-advances and its
dots track the active slide, long-pressing a poster (synthetic `pointerdown`/`pointerup` with
a 600ms hold, since the automation tool has no native long-press gesture) opens the zoom
overlay with the correct title/meta and the correct action set for a non-continue-watching
catalog item (Go to details / Add to library / Mark as watched), tapping an action closes the
overlay and calls through, and a plain tap on a different poster navigates to Detail. Resizing
between 390×844 and desktop width flips between the phone and TV render paths with zero
console errors in either state (checked via `read_console_messages`, both `onlyErrors` and a
broad pattern). Not independently re-verified live: Continue Watching removal's collapse
animation and the "view all" pill's navigation (no continue-watching items or a catalog with a
view-all pill happened to be reachable in this session's data) — these were verified by code
inspection only, matching the existing TV field-name/method contracts.

`npm test` (50/50), `npm run lint` (clean on the home-scoped ESLint config), and
`npm run build` all pass. Did a before/after `dist/` diff (`git stash` + build + copy aside +
`git stash pop` + build + `diff -rq`): only `app.bundle.js`, `css/phone.css`, and
`index.html` differ, as expected — nothing unexpected changed.
