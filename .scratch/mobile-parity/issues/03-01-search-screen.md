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

**Status:** done

- [x] Empty-query recent-searches + Discover grid render and are interactive
- [x] Typed query debounces correctly and renders grouped shelf-row results
- [x] All documented empty/error/offline states render correctly
- [x] D-pad/remote regression check on TV-mode search screen shows no behavior change
- [x] Manually verified in a phone-sized viewport (flag if real backend/addon data is needed
      for full verification)

## Comments

**What was built:** `js/ui/screens/search/searchScreenPhone.js` (new, ~985 lines) — sticky
header + rounded search input with clear button, an idle/empty-query body (recent-searches
list backed by a new `js/data/local/searchHistoryStore.js` profile-scoped local store, plus a
Discover section with Type/Catalog/Genre filter chips opening `bottomSheet.js` pickers and a
responsive infinite-scroll poster grid), and a typed-query body (350ms debounce,
`screen.searchRows(query)` reused verbatim from the TV screen for the actual multi-catalog
fetch, reshaped into `phoneShelf.js` rows grouped by addon/catalog) with skeleton loading and
per-reason empty/error/offline states. `searchScreen.js` got the same five-point surgical
pattern as 01-01/02-01: a `Platform.isPhoneViewport()` guard at the top of `render()`, a
`Platform.watchPhoneViewport()` subscribe/unsubscribe in `mount()`/`cleanup()`, a
`renderPhone()` delegate, and an `onPointerActivate()` phone-dispatch branch that returns
`false` off-phone (12 added lines in the render/mount/cleanup hunks, nothing reordered). The
Discover filter chips/grid have no TV screen to delegate to (the ticket's "reuse
`discoverScreen.js`'s filter logic" instruction doesn't have a reuse point to call — see
below) so that piece is a small, self-contained, read-only mirror of `discoverScreen.js`'s
catalog/type/genre shape, not a duplication of any reusable exported logic.

**This session picked up mid-flight:** the working tree already had this ticket's
implementation done by a prior agent when I started; my job was to act on two independent
reviews (standards axis + spec/TV-regression axis) run against that diff.

**Review findings and how I handled them:**
- **Real fix applied** — `toDiscoverPosterItem`/`toSearchResultPosterItem` were byte-identical
  functions (same shape mapper used by both the Discover grid and the typed-query result
  shelves). Merged into a single `toPosterItem(screen, item)`, updated both call sites,
  re-ran `prettier`/tests/build — no behavior change, purely a duplication cleanup the
  standards review correctly flagged as real (not a judgement call).
- **Judgement call, left as-is** — the cross-file `escapeHtml`/`toTitleCase` triplication
  across `searchScreenPhone.js`/`homeScreenPhone.js`/`metaDetailsScreenPhone.js`. This PR
  continues an existing convention rather than introducing it, and CONTRIBUTING's "don't
  bundle refactors with a bug fix" rule argues against extracting a shared helper inside this
  ticket's scope. Agreed with the reviewer's own conclusion not to touch it.
- **Judgement call, left as-is** — the `discoverScreen.js` reuse deviation the spec review
  flagged: the ticket text says "reuse `discoverScreen.js`'s existing filter data/logic", but
  `discoverScreen.js` exports one monolithic `DiscoverScreen` object with all filter logic as
  internal `this.*` methods — nothing factored into a standalone importable function to call.
  Reusing it without modifying `discoverScreen.js` (a screen file explicitly out of this
  ticket's scope) isn't possible, so the self-contained mirror is the correct call here, not a
  defect.
- **TV-regression verdict was already SAFE** in both reviews (guard clause no-ops on TV,
  `onPointerActivate` returns `false` off-phone identically to a screen with no override, the
  one reused TV method — `searchRows()` — is called read-only). I independently re-verified
  this live (see below) rather than taking the claim at face value.
- The pre-existing `fallbackCol` unused-var ESLint finding at `searchScreen.js:1160` is
  confirmed untouched by this diff (outside both this PR's and my own hunks) — not
  attributable here.

**Manual verification (live browser, 390×844, real signed-in catalog data already present in
this sandbox's browser profile):** idle state showed a real "Recent Searches" list (residual
entries from earlier testing) plus a populated Discover grid (Movie/Popular/Default filters);
removing a recent-search entry via its trailing `×` worked; typing "batman" produced correctly
grouped, debounced `phoneShelf.js` rows ("Popular - Movie", "Popular - Series") with real
poster art; a deliberately-garbage query rendered the "No Results" empty-state card; clearing
the query returned cleanly to the idle body; the Type filter chip opened a `bottomSheet.js`
picker with a checkmark on the current selection, and switching Type from Movie to Series
correctly reloaded the Discover grid with real series content (Reacher, House of the Dragon,
Ted Lasso, etc.). The no-addons/no-search-catalogs empty states were not exercised live (this
sandbox's session has addons/search catalogs configured) — verified by code inspection only.
D-pad/remote regression check at desktop width (1344px): typed "batman" via keyboard, arrow
keys moved focus correctly between the search input and the result grid and laterally across
poster cards with the expected focus ring, confirming TV-mode dispatch is unaffected by the
new `onPointerActivate` branch.

`npm test` (50/50 passing), `npm run build`, and `npm run lint` (scoped to
`js/ui/screens/home/**` per `eslint.config.mjs`, doesn't cover this ticket's files; ran
`npx eslint` directly on the touched/new files as an extra check — the only finding is the
confirmed pre-existing, untouched `fallbackCol` unused-var) all pass. Before/after `dist`
diff confirmed only `app.bundle.js` and `css/phone.css` changed between HEAD and this diff.
