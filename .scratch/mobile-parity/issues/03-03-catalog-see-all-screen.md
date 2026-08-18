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

**Status:** ready-for-agent

- [ ] Floating header + under-scrolling grid work correctly together (header height correctly
      sets grid top padding)
- [ ] Infinite-scroll pagination triggers correctly near the bottom, reusing existing
      `loadNextPage` logic unchanged
- [ ] Long-press opens the zoom overlay; tap opens Detail
- [ ] Loading/empty states render correctly
- [ ] D-pad/remote regression check on TV-mode catalog-see-all screen shows no behavior
      change
- [ ] Manually verified in a phone-sized viewport (flag if real backend data is needed)
