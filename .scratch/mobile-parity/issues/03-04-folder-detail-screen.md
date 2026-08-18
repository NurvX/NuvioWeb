# 03-04 — Folder/collection detail screen phone rebuild

**What to build:** `js/ui/screens/collection/folderDetailScreenPhone.js`, dispatched from
`folderDetailScreen.js` — but **only** for the screen's non-`useHomeFollowLayout` view modes
(`TABBED_GRID` and the plain row-track layout). The `useHomeFollowLayout` mode delegates to
`HomeScreen`'s methods (transform-positioned swipeable rows) and is explicitly out of scope
here too, same as it was for this mode's touch-tap ticket in the prior effort — do not build
phone markup for it; it should continue rendering its current (TV-styled) output until the
home screen's swipeable-row system itself is addressed in a future, separate effort.

For the in-scope modes: an optional collapsible cover-image hero (collapses via scroll,
similar treatment to Detail's parallax hero) above a header (title + back). Below:
`TABBED_GRID` mode = a horizontally-scrolling tab row (category/source tabs, "All" +
others) driving a responsive poster grid with infinite-scroll, reusing existing tab-switch
logic. Row-track mode = `phoneShelf.js` rows, one per source, "view all" navigating to
03-03's catalog-see-all phone screen.

**Blocked by:** 00-01 through 00-07 (Phase 0), 01-01, 03-03 (for "view all" navigation
target)

**Status:** ready-for-agent

- [ ] TABBED_GRID mode: tab switching + grid + infinite scroll all work correctly
- [ ] Row-track mode: shelves render correctly with working "view all"
- [ ] `useHomeFollowLayout` mode is explicitly left alone — verify by checking that folders
      using that mode still render their current (unmodified) output at phone widths, not a
      broken hybrid
- [ ] D-pad/remote regression check on TV-mode folder-detail screen (all three modes) shows
      no behavior change
- [ ] Manually verified in a phone-sized viewport for both in-scope modes (flag if real
      backend data is needed)
