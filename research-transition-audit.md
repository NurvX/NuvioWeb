# Research: Audit current ViewTransition + propose Preact replacement

Ticket: #29 (map #28). Question: what does the current transition stack do
(router.js `startViewTransition` + `navDirection` CSS, LiquidGlass refresh,
mount timing), and what is the smallest custom Preact transition system that
replaces it while honoring motion tokens (fast 150 / normal 220 / sheetEnter
300 / sheetExit 250) and gestureEngine long-press/swipe guards?

Method: local primary sources only — `js/ui/navigation/router.js`,
`css/phone.css`, `css/base.css`, `js/ui/navigation/gestureEngine.js`,
`js/ui/navigation/screen.js`, `js/ui/theme/liquidGlass.js`,
`js/ui/components/nuvioDialog.js`, `js/app.js`, plus motion token source
#11 and representative screen mount/cleanup (`homeScreen.js`,
`metaDetailsScreen.js`). No implementation; proposal only.

## 1. Current stack — how a phone screen change animates today

### 1.1 Router `navigate()` owns the transition (router.js:238-337)

- `performDomSwap` (router.js:260-286) is the atomic swap: capture outgoing
  route state (router.js:264 via `captureCurrentRouteState`, RouteStateStore),
  call outgoing `cleanup()` (router.js:265), push `{route, params}` onto
  `this.stack` unless `skipStackPush` or previous route is in
  `NON_BACKSTACK_ROUTES` (router.js:262,266-271), set
  `current`/`currentParams` (router.js:277-278), resolve navigation context
  (restored state / back flag, router.js:279-283), then
  `await Screen.mount(params, navigationContext)` (router.js:285).
- ViewTransition wraps exactly that swap (router.js:288-302):
  `useViewTransition = typeof document.startViewTransition === "function" && this.current`
  (router.js:288) — first navigation after boot (`this.current == null`) never
  transitions. Direction flag is set **before** the transition starts:
  `document.documentElement.dataset.navDirection = isBackNavigation ? "back" : "forward"`
  (router.js:290-292). Then
  `document.startViewTransition(() => performDomSwap())` and
  `await transition.finished` (router.js:294-295); failure (rapid navigations,
  skipped transitions) falls through to `catch (_)` with DOM already swapped
  (router.js:296-299). Non-supporting browsers take the plain
  `await performDomSwap()` path (router.js:300-302).
- Post-transition ordering is fixed: `LiquidGlassController.refresh()`
  (router.js:304) runs **after** `transition.finished`, then perf log
  (router.js:305-312), then the stale-navigation guard
  (`current !== routeName || currentParams !== targetParams` → return without
  writing history, router.js:314-318), then history write
  (`replaceState` on first init / `fromHistory` / `replaceHistory` /
  non-backstack previous, else `pushState`, router.js:324-336).

### 1.2 `navDirection` CSS — iOS-style slide, root snapshot only (phone.css:5118-5178)

- Four keyframes: `phone-slide-in-from-right` (phone.css:5119-5128),
  `phone-slide-out-to-left` (phone.css:5130-5139),
  `phone-slide-in-from-left` (phone.css:5141-5150),
  `phone-slide-out-to-right` (phone.css:5152-5161). All are 30% translateX +
  opacity fades.
- Forward (default): `::view-transition-old(root)` →
  `phone-slide-out-to-left`, `::view-transition-new(root)` →
  `phone-slide-in-from-right` (phone.css:5164-5170). Back
  (`:root[data-nav-direction="back"]`) swaps `animation-name` to
  `phone-slide-out-to-right` / `phone-slide-in-from-left` (phone.css:5172-5178).
- Hardcoded timing: `250ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both`
  (phone.css:5165,5169). This curve/duration matches **neither** motion token
  (see §3) — it is a one-off, and `sheetExit 250` matching `250ms` is
  coincidence of duration only (wrong curve).
- Scope notes: `phone.css` is now mobile-first base styles with no media-query
  wrapper (phone.css:1-3), so these `::view-transition` rules are global.
  Only the `root` snapshot group is styled — no per-element
  `view-transition-name` anywhere, so outgoing/incoming screens cross-fade as
  full-page snapshots; tab bar, sheets, hero content all move as one bitmap.
  `dataset.navDirection` is never cleared — it persists until the next
  `navigate()` overwrites it.

### 1.3 Mount timing — async mount _inside_ the transition callback

