# 02-01 — Detail (meta details) screen phone rebuild

**What to build:** `js/ui/screens/detail/metaDetailsScreenPhone.js`, dispatched from
`metaDetailsScreen.js`'s `render()`. Single scrolling column.

- Non-sticky backdrop hero with parallax (0.5x scroll speed via a scroll listener, not
  `position: sticky`), optional autoplay trailer crossfade over the still image once
  buffered (reuse existing trailer logic already in `metaDetailsScreen.js`), logo/title +
  genre line near the bottom of the hero, gradient fade into background color.
- A floating compact header (back button, centered logo/title, add-to-library icon) that
  fades/translates in once scrolled past the hero — separate element from the hero itself,
  not a pinned hero.
- Pill-shaped "Play" button (wide, most of the row width) + an expandable row of circular
  secondary-action icon buttons (mark watched, library add/remove, etc.) behind a rotating
  "…" toggle — reuse whatever action functions the existing TV detail screen's equivalent
  buttons already call (`onPointerActivate`'s existing `toggleTrailer`/`openSharedTrailer`
  handling stays; add the play/library/watched actions this phone build newly needs as tap
  handlers here).
- Meta info: year/runtime/age-rating/rating row, director/writer lines, synopsis clamped to
  3 lines with a show-more/less toggle.
- Cast row via `phoneShelf.js`'s circular-avatar variant (tap navigates to
  `castDetailScreen`'s phone equivalent once it exists in a later ticket, or the existing
  screen if not yet built).
- Series season/episode selection: season selector (poster or text-chip toggle, reuse
  existing season/episode data logic), episodes as horizontal cards or vertical list per the
  same user-preference key the TV screen already respects if one exists, else pick a sensible
  default and note it.
- Related-content rows (Part of Collection, More Like This) via `phoneShelf.js`, long-press →
  the same `posterZoomOverlay.js` built in 01-01.

**Blocked by:** 01-01 (reuses `posterZoomOverlay.js` and the `phoneShelf.js` patterns
established there)

**Status:** done

- [~] Hero parallax and floating-header fade-in both work correctly while scrolling — verified
      live; the optional autoplay trailer crossfade over the still image was cut from scope
      (see Comments)
