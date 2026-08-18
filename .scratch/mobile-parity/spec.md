# Phone UI parity with NuvioMobile

Status: ready-for-agent

## Problem Statement

NuvioTV Web's phone/touch support (built in the `phone-touch-responsive` effort) is purely
additive on top of the existing TV-remote design: the same D-pad-oriented markup, sidebar
navigation, and `--tv-*` CSS tokens, just made tappable. It works, but it still looks and
feels like a shrunk-down TV app on a phone. Meanwhile, `NuvioMedia/NuvioMobile`
(https://github.com/NuvioMedia/NuvioMobile) — a separate, actively developed Kotlin
Multiplatform/Compose native app for Android/iOS sharing the same Stremio-addon-ecosystem
backend and data model — has a polished, purpose-built mobile UI: a floating bottom tab bar,
bottom sheets, long-press "zoom" action menus, swipe/drag player gestures, an auto-advancing
hero pager, and a coherent design-token system. The web app's phone experience should match
that 1:1, not just be a touch-enabled version of the TV layout.

## Solution

Build a genuinely separate, parallel phone UI layered alongside the existing TV UI, not a
replacement or reflow of it. Every phone-mode screen is a new sibling render module
(`<screen>Phone.js`) that the existing screen object dispatches to when
`Platform.isPhoneViewport()` is true, exactly the way `classicHomeLayout.js` /
`gridHomeLayout.js` / `modernHomeLayout.js` are already alternate render strategies the home
screen dispatches between — phone becomes one more layout strategy, not a new architectural
concept. TV markup, `--tv-*` CSS tokens, and `FocusEngine`'s D-pad keydown path are untouched
by this effort. The data/repository/business-logic layer (catalogs, watch progress, auth,
streams, etc.) is reused unchanged — only the presentation layer is new.

The design tokens (colors, typography, spacing, radii, motion) and every screen's layout are
ported from NuvioMobile's actual source (`composeApp/src/commonMain/kotlin/com/nuvio/app/`),
not reinvented. Where a Compose-native effect has no reasonable web equivalent within this
project's Chromium-63/68 compatibility floor and no-framework constraint (spring physics,
particle disintegration, real-time GPU blur-behind), a documented lower-fidelity CSS
substitute is used instead of attempting literal pixel/motion parity.

New shared infrastructure this effort introduces: a viewport+platform-reactive mode switch
(`Platform.isPhoneViewport()`), a pure Pointer-Events gesture layer (`gestureEngine.js`) for
long-press/swipe/drag/pager interactions that `FocusEngine`'s single-tap contract doesn't
cover, and a dedicated `css/phone.css` stylesheet (all rules scoped to the existing
`max-width: 600px` breakpoint) plus a small set of reusable phone components (bottom tab bar,
bottom sheet, poster card, shelf/row, skeleton loader) that most screens build on.

## Source of truth: NuvioMobile design values

Extracted from `composeApp/src/commonMain/kotlin/com/nuvio/app/core/ui/{Tokens,ThemeColors,
TypeScale}.kt` in a shallow clone of https://github.com/NuvioMedia/NuvioMobile
(`git clone --depth 1`). Re-clone and re-check against these files if a value below is ever
in doubt — this section is the durable, in-repo record; nothing outside `.scratch/` should be
treated as more authoritative.

**Colors** — shared (theme-independent): `textPrimary #F5F7F8`, `textSecondary #B8BEC5`,
`textMuted #969CA3`, `borderDefault #252A2A`, `success #66BB6A`, `warning #FFC857`,
`danger #E36A8A`, `info #42A5F5`, `overlayScrim rgba(0,0,0,.56)`.

Accent presets (`secondary / secondaryVariant / background / backgroundElevated /
backgroundCard / focusRing`) — NuvioMobile's `AppTheme` enum, `CRIMSON` declared first (and
treated here as the default until a theme picker exists to override it):

