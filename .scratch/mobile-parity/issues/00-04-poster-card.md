# 00-04 — Phone poster card component

**What to build:** `js/ui/components/posterCard.js` (phone-only — the existing TV poster
card rendering in `contentCard.js`/home layout files is untouched). Renders:

- Portrait variant, 2:3 locked aspect ratio, default 126×189px, `--phone-radius-poster`
  corner radius (12px).
- Landscape variant, 16:9 aspect ratio (used by episode cards and some catalog styles).
- Top-sheen overlay: a white-alpha gradient over the top ~22% of the card's height, clipped
  to its rounded shape — CSS `background: linear-gradient(...)` on a pseudo-element or
  overlay div, not a canvas effect.
- Optional watched checkmark badge overlay (top corner).
- Optional continue-watching progress bar overlay: 4px tall, fully-rounded track (white @
  30%) + accent-colored fill, positioned near the bottom edge of the artwork.
- Title + subtitle text below the card, hideable via a `hideLabels` option (mirrors
  NuvioMobile's settings toggle, though the settings UI to control it is out of scope here —
  just support the parameter).
- Tap → `onPointerActivate` (existing contract, nothing new).
- Long-press → wired via `gestureEngine.attachLongPress`'s `onLongPress` callback, which the
  calling screen supplies (Phase 1 wires it to the zoom overlay; until then, accept any
  callback and don't hardcode a specific action here).

**Blocked by:** 00-01 (tokens), 00-03 (gesture engine, for long-press wiring)

**Status:** ready-for-agent

- [ ] Both aspect-ratio variants render correctly at the specified dimensions/radius
- [ ] Top-sheen, watched badge, and progress-bar overlays render correctly and don't
      interfere with each other when combined
- [ ] `hideLabels` correctly suppresses title/subtitle rendering
- [ ] Tap and long-press both work and don't double-fire (long-press must not also trigger
      the tap callback — reuses 00-03's `suppressNextTap` mechanism)
- [ ] No TV/D-pad code path touched
- [ ] Manually verified in a phone-sized viewport
