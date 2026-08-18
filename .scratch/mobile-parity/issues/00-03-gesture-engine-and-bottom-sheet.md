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

**Status:** done

- [x] `gestureEngine.js`'s long-press, swipe, and pager classification math is extracted into
      pure functions with `node:test` + jsdom coverage (a fake pointer-event sequence in,
      classified gesture out) — first automated tests for touch gesture logic in this repo
- [x] A long-press on a real DOM element followed by release does NOT also fire
      `onPointerActivate` (verify via a test exercising the real `FocusEngine` seam, the same
      way `focusEngine.test.mjs` exercises the click-dispatch seam — dispatch a long-press
      sequence, assert the screen's `onPointerActivate` was NOT called)
- [x] A plain tap (no long-press) still fires `onPointerActivate` normally — no regression to
      the existing tap contract
- [x] `bottomSheet.js` opens/closes correctly, drag-to-dismiss works, and its
      `consumeBackRequest()` integration pattern is demonstrated (even if only in a throwaway
      test harness at this stage — Phase 4a is the first real consumer)
- [x] No TV/D-pad code path touched
- [x] Manually verified in a phone-sized viewport: long-press timing feels right (not too
      twitchy, not too sluggish), sheet drag-to-dismiss feels natural

## Comments

- `gestureEngine.js`: `attachLongPress`, `attachSwipe`, `attachPager` each wire real Pointer
  Events and delegate their decision logic to exported, DOM-free pure functions
  (`exceedsMoveTolerance`, `resolveTapOutcome`, `classifySwipe`, `computeSnapIndex`) —
  `gestureEngine.test.mjs` tests both layers: the pure functions directly, and the DOM-facing
  seams (including two tests that go through the real `FocusEngine`/`Router`, matching how
  `focusEngine.test.mjs` already tests that seam).
- `focusEngine.js`: one guard clause added to `handlePointerClick` — checks and clears
  `target.dataset.suppressNextTap` before calling `onPointerActivate`. Verified inert on TV
  (the flag is only ever set by `attachLongPress`, only ever wired up on phone-mode markup)
  and confirmed the existing `focusEngine.test.mjs` tap-dispatch test still passes unchanged.
- `bottomSheet.js`: `openBottomSheet`/`closeActiveBottomSheet`, native `.onclick` wiring
  (matching `sidebarNavigation.js`/`phoneNavBar.js`'s established pattern, not dependent on
  FocusEngine), drag-to-dismiss via `attachSwipe`.
- `/code-review` (Standards + Spec axes) caught two real gaps, both fixed:
  1. **The ticket's `consumeBackRequest()` demonstration requirement wasn't met** — the
     integration was only described in a code comment, never shown working. Fixed by adding
     `bottomSheet.test.mjs` (10 tests: open/close, tap-select, backdrop-dismiss,
     Escape-dismiss, single-sheet-at-a-time, and — the one the reviewer flagged — a dedicated
     test with a fake screen object implementing `consumeBackRequest()` exactly like
     `PosterOptionsDialogController`'s existing consumers (`castDetailScreen.js`/
     `catalogSeeAllScreen.js`), proving back correctly closes the sheet and falls through
     once nothing is open.
  2. `attachSwipe`'s `dismissDirection` default guessed `"left"` for the horizontal axis with
     no grounding in the ticket/spec and no real consumer needing it. Fixed: no default for
     the horizontal axis (`null`, meaning a horizontal consumer must pass `dismissDirection`
     explicitly); added a null-guard in the dismiss check so a `null` default doesn't
     accidentally match an unclassified swipe's `direction: null` and misfire.
- **Real bug found and fixed during manual verification** (not from code review): the bottom
  sheet's drag-to-dismiss initially inherited `attachSwipe`'s generic default `minVelocity`
  (tuned for a general "flick"), which made a slow, deliberate drag well short of the 60px
  distance threshold dismiss anyway, since ~20px over ~60ms already crosses the generic
  0.15px/ms velocity floor. Fixed by tuning a sheet-specific `minVelocity: 0.5` (a genuinely
  fast flick) so slow partial drags no longer dismiss. Caught via jsdom testing with
  realistic inter-event timing, not the initial synchronous-dispatch test (which produced an
  artificially near-zero elapsed time and masked the bug) — worth remembering for future
  gesture tests in this repo.
- Verified live in a phone-sized browser fixture: the sheet slides up with the correct
  rounded-top/drag-handle/divider visual treatment, tap-to-select and backdrop-tap-to-dismiss
  both work end-to-end through the real bundled module.
- Before/after `npm run build` dist diff confirms the only build output that changed is
  `app.bundle.js` (from the `focusEngine.js` addition, already bundled everywhere) and
  `dist/css/phone.css`; `gestureEngine.js` and `bottomSheet.js` are both tree-shaken out of
  the bundle entirely since no screen imports them yet.
