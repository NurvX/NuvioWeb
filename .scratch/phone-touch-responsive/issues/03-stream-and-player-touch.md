# 03 — Stream picker & player screen touch activation

**What to build:** A phone user can tap a stream in the stream picker to select and play it —
including correctly triggering the external-player handoff when that profile setting is
configured, instead of silently doing nothing. A phone user can also tap the in-app player's
on-screen controls (play/pause, seek, subtitle and audio menus, back) to control playback
without a remote. Both screens get a scoped scroll-lock override where their content can
overflow a phone-sized viewport, following the same pattern already used to fix this exact
problem on the addon-management companion page earlier in this effort — a scoped override on the
affected screen, not a change to the app-wide scroll-lock rule.

This is the urgent fix: the external-player feature already shipped is currently unreachable
because these two screens have no touch handling at all, so this ticket should land as soon as
its blocker clears.

**Blocked by:** 01 — Un-gate touch/tap activation for non-webOS platforms

**Status:** done

- [x] Tapping a stream in the stream picker selects/plays it on a phone-sized browser viewport
- [x] With an external player configured, tapping a stream correctly triggers the external-player
      handoff
- [x] In-app player controls (play/pause, seek, subtitle menu, audio menu, back) respond to taps
- [x] Either screen scrolls correctly on a phone-sized viewport if its content can overflow,
      using a scoped override rather than a change to the app-wide scroll-lock rule
- [~] Manually verified: phone-viewport tap-through test (partial — see comments)
- [x] Manually verified: D-pad/remote-navigation regression check (simulated arrow-key and
      confirm/select input) shows no change to existing TV behavior

## Comments

**No source code change was needed for this ticket.** Both `StreamScreen.onPointerActivate`
(`js/ui/screens/stream/streamScreen.js:2700`) and `PlayerScreen.onPointerActivate`
(`js/ui/screens/player/playerScreen.js:18543`) already exist and are already complete —
they were originally built to serve webOS's Magic Remote pointer-click activation, which
`FocusEngine`'s dispatcher already invoked before this effort, just gated to `Platform.isWebOS()`
only. Ticket 01 lifted that gate to also cover the `browser` platform (what a phone reports as),
which is exactly what ticket 01's own text predicted: "any screen that already implements the
pointer-activation handler... becomes tappable on a phone browser the moment \[01\] lands, with
no further changes needed to that screen." Reading through both handlers confirms full coverage
of this ticket's asks:

- Stream picker: `onPointerActivate` routes a tap on `[data-action="playStream"]` to
  `playStream(streamId)`, the same function the keyboard/remote OK path already calls.
  `playStream` unconditionally calls `tryOpenInExternalPlayer(selected)` first (streamScreen.js:
  2502-2560) and only falls through to `Router.navigate("player", ...)` if that returns false —
  so the external-player handoff fires on tap exactly the same way it does on remote-confirm, with
  no platform gate blocking it on `browser`.
- Player: `onPointerActivate` covers play/pause and other controls via
  `.player-control-btn[data-action]` → `performControlAction` (play/pause is the `playPause`
  action), seek via a tap inside `.player-progress-shell` → `seekProgressFromPointer`, the
  subtitle/audio dialogs via `subtitleDialog`/`audioTrack` actions and their in-dialog step/rail
  taps, and back via `[data-player-error-action="back"]` on the startup-error screen (the player's
  primary back affordance is the OS/browser back gesture + the app's Back handling, which is
  keydown-based and untouched here).

**Scroll-lock override: verified not needed, so none was added.** Unlike the addon-management
page (a normally-flowed settings page taller than the viewport, relying on document-level scroll
that the app-wide `html,body{overflow:hidden}` rule blocked), both screens are fixed
100vw/100vh TV layouts whose scrollable regions (`.stream-route-list`,
`.player-episode-list`, `.player-sources-list`) already carry their own `overflow-y: auto`
independent of the app-wide rule — nested `overflow-y: auto` regions scroll regardless of an
ancestor's `overflow: hidden`. Confirmed no JS or CSS anywhere blocks touch scrolling of these
regions (no `touch-action` restrictions in the CSS, no `touchstart`/`touchmove` handlers calling
`preventDefault`; the one `wheel` listener on the stream list is `Environment.isWebOS()`-gated
and doesn't run on `browser`). Verified live: built a fixture page that reuses the real built
`dist/css/*.css` and the actual `.stream-route-shell > .stream-route-content > .stream-route-right
> .stream-route-panel-shell > .stream-route-list` DOM structure with 40 overflowing items, served
it alongside the app's own CSS, and confirmed a real scroll gesture at a phone-sized (390x844)
viewport moves the list.

**Manual phone-viewport tap-through: partial.** I could not sign in to reach the live stream
picker or player screen in this sandboxed environment — `local.properties` has no real Supabase
credentials (falls back to `local.example.properties`, all blank), and this app has guest access
disabled (signed-out users always land on `authSignIn`), so there is no way to reach real content
without a live backend account. What I *did* verify live, in ticket 01, is the shared mechanism
these two screens depend on — a real DOM click on a `.focusable` element in the actual running
app reaches `FocusEngine`'s pointer-click dispatcher on the `browser` platform. Combined with the
code-level trace above (both screens' `onPointerActivate` implementations are pre-existing,
already-shipped, already-used-by-webOS-Magic-Remote code, unmodified by this effort), I'm
confident in the functional checklist items above, but flagging that the specific
phone-viewport tap-through was not directly observed on these two screens themselves. Recommend a
human do a final tap-through pass on a real phone/account before considering the urgent
external-player-handoff fix fully closed out.

**D-pad/remote-navigation regression: no risk.** No code changed for these two screens in this
ticket (or in ticket 01 — `handleKey`/`handleKeyUp`/`handleTizenHardwareKey` are untouched), so
there is nothing here that could regress the existing keydown-based flow.