| Preset  | secondary | variant   | background | bg-elevated | bg-card   | focus-ring |
| ------- | --------- | --------- | ---------- | ----------- | --------- | ---------- |
| Crimson | `#E53935` | `#C62828` | `#0D0D0D`  | `#1A1A1A`   | `#241A1A` | `#FF5252`  |
| Ocean   | `#1E88E5` | `#1565C0` | `#0D0D0F`  | `#1A1A1E`   | `#1A1F24` | `#42A5F5`  |
| Violet  | `#8E24AA` | `#6A1B9A` | `#0D0D0F`  | `#1A1A1E`   | `#1F1A24` | `#AB47BC`  |
| Emerald | `#43A047` | `#2E7D32` | `#0D0D0D`  | `#1A1A1A`   | `#1A241A` | `#66BB6A`  |
| Amber   | `#FB8C00` | `#EF6C00` | `#0F0D0D`  | `#1E1A1A`   | `#24201A` | `#FFA726`  |
| Rose    | `#D81B60` | `#C2185B` | `#0D0D0D`  | `#1A1A1A`   | `#241A1F` | `#EC407A`  |
| White   | `#F5F5F5` | `#E0E0E0` | `#0D0D0D`  | `#1A1A1A`   | `#222222` | `#FFFFFF`  |

White is the only preset with an `onSecondary` value (`#111111`) in the source — its
secondary color is near-white, so it needs an inverted (dark) text color where the other 6
presets' darker/saturated secondary colors already read fine against light text. This is a
real source asymmetry, not a porting inconsistency.

**Typography** (JetBrains Sans — Bold/SemiBold/Regular only; size/line-height in sp, mapped
1:1 to px):

| Name        | size | line-height | weight   | tracking |
| ----------- | ---- | ----------- | -------- | -------- |
| labelXs     | 11   | 14          | SemiBold | —        |
| labelSm     | 12   | 15          | SemiBold | —        |
| bodySm      | 13   | 18          | Regular  | —        |
| bodyMd      | 14   | 20          | Regular  | —        |
| bodyApp     | 15   | 22          | Regular  | —        |
| bodyLg      | 16   | 22          | Regular  | —        |
| titleSm     | 18   | 22          | SemiBold | —        |
| titleMd     | 22   | 26          | SemiBold | —        |
| headline    | 26   | 30          | SemiBold | -0.8     |
| titleLg     | 28   | 32          | SemiBold | —        |
| displaySm   | 32   | 36          | Bold     | —        |
| pageDisplay | 38   | 42          | Bold     | -1.2     |
| displayMd   | 48   | 52          | Bold     | —        |

**Spacing scale (px)**: 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36,
40, 48, 56, 64, 72, 80, 96. Semantic: `screenHorizontal 16, sectionGap 24, listGap 12,
railGap 14, cardPadding 18, sheetPadding 20`.

**Radius scale**: `xs 4, sm 6, md 8, lg 12, xl 16, xxl 24, full 999` (pill). Semantic:
`card=xxl(24), compactCard=lg(12), sheet=xxl(24), button=xl(16), chip=full, poster=lg(12)`.

**Motion**: durations `instant 0, fast 150, normal 220, sheetEnter 300, sheetExit 250,
slow 400, cinematic 700` (ms). Easings: `standard cubic-bezier(.2,0,0,1)`,
`emphasized cubic-bezier(.2,0,0,1)` (source defines these two as byte-identical curves — not
a porting error, the app's simplified token set aliases "emphasized" to the same curve as
"standard"), `decelerate cubic-bezier(0,0,0,1)`, `accelerate cubic-bezier(.3,0,1,1)`.

**Poster card**: portrait `126×189px` (locked 2:3 ratio), radius `12px` default — both
independently user-adjustable in NuvioMobile's settings (not required to be adjustable here
until a settings surface for it is ticketed). Landscape variant `16:9`.

## Implementation Decisions

- **Parallel phone UI, not a reflow.** Confirmed with the maintainer: build new nav
  shell/screen markup/CSS/gesture primitives activated only under the existing
  `max-width: 600px` breakpoint; TV markup/CSS/FocusEngine stay completely untouched.
- **Runtime switch**: `Platform.isPhoneViewport()` = `Platform.isBrowser() &&
window.matchMedia("(max-width: 600px)").matches`, checked at the top of each phone-eligible
  screen's `render()`, delegating to a sibling `<screen>Phone.js` module. Reactive via a
  `matchMedia` listener registered in `mount()` — resizing a phone-width window back to
  desktop width flips back to TV mode live, matching how `--phone-*` CSS tokens already work.
  `Router.routes` is unchanged — the fork happens inside each screen's `render()`.
- **Design tokens are ported values, not new design work.** Every color/spacing/radius/type
  value comes from NuvioMobile's `core/ui/{Tokens,ThemeColors,TypeScale}.kt` — see ticket
  00-01 for the full extracted list.
