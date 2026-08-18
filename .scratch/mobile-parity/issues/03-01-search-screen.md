# 03-01 — Search screen phone rebuild

**What to build:** `js/ui/screens/search/searchScreenPhone.js`, dispatched from
`searchScreen.js`. Sticky header (title, switching to "Discover" once scrolled with no
active query) + rounded search input with a clear button, auto-focused on navigation in.

Empty-query state: recent-searches list (tap to re-run, trailing remove), then a Discover
section — horizontally-scrolling filter dropdown chips (Type/Catalog/Genre, reuse
`discoverScreen.js`'s existing filter data/logic) + a responsive infinite-scroll poster grid.

Typed-query state: 350ms debounce, results rendered as `phoneShelf.js` rows grouped by
source/catalog (reuse existing search data logic), skeleton rows (00-06) while loading.
Empty/error states per reason (no addons, no search-capable catalogs, request failed, no
results, offline) as simple title+message cards, matching the phone visual language.

**Blocked by:** 00-01 through 00-07 (Phase 0), 01-01 (for `phoneShelf.js` reuse patterns)

**Status:** ready-for-agent

- [ ] Empty-query recent-searches + Discover grid render and are interactive
- [ ] Typed query debounces correctly and renders grouped shelf-row results
- [ ] All documented empty/error/offline states render correctly
- [ ] D-pad/remote regression check on TV-mode search screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport (flag if real backend/addon data is needed
      for full verification)
