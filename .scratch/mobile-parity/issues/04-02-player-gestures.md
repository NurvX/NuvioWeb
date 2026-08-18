# 04-02 — Player gesture layer

**What to build:** The densest gesture surface in the app — build and unit-test the
classification logic in isolation before wiring to the real `<video>` element. Using
`gestureEngine.js` (00-03):

- Single tap toggles controls visibility (3.5s auto-hide timer while playing, not scrubbing,
  not buffering, no dialog open — reuse/adapt whatever auto-hide timer logic already exists
  in `playerScreen.js`).
- Double-tap on the left third seeks backward, right third seeks forward; middle third
  toggles controls (do not double-fire with the single-tap handler — use a standard
  tap-vs-double-tap disambiguation delay).
- Long-press = temporary playback-speed boost while held (reuses `attachLongPress`, but needs
  a "held" callback in addition to on-resolve, since this is a hold-duration effect not a
  single fire-once action — extend `attachLongPress`'s API here if needed, e.g. an
  `onHoldStart`/`onHoldEnd` pair alongside `onLongPress`).
- Horizontal drag anywhere = scrub/seek preview, sensitivity scaled by content duration
  (shorter content = more sensitive), committed on release, live preview shown via a
  callback the player UI (04-03) renders as a floating time/position indicator.
- Vertical drag on the left third = brightness (CSS dim/brighten overlay on the video
  element — no OS brightness API on web, this is cosmetic-only, document it clearly);
  vertical drag on the right third = volume (real `video.volume`).
- Exclude gesture handling near the very top/bottom edges of the screen (a small pixel
  margin) to avoid conflicting with OS/browser system gestures (pull-to-refresh, browser
  chrome reveal).
- All gesture feedback surfaces through a floating pill (icon + text, positioned centrally)
  — the 04-03 ticket owns the actual pill's visual styling; this ticket just needs to expose
  the right callback data (gesture type, current value, whether it's a "limit hit" state).

**Blocked by:** 00-03 (gesture engine)

**Status:** done

- [x] Long-press-with-hold, double-tap-zone-seek, and drag-zone (brightness/volume/scrub)
      classification logic is unit-tested with `node:test` + jsdom using synthetic pointer
      event sequences, independent of any real video element
- [x] Single-tap-to-toggle and double-tap-to-seek don't double-fire or conflict with each
      other
- [x] Edge-exclusion correctly prevents gesture handling too close to screen edges
- [~] Manually verified against a real `<video>` element in a phone-sized viewport — partial:
      guest access is disabled and no credentials were used, so the authenticated player
      screen was never reached. Verified instead by driving synthetic `PointerEvent` sequences
      against a real `<div>` in a live Chrome tab at a 390x844 viewport, importing
      `playerGestures.js` directly (real event loop, real timers, not the jsdom test harness).
      This exercises the classification/wiring/callback contract end-to-end but not real
      `video.volume`/CSS-filter rendering or actual touch-scroll/zoom contention on a touch
      device. "Feels responsive" is not verifiable this way — flagging for a follow-up manual
      pass once a signed-in test account/device is available.
- [x] D-pad/remote regression check on TV-mode player shows no behavior change (this ticket
      must not touch `playerScreen.js`'s existing keydown-based control logic at all)

## Comments

Built `js/ui/screens/player/playerGestures.js` (pure classification functions + a single
`attachPlayerGestureLayer` Pointer-Events wiring function, mirroring the `gestureEngine.js`
split) and wired it into `playerScreen.js` as a fully additive layer: `Platform.isPhoneViewport()`
gated attach/detach synced from `mount()`, `Platform.watchPhoneViewport()`, and `cleanup()`, plus
~20 new `onPhoneGesture*` handler methods appended near the end of the file that only call
existing playback primitives (`togglePause`/`seekPlaybackSeconds`/`applyPlaybackSpeed`/
`setControlsVisible`). One surface split: single tap toggles controls, double-tap on the
left/right third seeks 10s, hold boosts speed to 2x, horizontal drag scrubs (duration-scaled
sensitivity), vertical drag on the left/right half adjusts brightness (CSS filter, cosmetic-only,
documented)/volume. `attachLongPress` in `gestureEngine.js` gained an optional
`onHoldStart`/`onHoldEnd` pair alongside the existing `onLongPress` (backward-compatible, unused
by this ticket's actual wiring since the player needs several disambiguated outcomes from one
pointer stream rather than `attachLongPress`'s single-outcome model, but built per the ticket's
suggested extension and unit-tested). A placeholder feedback pill (`css/phone.css`) proves the
callback contract fires with real `{type, value, limitHit}` data; 04-03 owns its final visual
design.

Two independent reviews ran against the pre-commit working tree:

- **Standards review**: no documented-standard violations. Flagged one real duplication —
  `playerScreen.js` wired both the generic `onFeedback` callback from `playerGestures.js` *and*
  the specific `onScrubMove`/`onBrightnessMove`/`onVolumeMove` callbacks, each of which
  independently re-derived `limitHit` and called `onPhoneGestureFeedback`, so the feedback pill
  was written twice per pointermove during any drag, with the `limitHit` formula living in two
  places that could silently diverge. Fixed by dropping the `onFeedback` wiring in
  `playerScreen.js` (the per-gesture `onXMove` callbacks already own feedback) — confirmed with a
  live-browser check dispatching a synthetic 5-move scrub drag: before the fix, 5 `onFeedback` +
  5 `onScrubMove` calls fired (10 pill writes); after, only the 5 `onScrubMove`-driven calls
  fire. `playerGestures.js`'s `onFeedback` contract itself is left in place (correct, tested,
  usable by future callers) — only the redundant wiring at the call site was removed.
- **Spec + TV-regression-risk review**: **verdict SAFE**. `onKeyDown` and its helpers are
  untouched (grepped the full file, confirmed no diff hunk touches it); `Platform.isPhoneViewport()`
  is always false off-phone-width so the gesture layer never attaches and
  `resetControlsAutoHide()`'s TV timing (4200ms) is byte-identical. The only gap raised was the
  manual-verification checklist item (see above) — honestly partial, not silently skipped.

Re-ran `npm test` (75/75 green, including the new `playerGestures.test.mjs` and the three new
`attachLongPress` hold tests), `npm run build` (succeeds; before/after `dist` diff shows only
`app.bundle.js` and `css/phone.css` changed, as expected), and `npm run lint` (still only scopes
`js/ui/screens/home/**`, passes trivially — verified rather than assumed, per instructions).
`npx prettier --check` passes on all 6 touched/new files.
