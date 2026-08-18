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

**Status:** ready-for-agent

- [ ] Hero parallax and floating-header fade-in both work correctly while scrolling
- [ ] Play button navigates to the stream picker with correct params (reuse existing
      navigation params logic from the TV detail screen's play action)
- [ ] Secondary actions (watched/library) correctly mutate state via existing data-layer
      calls
- [ ] Season/episode selection works for series content; movies show correctly with no
      season UI
- [ ] Cast and related-content rows render and are tappable/long-press-able
- [ ] D-pad/remote regression check on TV-mode detail screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport with a real title (flag if real backend
      data is needed)