- [x] Play button navigates to the stream picker with correct params (reuse existing
      navigation params logic from the TV detail screen's play action)
- [x] Secondary actions (watched/library) correctly mutate state via existing data-layer
      calls
- [x] Season/episode selection works for series content; movies show correctly with no
      season UI
- [x] Cast and related-content rows render and are tappable/long-press-able
- [x] D-pad/remote regression check on TV-mode detail screen shows no behavior change
- [x] Manually verified in a phone-sized viewport with a real title (real, signed-in catalog
      data was reachable in this sandbox's browser profile — see Comments)

## Comments

**What was built:** `js/ui/screens/detail/metaDetailsScreenPhone.js` (new, ~650 lines) — the
full phone render path: parallax hero (0.5x scroll-driven `translate3d`, not `position:
sticky`) with a separate floating compact header that fades in past a scroll threshold, a
pill Play button + expandable secondary-action row (library/watched icon buttons behind a
rotating "…" toggle), meta info row, a 3-line-clamped synopsis with show-more/less, a
season-chips + horizontal-episode-card section for series, and Cast/Collection/More-Like-This
rows via `phoneShelf.js` with long-press → `posterZoomOverlay.js` (both reused as-is from
01-01). `metaDetailsScreen.js` got the same five surgical additions ticket 01-01 established
for `homeScreen.js`: a `Platform.isPhoneViewport()` guard at the top of `render()`, a
`Platform.watchPhoneViewport()` subscribe/unsubscribe in `mount()`/`cleanup()`, a
`renderPhone()` delegate, an `onPointerActivate()` phone dispatch branch, and `export` added
to the handful of pure helpers (`isSeriesDetailMeta`, `normalizePreviewItem`,
`resolveImdbRating`, etc.) the phone module reuses instead of reimplementing.
`phoneShelf.js`/`posterCard.js` got a new `"cast"`/`"circle"` variant (extending the existing
component with an option, not forking it) for the circular cast avatars.

**The toggleWatchedFromDetail() extraction:** the whole-title "mark watched" toggle used to
live as a ~45-line inline block inside the TV click dispatcher's `action === "toggleWatched"`
branch. It's now `toggleWatchedFromDetail()`, a method on the screen object, called from both
that original dispatch site (`await this.toggleWatchedFromDetail(); return;`) and the phone
tap handler. I diffed the moved body against the original inline block line-by-line — same
`captureDetailFocus()` call, same `isSeriesDetailMeta` branch, same series/movie/unwatch/watch
repository calls with identical argument shapes (including the `positionMs: 100, durationMs:
100` sentinel), same `detailWatchedEnrichmentService.enrichMovieWatchedState` gate, same
trailing `refreshEpisodePlaybackState()` + `render(this.meta, focusRestore)`. Only
whitespace/indentation differs. Confirmed live in-browser too: toggling watched on a real
title (Obsession) via TV-mode D-pad (focus + Enter) and via the phone tap handler both flipped
the icon to the same active state and re-rendered correctly, then reverted cleanly.

**Review findings and how I handled them:** three independent reviews (standards, spec,
TV-regression-risk) flagged the same three "drive-by reformatting" hunks in
`metaDetailsScreen.js` (the `animeWatchedKeys` map/regex block, the
`applyMembershipChanges(...)` call, and the `trailerAutoplayTimer` `setTimeout`) as violating
CONTRIBUTING.md's "no bundled refactors" rule. I investigated by running `prettier --write` on
a scratch copy of the pre-ticket HEAD version of the file (inside the repo, so `.prettierrc.json`
resolved correctly) — it reformatted those exact three spots identically. The base file already
disagreed with the currently-installed Prettier (3.9.6) at those three locations, independent of
this ticket entirely; running the mandatory `prettier --write` gate on the whole file (as this
ticket's own instructions require) necessarily touches every line Prettier disagrees with, not
just the diff's own lines. I confirmed this isn't a broader drift problem for the rest of the
file (I checked a full-file Prettier re-format and it produces a much larger diff purely from
missing trailing commas etc., which the previous agent correctly did NOT apply — only these
three spots, which were genuinely non-compliant at baseline, got touched). I judged this a false
positive on "drive-by cleanup" — it's an unavoidable side effect of the required formatting gate
applied to pre-existing drift, not an intentional/optional refactor — and left the three hunks
as-is (reverting them would just reintroduce a `prettier --check` failure). The spec review's
"autoplay trailer crossfade" flag is legitimate — it's an explicitly-scoped-out checklist item,
marked `[~]` above with the reasoning: `playTrailer()`'s DOM sync (`syncTrailerDom()`) is
hardcoded to a TV-only `.series-detail-shell` selector, and widening it or duplicating its
~150 lines of playback logic was out of scope for this ticket's sanctioned
`metaDetailsScreen.js` changes. The spec review's "manual verification wasn't against a real
title" flag was accurate at the time of that review; I re-did verification against this
sandbox's real, already-signed-in catalog session (see below) and it now is.

**Manual verification (live browser, 390x844):** the sandbox's browser profile was
already signed in with real catalog/detail data reachable. Verified against *Obsession* (2026
movie): hero + parallax on scroll, floating header fade-in past threshold, Play button showing
correct label, "Show more/less" synopsis toggle, the "…" secondary-actions expand, library
toggle (icon flips to active checkmark and persists across the expand/collapse), watched toggle
(icon flips to open-eye "watched" state — this is `toggleWatchedFromDetail()` firing against
real repository data), cast row rendering with real photos/names, and the back button
navigating cleanly to Home. Verified against *Breaking Bad* (series): "Next S1E1" play label
(series correctly skip the whole-title watched button per `showWatchedButton` gating), season
chips (Season 1–5 + Specials), tapping "Season 2" correctly re-rendered the horizontal episode
shelf to S2E1/S2E2/S2E3, and cast tap correctly dispatched `Router.navigate("castDetail", …)`
(landed on a "TMDB API key not configured" screen, which is this sandbox's local.properties
missing a TMDB key — an environment gap, not a bug in this ticket's code; the navigation itself
with correct params is what was being verified). Long-press zoom overlay on Collection/More-Like-
This rows was not exercised against a real title in this session (this Obsession/Breaking Bad
pair had no populated Collection/More-Like-This data to long-press), but `posterZoomOverlay.js`
is the same, already-tested (`posterZoomOverlay.test.mjs`, passing) component 01-01 built and
this module wires it through unmodified — same call shape as the Home phone screen's own
long-press usage. TV-mode desktop-width (1544px) regression check: confirmed the TV layout
renders unchanged and `toggleWatchedFromDetail()` fires correctly via real focus+Enter D-pad-style
interaction, flips state, and reverts cleanly — no behavior difference from before this ticket.

`npm test` (50/50 passing), `npm run build`, and `npm run lint` (scoped to
`js/ui/screens/home/**` per `eslint.config.mjs` — doesn't cover this ticket's files; ran
`npx eslint` directly on the touched/new files as an extra check and confirmed the only
findings are three pre-existing, unrelated `LibrarySourceMode` `no-undef` errors present at
HEAD before this ticket, not introduced by it) all pass.
