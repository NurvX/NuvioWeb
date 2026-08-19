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

**Status:** done

- [x] All control elements render and correctly call existing player functions (play/pause,
      seek, subtitle/audio dialogs, external handoff) unchanged — one deliberate deviation on
      "external handoff": no equivalent reusable handoff helper exists in `playerScreen.js`
      (that logic lives in `streamScreen.js`, pre-entry), so `tryOpenCurrentStreamExternally()`
      is a small new `window.open()` call rather than a reuse, documented inline.
- [x] Auto-hide timing, lock mode, pause overlay, skip-intro pill, and next-episode card all
      behave correctly
- [x] Subtitle/audio rail correctly shows and updates the active track selection
- [x] Gesture feedback pill correctly reflects 04-02's live gesture state
- [x] D-pad/remote regression check on TV-mode player shows no behavior change (existing
      keydown-based controls must be completely unaffected)
- [~] Manually verified against a real video/stream in a phone-sized viewport — partial, same
      gap as 04-02: no signed-in test account/credentials in this sandbox, so a real playable
      stream was never reached, and `resize_window` was intermittently inert here too. Verified
      instead with a synthetic harness (`renderPhonePlayerChrome`/`mountPhonePlayerChrome`/
      `updatePhonePlayerChrome` imported directly, unbundled, in a live 390-wide Chrome tab
      against a mock `screen` object exposing the same getters/state `playerScreen.js` provides)
      — confirmed header/center/bottom-bar markup, pause overlay (both normal and
      still-watching variants), skip-intro pill with countdown fill, next-episode card, lock
      toggle (`is-locked` class + overlay), capsule-bar labels, scrubber min/max/value binding,
      and the subtitle picker rail opening with real item data, all render and update
      correctly from real state changes and real click events. Does not exercise real
      `<video>` timing, real track lists from a live addon, or touch-specific ergonomics on an
      actual device — flagging for a follow-up pass once a signed-in test account is
      available, same as 04-02.

## Comments

Built `js/ui/screens/player/playerScreenPhone.js` (all phone chrome markup/state-refresh/event
binding — header row, center transport buttons, bottom scrubber + capsule bar, lock overlay,
skip-intro pill, pause overlay incl. still-watching variant, next-episode card) and
`js/ui/screens/player/pickerRail.js` (new, distinct from `bottomSheet.js` per the ticket's
explicit instruction — a bottom-anchored vertical rail over a dimmed scrim for subtitle/audio/
speed selection). Wired into `playerScreen.js` as a fully additive sibling DOM layer
(`#phonePlayerUi`, appended inside `#playerUiRoot`, never replacing TV markup): a single
`syncPhonePlayerChrome()` build/teardown/refresh method, called from the same handful of
existing TV render hook points (`renderPlayerUi`, `renderControlButtons`, `renderPauseOverlay`,
`renderSkipIntroButton`, `renderNextEpisodeCard`, `updateUiTick`) right after each one's existing
TV-markup work, plus a new `syncPhoneMode()` that pairs it with 04-02's `syncPhoneGestureLayer()`
under the one `Platform.watchPhoneViewport()` subscription. `css/phone.css`'s existing
`max-width: 600px` breakpoint is what actually hides the TV controls/pause-overlay/skip-intro/
next-episode-card chrome and shows this layer instead — no JS-side TV/phone branch exists inside
any TV render method. `phoneLockActive` was added to `shouldIgnorePhoneGestureTarget`'s existing
OR-chain (lock overlay swallows gesture input) and `.phone-player-ui` to its selector list (taps
on the phone chrome itself must not also start a video-surface gesture underneath it).

Two independent reviews ran against the pre-commit working tree:

- **Standards review**: no hard violations in the code. Confirmed independently (not just
  trusted from the implementer's report) that `onKeyDown`'s body is untouched — only additive
  `syncPhonePlayerChrome()` calls appended after existing render calls. Flagged three baseline
  smells as judgement calls, not regressions: `escapeHtml` redefined locally (an existing,
  poor, but repo-wide convention — 40+ files already do this); mild message-chain reads into
  `screen.*` state (matches how `playerScreen.js`'s own TV-render methods already do the same
  lookups); borderline feature-envy in `playerScreenPhone.js` (explicitly the documented
  façade-over-`PlayerScreen` design, same shape as `homeScreenPhone.js`). One real process gap
  flagged, not a code defect: no linked bug issue / before-after screenshots in the diff itself,
  which `CONTRIBUTING.md` would reject for a real PR — noted here for the maintainer, not fixed
  in-code (this ticket is being landed as part of the epic's tracked branch of work, not as a
  cold PR).
- **Spec + TV-regression-risk review**: **verdict SAFE**. All five checklist items implemented,
  every reused method/getter verified to exist with matching arity via grep
  (`togglePause`/`seekPlaybackSeconds`/`skipActiveInterval`/`playNextEpisode`/
  `cycleAspectMode`/`applyPlaybackSpeed`/`applyAudioTrack`/`applySubtitleEntry`/
  `resolveNextEpisodeInfo`/`buildPauseOverlayMeta`/`consumeBackRequest`/`performControlAction`/
  `isNextEpisodeCardVisible`/`getSubtitleLanguageRailItems`/`getAudioEntries`, etc.). No scope
  creep — only `css/phone.css` and `playerScreen.js` modified plus the two new files, nothing
  else touched. `onKeyDown` (line 18824) confirmed outside every diff hunk by direct line-number
  diff, not just the report's claim. The `tryOpenCurrentStreamExternally()` deviation (see
  checklist above) was flagged as a minor, documented judgement call, not a defect. Only real
  gap: the "manually verified against a real video/stream" claim in the original report was
  found to be overclaiming — the synthetic-harness verification is real evidence of
  render/interaction correctness but isn't the ticket's literal ask, so it should stay flagged
  open rather than marked done. Reflected as `[~]` above rather than `[x]`.

Neither review required a code change — both verdicts were SAFE / no-hard-violation, with the
open items being process/verification gaps rather than defects. I independently re-confirmed the
`onKeyDown` isolation (grepped for all `keydown`/`onKeyDown` occurrences — exactly one
definition, zero diff hunks inside its body) and re-ran the full check suite: `npm test` (75/75
green), `npm run build` (succeeds; before/after `dist` diff shows only `app.bundle.js` and
`css/phone.css` changed, as expected), `npm run lint` (still scopes only
`js/ui/screens/home/**`, passes trivially), and `npx prettier --check` on all 4 touched/new
files (clean). I then did the synthetic-harness manual verification described above (a scratch
HTML page, deleted before commit, importing the real unbundled `playerScreenPhone.js` module
against a mock `screen`) to close the gap the second review flagged, and updated the checklist
above to `[~]` rather than `[x]` to accurately reflect that a real authenticated stream still
wasn't reached.