- **New gesture layer coexists with `FocusEngine`, doesn't replace it.**
  `js/ui/navigation/gestureEngine.js` provides `attachLongPress`/`attachSwipe`/`attachPager`
  (pure Pointer Events, no framework). A long-press that resolves sets a
  `dataset.suppressNextTap` flag; `FocusEngine.handlePointerClick` gets a one-line check to
  consume that flag so the trailing click doesn't also fire `onPointerActivate`. This is the
  only change to existing shared infrastructure in the whole effort, and it's inert on TV.
- **CSS lives in a new `css/phone.css`**, not mixed into the ~21,800-line `components.css`.
  Every rule scoped to `@media (max-width: 600px)`. Every phone-only class prefixed
  `phone-` so nothing can collide with existing TV class names.
- **Reusable primitives before screens.** Phase 0 builds the bottom tab bar, bottom sheet,
  poster card, shelf/row, and skeleton-loader components with zero screen consumers, the
  same "infrastructure ships standalone" discipline as the prior effort's phone-token ticket.
  Phase 1+ screens are consumers, not re-inventors, of these.
- **Bottom-sheet back-stack integration** follows the existing
  `PosterOptionsDialogController` pattern already used in `castDetailScreen.js`/
  `catalogSeeAllScreen.js` (`consumeBackRequest() { return this.closeXMenu(); }`) — no new
  backstack concept.
- **Fidelity trade-offs are documented, not silently dropped**: spring-physics zoom overlay →
  CSS transition/transform; particle disintegration → fade+scale+collapse transition; Haze
  continuous blur-behind → `backdrop-filter` (already proven in this repo) with a flat-color
  fallback if it proves too costly; player brightness drag → CSS dim overlay (no OS
  brightness API exists on web).

## Testing Decisions

- `npm run build` + before/after `dist/` diff on every ticket, confirming no unintended TV
  output changes (same discipline as the prior effort).
- `node:test` + jsdom for `gestureEngine.js`'s extracted pure classification functions
  (long-press timing, swipe direction/velocity, pager snap index), following
  `js/ui/navigation/focusEngine.test.mjs`'s pattern of testing the real seam, not just an
  internal guard.
- Manual phone-viewport check (Chrome device-toolbar / resized window) plus a keyboard-based
  D-pad simulation pass (Tab/Enter/arrows) on the same screen after every ticket, to confirm
  zero TV regression — mirrors the prior effort's manual test matrix.
- Where a ticket needs real signed-in backend data to verify fully (Home with real catalogs,
  Library, Continue Watching, Player), that's flagged explicitly in the ticket rather than
  silently skipped — this sandbox/session may not always have reachable credentials.

## Out of Scope

- Any change to TV/Tizen/webOS rendering, `--tv-*` tokens, or `FocusEngine`'s D-pad keydown
  path.
- Pixel/motion-perfect reproduction of Compose-native effects that have no reasonable web
  equivalent at this project's compatibility floor (spring physics, particle disintegration,
  real OS brightness control) — documented lower-fidelity substitutes are used instead.
- A user-facing "classic vs floating pill" nav-bar style toggle (NuvioMobile has both; this
  effort ships the floating pill only, matching the mobile app's default).
- Poster-card width/radius user customization UI (NuvioMobile has this as a settings
  feature; this effort ports the visual system with fixed default values, not the settings
  surface to customize them).
- The home screen's swipeable-row transform-positioning system remains what it is —
  `phoneShelf.js`'s horizontal scroll is native browser scroll, not a port of that specific
  TV mechanism (which was separately deferred in the prior effort).
- **NuvioMobile's Downloads screen has no counterpart to rebuild.** NuvioWeb has no
  filesystem-backed download manager, no offline playback, and no P2P-download feature at
  all today — this isn't a UI port, it would be new functionality requiring its own scoping,
  backend/storage design, and almost certainly its own spec, independent of this UI-parity
  effort. Not ticketed here; flagged for a separate conversation if wanted.

## Further Notes

- NuvioMobile source was surveyed via a shallow clone
  (`git clone --depth 1 https://github.com/NuvioMedia/NuvioMobile.git`) — re-clone if the
  extracted values in ticket 00-01 or the screen-by-screen descriptions in later tickets need
  re-checking against the live upstream source.
- This effort's tickets are numbered `NN-MM` (phase-ticket) instead of a flat `NN` sequence
  because of the phase structure; `docs/agents/issue-tracker.md`'s numbering convention still
  applies within each phase.
