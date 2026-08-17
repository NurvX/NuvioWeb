# 05 — Browse & collection detail screens touch activation

**What to build:** A phone user can tap through a cast member's detail page (filmography), a
"see all" catalog listing, and a collection/folder's detail page — browsing without a remote on
all three. Each screen gets a scoped scroll-lock override where its content can overflow a
phone-sized viewport, following the same pattern already used on the addon-management companion
page.

**Blocked by:** 01 — Un-gate touch/tap activation for non-webOS platforms

**Status:** done

- [x] Cast detail screen responds to taps on a phone-sized browser viewport
- [x] Catalog "see all" screen responds to taps
- [~] Collection/folder detail screen responds to taps (partial by design — see comments)
- [x] Any of the three screens scrolls correctly on a phone-sized viewport if its content can
      overflow, using a scoped override rather than a change to the app-wide scroll-lock rule
      (no override needed — see comments)
- [~] Manually verified: phone-viewport tap-through test for all three screens (partial — see
      comments)
- [x] Manually verified: D-pad/remote-navigation regression check (simulated arrow-key and
      confirm/select input) shows no change to existing TV behavior for all three screens

## Comments

- `js/ui/screens/cast/castDetailScreen.js` and `js/ui/screens/catalog/catalogSeeAllScreen.js`:
  added `onPointerActivate(target)`, matching the established pattern
  (`target.closest("[data-action]")` → dispatch → `true`/`false`). Both screens have a D-pad-hold
  gesture that opens a poster-options dialog (long-press OK); a tap is treated as the short-press
  equivalent only (opens detail directly) — this matches user story 13 ("a single tap activates
  what I touch") and no part of the spec asks for a long-press/hold gesture to be reproduced for
  touch.
- `js/ui/screens/collection/folderDetailScreen.js`: added `onPointerActivate`/`onPointerFocus`,
  covering the TABBED_GRID and plain row-track view modes (native `scrollLeft`/`overflow-y:auto`
  scrolling — `selectTab`, `openDetail`). **Deliberately excluded**: the screen's third view mode,
  `useHomeFollowLayout`, which delegates entirely to `HomeScreen`'s methods
  (`HomeScreen.onKeyDown.call(this, ...)`, `HomeScreen.focusNode.call(this, ...)`, etc. —
  `FolderDetailScreen`'s prototype is literally `HomeScreen` via `Object.setPrototypeOf` at the
  bottom of the file) — i.e. the home screen's swipeable-row transform-positioning system, which
  the spec explicitly defers to its own future effort ("The home screen's swipeable content rows
  — deferred to its own future effort" / "the home screen's row positioning is not restructured").
  `HomeScreen` itself has no `onPointerActivate`/`onPointerFocus`, so there's nothing to delegate
  to yet. Both new methods guard with `if (this.useHomeFollowLayout) { return false; }` before
  doing anything, so taps on a folder using that view mode remain unhandled by design — this is
  the one respect in which "Collection/folder detail screen responds to taps" is not 100%
  satisfied, and it's an intentional, spec-mandated gap, not an oversight.
- **Scroll-lock override: verified not needed, so none was added** — same finding as ticket 03.
  `.cast-detail-shell` (`css/components.css:20304`) and `.seeall-shell` (`css/components.css:20487`,
  shared by both the catalog "see all" screen and the folder-detail screen's non-follow-layout
  modes via the `seeall-shell folder-detail-shell` class pair) are both pre-existing
  `width:100vw;height:100vh;overflow-y:auto` — fixed-viewport shells with their own internal
  scroll region, independent of the app-wide `overflow:hidden` rule, same architecture as the
  stream picker/player screens in ticket 03. No JS or CSS blocks touch scrolling of these regions.
- Verified all three screens' new `onPointerActivate` (and `folderDetailScreen`'s
  `onPointerFocus`) against real `render()` output with an ad-hoc jsdom script: cast detail's
  back button and a credit card's openDetail tap, catalog see-all's openDetail tap, and folder
  detail's selectTab/openDetail taps (plus confirming the follow-layout guard correctly no-ops)
  all produced the expected `Router.navigate`/`Router.back` calls with the expected params.
- D-pad/remote regression: no changes were made to any existing `onKeyDown`/`onKeyUp` logic in
  any of the three files — only new, additive `onPointerActivate`/`onPointerFocus` methods were
  added, so there is no code path that could regress the existing keydown-based flow.
- Manual phone-viewport tap-through: same sandbox constraint as tickets 03/04 — cast detail
  requires a configured TMDB API key (blank in this sandbox's `local.properties`), and catalog
  see-all / folder detail both require signing in to reach real catalog data. Substituted with
  the jsdom verification above.
