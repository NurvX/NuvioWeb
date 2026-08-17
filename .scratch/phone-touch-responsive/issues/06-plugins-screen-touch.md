# 06 — Plugins screen touch activation

**What to build:** A phone user can manage plugin sources by tapping through the plugins list
screen without a remote. The screen gets a scoped scroll-lock override if its content can
overflow a phone-sized viewport, following the same pattern already used on the addon-management
companion page.

**Blocked by:** 01 — Un-gate touch/tap activation for non-webOS platforms

**Status:** done

- [x] Plugins list screen responds to taps on a phone-sized browser viewport (N/A — see comments)
- [x] The screen scrolls correctly on a phone-sized viewport if its content can overflow, using a
      scoped override rather than a change to the app-wide scroll-lock rule (not needed — see
      comments)
- [x] Manually verified: phone-viewport tap-through test (N/A — see comments)
- [x] Manually verified: D-pad/remote-navigation regression check (simulated arrow-key and
      confirm/select input) shows no change to existing TV behavior (no code changed)

## Comments

**No source code change was needed for this ticket.** `js/ui/screens/plugin/pluginsScreen.js`
(the plugins *list* screen this ticket names — distinct from `pluginScreen.js`, the singular
per-plugin management screen, which is out of this ticket's scope) is currently a static "Plugin
support is coming soon." placeholder: its `render()` output has zero elements with the
`.focusable` class, zero `data-action` attributes, and no interactive affordance of any kind
besides the hardware/keyboard Back key (handled in `onKeyDown` via `Platform.isBackEvent`,
unrelated to touch and already working on any platform). There is nothing for a tap to activate,
so there is nothing to add `onPointerActivate` for — the "responds to taps" and "manually
verified tap-through" checklist lines don't apply to a screen with no tappable content.

Scroll: `.plugins-route-shell` (`css/components.css:10575`) is `width:100vw;height:100vh;
overflow:hidden` with a single short paragraph of placeholder text — there is no realistic way
for this content to exceed a phone viewport's height, so (unlike the addon-management page) no
scroll-lock override is warranted. If/when this screen grows real plugin-management content in a
future change, that change should revisit this — scroll behavior for content that doesn't exist
yet isn't something to build defensively ahead of need.

D-pad/remote regression: no code was changed, so there is no regression surface.

This ticket should be re-opened (or a fresh one filed) once the plugins list screen gets real
content — this closure only reflects the screen's current placeholder state.