- `performDomSwap` awaits `Screen.mount()` (router.js:285). Representative
  mounts do real work synchronously before first paint: `homeScreen.js:7546`
  (`mount` → `ScreenUtils.show(container)` at homeScreen.js:7558, then focus
  restore, data-flow decisions), `metaDetailsScreen.js:1739-1741`
  (`mount` → `ScreenUtils.show(this.container)`), with teardown in
  `homeScreen.js:10095` (`cleanup`) and
  `metaDetailsScreen.js:4043-4105` (`cleanup` → `ScreenUtils.hide`, which
  `display:none` + `replaceChildren()` clears DOM, screen.js:11-25).
- `show()` only flips `display` to `block` (screen.js:2-9); `hide()` clears
  children (screen.js:18-24). So during the VT update callback the old screen
  is cleaned/hidden and the new screen's `mount()` (including skeleton render
  - async data fetch kickoff) runs before the "new" snapshot is taken. Heavy
    mounts (home data flow) therefore extend the snapshot delay; rapid
    double-taps rely on the `catch` + stale guard (router.js:296-299,314-318).
- `back()` (router.js:362-420) is the asymmetry: stack-pop path
  (router.js:403-419) calls `captureCurrentRouteState` + `cleanup` + direct
  `await mount(previousParams, {isBackNavigation:true})` with **no**
  `startViewTransition` and **no** `navDirection` write. Only
  `popstate`-driven back (router.js:205-211 → `navigate(..., isBackNavigation:true)`)
  animates. Programmatic `Router.back()` pops are instant cuts today.

### 1.4 LiquidGlass refresh — after transition, teardown/re-init (liquidGlass.js:79-114)

- `LiquidGlassController.refresh()` (liquidGlass.js:83-106) is called from
  `Router.navigate` after the transition (router.js:304) and from dialog
  open/close (nuvioDialog.js:207,361). Boot only `init()`s once (app.js:234).
- Semantics: if no instance, `init()` (liquidGlass.js:84-86); else diff current
  `GLASS_SELECTOR` matches (`.home-sidebar, .nuvio-dialog-panel,
.player-controls-bar, .settings-slide-panel`, liquidGlass.js:7-8) against
  `instance.glassSet` — changed set → `destroy()` + `init()` (full WebGL
  re-init, liquidGlass.js:100-102), unchanged → `markChanged()`
  (liquidGlass.js:104). Header comment is explicit that the library has no
  add/remove API so teardown/re-init is the cheapest correct option
  (liquidGlass.js:79-82).
- Consequence for any replacement: glass must still refresh **after** the new
  DOM is in place and settled (post-enter), not mid-animation — the current
  post-`finished` placement is the behavior to preserve. Dialogs already
  refresh independently, so screen transitions must not double-destroy glass
  while a dialog is open (both call the same idempotent `refresh()`).

## 2. Gesture guards the replacement must not break (gestureEngine.js + router.js:148-166)

- Long-press (gestureEngine.js:50-152): defaults `threshold 500ms`,
  `moveTolerance 10px` (gestureEngine.js:10-11). On threshold without excess
  move: sets `el.dataset.suppressNextTap = "1"`, fires `onLongPress`, then
  hold pair `onHoldStart` (gestureEngine.js:104-114). Release before threshold
  without excess move fires `onTap` via `resolveTapOutcome`
  (gestureEngine.js:27-33,127-133). Router's document click dispatch consumes
  the flag: `if (target.dataset.suppressNextTap) { delete; preventDefault;
stopPropagation; return; }` (router.js:156-161) — restored in 540060e as the
  FocusEngine-deletion successor. Any custom transition that re-parents,
  replaces, or re-renders the pressed node mid-gesture would drop the dataset
  flag and the long-press would leak a tap activation. Seam constraint: never
  touch the pressed subtree during a transition; animate screen-level wrappers
  only.
- Swipe (gestureEngine.js:160-274): `classifySwipe` qualifies on distance
  (`minDistance 24px`) **or** velocity (`minVelocity 0.15 px/ms`)
  (gestureEngine.js:13-14,160-177). `attachSwipe` reports live
  `onSwipeMove({dx,dy})` + terminal `onSwipeEnd({direction,distance,velocity,
cancelled})`, optional `onDismiss` when direction matches `dismissDirection`
  (defaults to `"down"` on y-axis for bottom sheets, `null` on x-axis,
  gestureEngine.js:190-201,231-257). Screens attach these in mount lifecycle;
  a screen-level enter/exit transform on an ancestor must not intercept or
  re-emit pointer events — keep transitions to compositor-only properties
  (`transform`/`opacity`) on the screen wrapper and add no pointer handlers.
