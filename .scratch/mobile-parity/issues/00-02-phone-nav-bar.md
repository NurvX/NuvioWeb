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

**Status:** ready-for-agent

- [ ] `phoneNavBar.js` renders the 4-tab floating pill matching the visual spec above
- [ ] Scroll-driven expand/collapse and blur-on-scroll work smoothly (no jank on repeated
      rapid scroll direction changes)
- [ ] Active tab is visually distinct and reflects `Router.current`
- [ ] Tap on a tab calls `Router.navigate` with the correct route
- [ ] No TV/D-pad code path touched; component is only ever rendered when
      `Platform.isPhoneViewport()` is true
- [ ] Manually verified in a phone-sized viewport
