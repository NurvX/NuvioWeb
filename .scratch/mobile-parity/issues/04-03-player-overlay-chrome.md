# 04-03 — Player overlay chrome

**What to build:** The visual layer that 04-02's gestures drive and that phone users tap
through. Phone dispatch inside `playerScreen.js`.

- Header row: title/episode-code/source-name stack (left, fades with controls), circular
  translucent-black icon buttons (right): external-player handoff, lock, settings, close/back
  — reuse existing handoff/settings logic, new phone markup only.
- Center: three circular buttons (Replay10, big Play/Pause with loading-spinner state,
  Forward10) — reuse existing play/pause/seek functions.
- Bottom: a flattened `<input type="range">` or custom scrubber matching the visual (thin,
  full-width), elapsed/duration time pills either side, a centered pill capsule bar of
  icon+label chips (aspect/resize, speed, Subtitles, Audio, and conditionally Sources/
  Episodes) — reuse existing subtitle/audio/source dialog-opening logic, new phone entry
  points.
- Lock mode: hides everything except a large centered lock button + a read-only slider/time
  pills with a bottom scrim; long-press to unlock.
- Pause overlay: appears when paused and controls hidden — gradient scrim, "You're watching"
  label, logo/title, episode info, synopsis line.
- Skip-intro/outro floating pill with an auto-countdown progress-drain bar (~10s), independent
  auto-hide from the main controls.
- Next-episode card: slides in from the right near content end, thumbnail + episode info +
  autoplay status + play badge, tap plays immediately.
- Subtitle/audio pickers: NOT bottom sheets — a bottom-anchored vertical rail
  (`js/ui/screens/player/pickerRail.js`, new) over a dimmed full-screen scrim, listing
  tracks/languages with a checkmark for the active selection, reusing existing subtitle/audio
  track data and selection logic unchanged.
- Gesture feedback pill (from 04-02's callback data): rounded translucent-black chip, icon +
  text, red-tinted variant for "limit hit" states (e.g. can't seek past duration).

**Blocked by:** 04-02 (consumes its gesture callbacks), 00-01 through 00-07 (Phase 0)

**Status:** ready-for-agent

- [ ] All control elements render and correctly call existing player functions (play/pause,
      seek, subtitle/audio dialogs, external handoff) unchanged
- [ ] Auto-hide timing, lock mode, pause overlay, skip-intro pill, and next-episode card all
      behave correctly
- [ ] Subtitle/audio rail correctly shows and updates the active track selection
- [ ] Gesture feedback pill correctly reflects 04-02's live gesture state
- [ ] D-pad/remote regression check on TV-mode player shows no behavior change (existing
      keydown-based controls must be completely unaffected)
- [ ] Manually verified against a real video/stream in a phone-sized viewport (flag if real
      backend/addon data is needed to reach a playable stream)