- Pager (gestureEngine.js:290-389): `computeSnapIndex` advances one item past
  `distanceThreshold 0.3 × itemWidth` or `velocityThreshold 0.3 px/ms`
  (gestureEngine.js:14-15,290-309); `attachPager` wraps `attachSwipe(x)` with
  auto-advance timer, pausing on `onSwipeStart` (gestureEngine.js:362-381).
  Hero auto-advance timers are stopped in screen `cleanup()` (e.g.
  homeScreen.js:10117 `stopHeroRotation()`), so transitions don't need to
  manage pager timers — but exit must not freeze a mid-drag pager mid-frame
  in a snapshot that then lingers.

## 3. Motion tokens — source of truth and current drift

- Canonical web tokens (css/base.css:241-254), ported from NuvioMobile
  `Tokens/ThemeColors/TypeScale.kt` per #11: durations `instant 0`,
  `fast 150`, `normal 220`, `sheetEnter 300`, `sheetExit 250`, `slow 400`,
  `cinematic 700` (ms) (base.css:242-248); easings `standard
cubic-bezier(0.2,0,0,1)`, `emphasized` aliased to the same curve
  (intentional, base.css:249-250), `decelerate cubic-bezier(0,0,0,1)`,
  `accelerate cubic-bezier(0.3,0,1,1)` (base.css:251-254).
- Ticket #29 scope is `fast 150 / normal 220 / sheetEnter 300 / sheetExit 250`.
- Adoption: `phone.css` already uses the vars pervasively (tab bar
  `var(--phone-motion-normal) var(--phone-ease-standard)` phone.css:28-29,
  tab highlight `fast` phone.css:64,81, sheets `sheet-enter` phone.css:148,163,
  player/dialog/skeleton `normal`/`slow` phone.css:531,655-657,3316,3407,3423,
  etc. — 48 `phone-motion|phone-ease` hits in phone.css). The **only**
  transition-timing outlier is the ViewTransition block (phone.css:5164-5178),
  hardcoded to `250ms cubic-bezier(0.25,0.46,0.45,0.94)`.
- Accessibility gap: the sole `prefers-reduced-motion` rule covers settings
  preview animations (components.css:9269-9281). ViewTransitions have no
  reduced-motion short-circuit — a replacement must add one (instant cut).

## 4. Replacement seam proposal — smallest custom Preact transition

Goal per map #28 standing preference Q2: REPLACE native ViewTransition with a
custom Preact transition system. Smallest seam that honors §2+§3 and preserves
§1 behavior:

1. **Cut point is exactly router.js:288-302.** Replace the
   `useViewTransition ? startViewTransition(...) : performDomSwap()` branch
   with `await playScreenTransition({ direction, mountFn: performDomSwap })`.
   Keep everything around it untouched: `performDomSwap` body (state capture,
   cleanup, stack push, context resolve, mount — router.js:260-286), glass
   refresh after settle (router.js:304), stale guard (router.js:314-318),
   history write (router.js:324-336), click `suppressNextTap` dispatch
   (router.js:148-166), popstate/back routing (router.js:167-224,362-420).
   Route `back()`'s stack-pop path (router.js:403-419) through the same helper
   with `direction:"back"` — this both removes the §1.3 animation asymmetry
   and gives swipe-back (a future gesture) one place to hook.
2. **New module `js/ui/navigation/screenTransition.jsx`** (Preact, no new
   deps) owning two things: (a) a `ScreenTransitionHost` wrapper rendering the
   outgoing screen node with an exit class and the incoming node with an enter
   class on screen-level wrappers only (never the pressed subtree — §2
   constraint); (b) the `playScreenTransition` orchestrator:
   `set direction attr → mount new (hidden/off-stage) → force reflow →
add enter/exit classes → await token duration → cleanup classes`.
   Durations read from the CSS vars (`fast/normal/sheetEnter/sheetExit`) so
   JS and CSS can't drift again; screen push/pop uses `normal 220 +
