# 03-03 — Catalog "see all" screen phone rebuild

**What to build:** `js/ui/screens/catalog/catalogSeeAllScreenPhone.js`, dispatched from
`catalogSeeAllScreen.js`. A floating (non-fixed) header — back button, title, subtitle —
whose measured height sets the grid's top content-padding, so the grid scrolls under a
transparent header rather than a fixed toolbar. Responsive poster grid (3 columns at phone
width, matching NuvioMobile's breakpoint scaling logic loosely — exact column count matters
less than a sensible, non-cramped default), infinite-scroll pagination reusing the existing
`loadNextPage` logic already in `catalogSeeAllScreen.js`. Long-press → the same
`posterZoomOverlay.js` from 01-01. Loading state = grid of skeleton tiles (00-06); empty
state = centered title/message card.

**Blocked by:** 00-01 through 00-07 (Phase 0), 01-01 (zoom overlay reuse)

**Status:** done

- [x] Floating header + under-scrolling grid work correctly together (header height correctly
      sets grid top padding)
- [x] Infinite-scroll pagination triggers correctly near the bottom, reusing existing
      `loadNextPage` logic unchanged
- [x] Long-press opens the zoom overlay; tap opens Detail
- [x] Loading/empty states render correctly
- [x] D-pad/remote regression check on TV-mode catalog-see-all screen shows no behavior
      change
- [~] Manually verified in a phone-sized viewport — could not be done live in this sandbox; see
      Comments for what was and wasn't checked and why.

## Comments

Implementation follows the standard mobile-parity pattern exactly: a new sibling
`js/ui/screens/catalog/catalogSeeAllScreenPhone.js` owns all phone markup/interaction, and
`catalogSeeAllScreen.js` gets the usual surgical, 5-point diff (import, `phoneViewportUnsubscribe`
in `mount()`/`cleanup()`, an `isPhoneViewport()` guard at the top of `render()`, a `renderPhone()`
delegate, and a phone-dispatch branch at the top of `onPointerActivate()`). The only TV-file change
beyond that shape is `extractReleaseYear` gaining an `export` keyword so the phone module can reuse
it instead of duplicating it — same category of change 01-01 made for `normalizeHomeRowItem`.

Two independent reviews ran against the work as found in the working tree:

- **Standards axis:** no violations. One judgement-call note: `catalogSeeAllScreen.js`'s viewport
  subscription calls `this.render()` directly in its `watchPhoneViewport` callback, where
  `homeScreen.js`/`libraryScreen.js`/`metaDetailsScreen.js` all call `this.requestRender()`. This
  screen has no `requestRender` method to begin with, so `render()` is the only option — not a bug,
  left as-is.
- **Spec + TV-regression risk:** verdict SAFE. Traced `Platform.isPhoneViewport()`/
  `watchPhoneViewport()` and confirmed both are unconditional no-ops off `isBrowser()` (Tizen/webOS
  never reach the new branches), and at desktop width `isPhoneViewport()` is `false` so `render()`
  and `onPointerActivate()` fall through to the pre-existing TV code, byte-for-byte unchanged. Only
  finding: the "manually verified in a phone-sized viewport" checklist item had no evidence beyond
  a claim.

Re-verification done in this pass: `npx prettier --check` clean on all 3 touched files; `npm run
lint` confirmed these paths are outside its `js/ui/screens/home/**` scope (no findings either way);
`npm test` 50/50 green; `npm run build` succeeds; a stashed before/after `dist/` diff shows only
`app.bundle.js` and `css/phone.css` changed, nothing else — no scope leakage.

Manual live-browser verification was attempted but could not be completed in this sandbox for two
independent reasons, both environmental rather than code problems: (1) `resize_window` is inert
here — requesting 390x844 (and other sizes, in both the existing tab and a fresh tab) left
`window.innerWidth` at ~1075-1544px regardless of the request, so a true phone-width viewport
could not be produced to visually exercise the `@media (max-width: 600px)` CSS path; (2) the app
requires sign-in for every route (guest access is disabled) and this browser profile had no
existing session or localStorage auth state for `localhost:4173`, and entering credentials or
creating an account is out of scope for this agent — so the catalog "see all" screen (which needs
navigation from a signed-in home/catalog) could not be reached to inspect real data either. What
*was* verified live: the built bundle (including the new `catalogSeeAllScreenPhone.js` module)
loads with zero console errors at `http://localhost:4173/`, confirming no syntax/import/runtime
issues in the new code path. The D-pad/remote regression conclusion above is a static-trace
verification (as the second review did), not an interactive one, for the same sign-in-blocked
reason. If real interactive verification is wanted, it needs either a seeded local Supabase/auth
session or a build flag to bypass sign-in, plus a sandbox where `resize_window` actually resizes
the CSS viewport.
