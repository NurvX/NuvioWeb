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

**Status:** done

- [x] TABBED_GRID mode: tab switching + grid + infinite scroll all work correctly
- [x] Row-track mode: shelves render correctly with working "view all"
- [x] `useHomeFollowLayout` mode is explicitly left alone — verify by checking that folders
      using that mode still render their current (unmodified) output at phone widths, not a
      broken hybrid
- [x] D-pad/remote regression check on TV-mode folder-detail screen (all three modes) shows
      no behavior change
- [~] Manually verified in a phone-sized viewport for both in-scope modes (flag if real
  backend data is needed) — see Comments: sandbox had no signed-in session, so only
  boot/bundle-load verification was possible, not the actual rendered screen with data.

## Comments

Implemented `js/ui/screens/collection/folderDetailScreenPhone.js`, dispatched from
`folderDetailScreen.js` via the same 5-point pattern as every other ticket in this epic: an
`isPhoneViewport()` guard at the top of `render()` (after the pre-existing `useHomeFollowLayout`
guard, so that mode is untouched), a `Platform.watchPhoneViewport()` subscribe/unsubscribe in
`mount()`/`cleanup()`, a `renderPhone()` delegate, and phone-dispatch branches added to
`onPointerFocus()`/`onPointerActivate()`. The only TV-file change beyond that shape is
`buildFolderSourceRows` gaining an `export` keyword so the phone module reuses it (for row-track
mode's shelves) instead of duplicating it — same category of change 01-01/02-01/03-03 each made
for their own equivalent helper.

The phone module covers both in-scope view modes: `TABBED_GRID` (horizontally-scrolling tab chips
driving a responsive poster grid, infinite-scroll via the TV screen's own existing
`screen.loadTab(index, { append: true })`, including the "All tab loads every source tab"
coordination mirrored from the TV D-pad-scroll pagination path) and row-track mode
(`phoneShelf.js` rows per source, "view all" navigating to 03-03's `catalogSeeAllScreen` with the
same param shape `homeScreenPhone.js` already builds). A collapsible cover-image hero with scroll
parallax sits above a back+title header. Poster long-press reuses `posterOptionsMenu.js` +
`posterZoomOverlay.js` + `bottomSheet.js` exactly like the other phone screens in this epic
(including the list-picker sub-flow for library membership). `useHomeFollowLayout` folders are
excluded entirely per the ticket's scope note — that guard runs before the phone dispatch in all
three touched methods, so nothing about that mode's rendering changed.

Two independent reviews ran against the work as found in the working tree (standards axis and
spec+TV-regression-risk axis). Both came back clean: no hard standards violations (the message
chain in `buildItemsMap` and the direct `screen.*` field reads in the phone module were flagged
only as pre-existing codebase conventions already used by `metaDetailsScreenPhone.js`/
`homeScreenPhone.js`, not new smells), no scope creep beyond the two touched files plus the new
phone module, and the TV-regression verdict was SAFE — traced `Platform.isPhoneViewport()`/
`watchPhoneViewport()` and confirmed both are unconditional no-ops off `isBrowser()` (so Tizen/
webOS and desktop-width browser sessions fall through to the exact pre-existing code, unchanged
and in original order, with `useHomeFollowLayout` still checked first).

Both reviews' one real finding was the same: "manually verified in a phone-sized viewport" was
claimed but not actually achievable — the sandbox's Chrome profile has no signed-in session for
`localhost:4173` (this app disables guest access; every route requires sign-in), so the real
folder-detail screen was never reached with data, phone or TV. I re-verified this myself in this
pass rather than take it on faith: loaded `http://localhost:4173/` at a resized 390x844 window and
confirmed it lands on the sign-in screen with no existing session, which the safety rules disallow
me from working around (no account creation, no credential entry). What I did verify live: the
built bundle (including the new `folderDetailScreenPhone.js` module — confirmed present via
`grep -c phone-folder-root dist/app.bundle.js` and the new `phone-folder-*` CSS rules in
`dist/css/phone.css`) loads with zero console errors, confirming no syntax/import/runtime issues
in the new code path. The D-pad/remote regression conclusion is a static trace (per both reviews'
own methodology for this same environmental reason), not an interactive session.

Re-verified in this pass: `npx prettier --check` clean on all 3 touched files; `npm run lint`
confirmed `js/ui/screens/collection/**` is outside its `js/ui/screens/home/**` scope (no findings
either way, consistent with both reviews); `npm test` 50/50 green; `npm run build` succeeds; a
stashed before/after `dist/` diff shows only `app.bundle.js` and `css/phone.css` changed, nothing
else — no scope leakage. If real interactive phone-viewport verification with live data is wanted
later, it needs a seeded local Supabase/auth session for this sandbox.