standard` (the token-correct successor to today's hardcoded 250ms slide);
   sheets keep `sheetEnter 300 / sheetExit 250`; micro feedback keeps
   `fast 150`. Curves: `standard` for enter, `accelerate`-flavored exit
   already exists as a token — exact curve assignment graduates in prototype
   #30, but both sides must come from `base.css:251-254`, never literals.
3. **Mount-timing contract (fixes §1.3 fragility):** mount-then-animate, not
   animate-around-mount. `mountFn` (today's `performDomSwap`) completes first
   (new DOM present but enter-class held at `translateX(±30%) + opacity 0`,
   reusing the existing keyframe shapes phone.css:5119-5161 re-expressed as
   classes), then the enter animation plays; exit plays on the _preserved_
   outgoing snapshot node (keep one detached outgoing node alive for 220ms
   instead of `ScreenUtils.hide` clearing it immediately — the single
   lifecycle change, scoped to the transition host). This removes dependence
   on `updateCallback` promise semantics and makes heavy mounts (home) show
   skeleton-under-slide rather than stretching snapshot delay.
4. **Guardrails baked in, not bolted on:** `prefers-reduced-motion: reduce`
   → skip classes, instant swap (closes §3 gap); `transition.finished`-style
   await replaced by token-duration timeout + `transitioncancel`/`pointerdown`
   interruption → settle immediately and still run glass refresh + stale
   guard; no pointer listeners added (compositor-only `transform`/`opacity`
   so long-press `suppressNextTap`, swipe `classifySwipe`, and pager snap
   are unaffected); overlapping navigations reuse the existing stale guard
   (router.js:316-318) — second `playScreenTransition` wins, first resolves
   without writing history.
5. **Glass ordering preserved:** `LiquidGlassController.refresh()` stays
   where it is (post-settle, router.js:304) — called after enter completes
   (or immediately on reduced-motion/interrupt). No glass API change needed;
   teardown/re-init cost is unchanged, just triggered after class cleanup
   instead of after `transition.finished`.

What #30 prototype must decide (explicitly out of this audit): exact
enter/exit curve pair, whether outgoing node stays interactive during its
220ms exit, and swipe-back wiring into the same host. What it must NOT redo:
history semantics, RouteStateStore capture/restore, or gesture thresholds —
all preserved as-is.

## Sources

| Claim                                                                | Primary source                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| VT branch, navDirection set, `finished` await, fallback              | js/ui/navigation/router.js:288-302                                                                              |
| DOM swap steps (capture/cleanup/stack/mount)                         | js/ui/navigation/router.js:260-286                                                                              |
| Glass refresh after transition; stale guard; history write           | js/ui/navigation/router.js:304,314-336                                                                          |
| `back()` stack-pop has no VT                                         | js/ui/navigation/router.js:403-419                                                                              |
| Click `suppressNextTap` consume                                      | js/ui/navigation/router.js:148-166                                                                              |
| Slide keyframes + hardcoded 250ms curve + back override              | css/phone.css:5118-5178                                                                                         |
| phone.css is base/mobile-first, no wrapper                           | css/phone.css:1-3                                                                                               |
| Motion tokens fast/normal/sheetEnter/sheetExit + easings             | css/base.css:241-254                                                                                            |
| Token adoption across phone.css (48 hits)                            | css/phone.css:28-29,64,148,163,531,655-657,3316,3407,3423                                                       |
| Long-press threshold/tolerance, suppressNextTap set, hold pair       | js/ui/navigation/gestureEngine.js:10-11,50-152 (esp. 104-114)                                                   |
| Tap outcome / swipe classify / attachSwipe / pager snap              | js/ui/navigation/gestureEngine.js:27-33,160-274,290-389                                                         |
| Glass selector, no add/remove API, destroy+init vs markChanged       | js/ui/theme/liquidGlass.js:7-8,79-106                                                                           |
| Dialog glass refresh sites; boot glass init                          | js/ui/components/nuvioDialog.js:207,361; js/app.js:234                                                          |
| show/hide semantics (hide clears children)                           | js/ui/navigation/screen.js:2-25                                                                                 |
| Mount→show / cleanup→hide examples                                   | js/ui/screens/home/homeScreen.js:7546,7558,10095; js/ui/screens/detail/metaDetailsScreen.js:1739-1741,4043-4105 |
| Reduced-motion gap (settings-only)                                   | css/components.css:9269-9281                                                                                    |
| Motion token source of truth (NuvioMobile port) + values             | Issue #11 body (Durations/Easings table)                                                                        |
| Map scope: REPLACE VT; tokens/sheets/virtual-scroll/keep-alive prefs | Issue #28 body (Q1-Q5 prefs, tickets #29-#33)                                                                   |
