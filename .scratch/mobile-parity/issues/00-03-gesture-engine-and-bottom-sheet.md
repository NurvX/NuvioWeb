# 00-03 — Gesture engine + bottom sheet primitive

**What to build:** Two tightly-related pieces of shared infrastructure, since the bottom
sheet's drag-to-dismiss depends on the gesture engine existing first.

**`js/ui/navigation/gestureEngine.js`** — pure Pointer Events API, no framework:

- `attachLongPress(el, { onLongPress, onTap, threshold = 500, moveTolerance = 10 })`:
  `pointerdown` starts a timer; movement past `moveTolerance` or an early
  `pointerup`/`pointercancel` cancels the timer and calls `onTap`; the timer firing first
  calls `onLongPress` and sets `el.dataset.suppressNextTap = "1"`.
- `attachSwipe(el, { axis, onSwipeStart, onSwipeMove, onSwipeEnd, onDismiss })`: distance
  and velocity based drag tracking.
- `attachPager(el, { itemWidth, onIndexChange, autoAdvanceMs })`: swipe + snap + optional
  autoplay timer (used by the Phase 1 hero).
- Extract the classification math (long-press timing resolution, swipe direction/velocity
  classification, pager snap-index calculation) into plain, DOM-free functions the DOM-facing
  `attach*` functions call — these get the automated tests below.

**One-line addition to `js/ui/navigation/focusEngine.js`**: in `handlePointerClick`, before
invoking `onPointerActivate`, check `target.dataset.suppressNextTap` — if set, delete it and
return without calling `onPointerActivate`. This lets a long-press resolve without also
firing a tap-activate on release. No-op on TV (the flag is only ever set by
`attachLongPress`, which is only wired up on phone-mode markup).

**`js/ui/components/bottomSheet.js`** — `openBottomSheet({ items: [{icon, title,
onSelect}], onDismiss })`: slide-up sheet, top corners radius `--phone-radius-sheet` (24px),
drag handle (54×5px pill, centered, 10px top padding) wired to `attachSwipe` for
drag-to-dismiss, backdrop scrim + tap-to-dismiss, `Escape` to dismiss, stacked full-width
tappable action rows (icon + title, hairline dividers between rows). Returns a controller
object exposing `destroy()` — screens that open a sheet check it in their own
`consumeBackRequest()`, following the exact pattern already used by
`PosterOptionsDialogController` in `castDetailScreen.js`/`catalogSeeAllScreen.js`
(`consumeBackRequest() { return this.closeXMenu(); }`) — do not invent a new backstack
concept.

**Blocked by:** 00-01 (tokens)

**Status:** ready-for-agent

- [ ] `gestureEngine.js`'s long-press, swipe, and pager classification math is extracted into
      pure functions with `node:test` + jsdom coverage (a fake pointer-event sequence in,
      classified gesture out) — first automated tests for touch gesture logic in this repo
- [ ] A long-press on a real DOM element followed by release does NOT also fire
      `onPointerActivate` (verify via a test exercising the real `FocusEngine` seam, the same
      way `focusEngine.test.mjs` exercises the click-dispatch seam — dispatch a long-press
      sequence, assert the screen's `onPointerActivate` was NOT called)
- [ ] A plain tap (no long-press) still fires `onPointerActivate` normally — no regression to
      the existing tap contract
- [ ] `bottomSheet.js` opens/closes correctly, drag-to-dismiss works, and its
      `consumeBackRequest()` integration pattern is demonstrated (even if only in a throwaway
      test harness at this stage — Phase 4a is the first real consumer)
- [ ] No TV/D-pad code path touched
- [ ] Manually verified in a phone-sized viewport: long-press timing feels right (not too
      twitchy, not too sluggish), sheet drag-to-dismiss feels natural
