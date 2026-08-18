# 00-02 — Floating-pill bottom tab bar (`phoneNavBar.js`)

**What to build:** A new `js/ui/components/phoneNavBar.js`, following the exact reuse
pattern already established by `js/ui/components/sidebarNavigation.js` — a shared module
that each phone-mode top-level screen (Home, Search, Library, Settings, once they exist)
imports and renders into its own markup, not a persistent shell element. `renderAppShell.js`
stays untouched.

4 tabs: Home, Search, Library, Settings — Settings tab shows the active profile's avatar
(reuse whatever avatar-resolution logic the existing account/profile screens already use)
instead of a static icon. Visual treatment in `css/phone.css`: rounded-full floating pill,
bottom-center, background `rgba(28,28,30,.82)`, dropping to `.55` alpha + `backdrop-filter:
blur(24px)` (the "Haze" effect) once the page has scrolled past a small threshold —
implement via a scroll listener on the screen's scroll container, not a continuous
per-frame observer. Horizontal padding animates between 28px (expanded — icon+label shown)
and 58px (collapsed — icon only) past a 60px scroll-delta threshold, via a CSS transition on
padding, driven by a class toggle from the scroll listener. Selected tab gets an accent-color
pill highlight at 15% alpha behind its icon (`--phone-accent-*-secondary` at 15% alpha).
Active-tab state comes from `Router.current`; tap navigates via `Router.navigate`.

This ticket ships as a component with no real consumer yet (a throwaway test harness page or
manual injection is fine for verification) — Phase 1+ tickets wire it into actual screens.

**Blocked by:** 00-01 (uses the token values it defines)

**Status:** done

- [x] `phoneNavBar.js` renders the 4-tab floating pill matching the visual spec above
- [x] Scroll-driven expand/collapse and blur-on-scroll work smoothly (no jank on repeated
      rapid scroll direction changes)
- [x] Active tab is visually distinct and reflects `Router.current`
- [x] Tap on a tab calls `Router.navigate` with the correct route
- [x] No TV/D-pad code path touched; component is only ever rendered when
      `Platform.isPhoneViewport()` is true (the component itself doesn't self-gate — nothing
      calls it yet; each Phase 1+ consumer is responsible for checking `isPhoneViewport()`
      before rendering it, per ticket 00-07)
- [x] Manually verified in a phone-sized viewport

## Comments

- `renderPhoneNavBar({selectedRoute, profileState})` + `bindPhoneNavBarEvents(container,
{currentRoute, scrollRoot})` follow the exact render-string / bind-events-after-insertion
  split already used by `sidebarNavigation.js`'s `renderRootSidebar`/`bindRootSidebarEvents`,
  including native `.onclick` wiring (not dependent on FocusEngine's tap-dispatch) and the
  same "reselecting the current tab calls `onSidebarReselect?.()`" behavior.
- `profileState` is shaped exactly like `getSidebarProfileState()`'s return value — callers
  are expected to call that existing function and pass the result in, not reimplement avatar
  resolution.
- Scroll-collapse uses a checkpoint/hysteresis scheme (`lastScrollTop` only advances once
  cumulative delta crosses the 60px threshold) so small scroll jitter doesn't flicker the
  collapsed state.
- `/code-review` (Standards + Spec axes) caught two real issues, both fixed:
  1. The 3 shared SVG icons (home/search/library) were duplicated byte-for-byte from
     `sidebarNavigation.js`'s `ROOT_SIDEBAR_ITEMS`. Fixed by extracting a new exported
     `SIDEBAR_NAV_ICONS` lookup (keyed by route) in `sidebarNavigation.js` that both files now
     share — `phoneNavBar.js`'s Settings tab still intentionally diverges (avatar instead of
     the TV sidebar's gear icon), documented in a comment.
  2. The new `--phone-accent-*-secondary-rgb` tokens in `css/base.css` used comma-separated
     values consumed via legacy `rgba(var(...), n)` syntax — inconsistent with this file's
     established space-separated `--x-rgb: r g b;` + modern `rgb(var(...) / n)` convention
     (already used ~90 times in `components.css`). Fixed both the token format and
     `phone.css`'s consumption of it.
  - Not changed: the reviewer also flagged that `-rgb` siblings exist for all 7 accent
    presets while `phone.css` only consumes the "active" (Crimson) one. This mirrors ticket
    00-01's own already-accepted call to ship all 7 presets' base colors unused, ahead of a
    future theme picker — adding only some presets' alpha-compositing siblings would leave
    that set inconsistent (6 presets fully colored but not alpha-composable), so all 7 got
    the sibling token for the same reason 00-01 shipped all 7 base colors.
- Fixing `sidebarNavigation.js`'s pre-existing (unrelated) prettier violation was an
  unavoidable side effect of running the formatter on a file this ticket now also touches —
  confirmed via diff that it's pure line-wrap reformatting, no logic change.
- Verified via an ad-hoc jsdom script (real render output, real `bindPhoneNavBarEvents` tap
  dispatch, real scroll-event-driven class toggling) and a live browser fixture (phone-sized
  viewport) showing the pill, icons, selected-tab highlight, and tap correctly invoking
  `Router.navigate`.
- Before/after `npm run build` dist diff + a `find dist -type f` listing diff confirm the
  only new build output is `dist/css/phone.css`; `phoneNavBar.js` itself is tree-shaken out
  of `app.bundle.js` entirely since nothing imports it yet.
