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

**Status:** ready-for-agent

- [ ] Long-press-with-hold, double-tap-zone-seek, and drag-zone (brightness/volume/scrub)
      classification logic is unit-tested with `node:test` + jsdom using synthetic pointer
      event sequences, independent of any real video element
- [ ] Single-tap-to-toggle and double-tap-to-seek don't double-fire or conflict with each
      other
- [ ] Edge-exclusion correctly prevents gesture handling too close to screen edges
- [ ] Manually verified against a real `<video>` element in a phone-sized viewport: each
      gesture feels responsive and doesn't fight the browser's own touch scrolling/zoom
- [ ] D-pad/remote regression check on TV-mode player shows no behavior change (this ticket
      must not touch `playerScreen.js`'s existing keydown-based control logic at all)
