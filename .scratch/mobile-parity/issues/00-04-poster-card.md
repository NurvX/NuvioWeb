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

**Status:** done

- [x] Both aspect-ratio variants render correctly at the specified dimensions/radius
- [x] Top-sheen, watched badge, and progress-bar overlays render correctly and don't
      interfere with each other when combined
- [x] `hideLabels` correctly suppresses title/subtitle rendering
- [x] Tap and long-press both work and don't double-fire (long-press must not also trigger
      the tap callback — reuses 00-03's `suppressNextTap` mechanism)
- [x] No TV/D-pad code path touched
- [x] Manually verified in a phone-sized viewport

## Comments

- `js/ui/components/posterCard.js`: `renderPosterCard(props)` + `bindPosterCardEvents(container,
{onLongPress, threshold, moveTolerance})`. Tap goes through the existing `onPointerActivate`
  contract for free — the card is a real `<button class="phone-poster-card ... focusable"
data-action="..." data-id="...">`, matching the `focusable`/`data-action` convention
  `onPointerActivate` consumers already use — no FocusEngine changes needed. Long-press is
  wired via `gestureEngine.attachLongPress`; `posterCard.js` doesn't hardcode what long-press
  does, the caller supplies `onLongPress(id, cardElement, event)`.
- `progress` is nullable-explicit: `null`/`undefined` omits the bar entirely (distinct from
  `0`, which renders an empty bar) via a `clampProgress()` helper that special-cases
  `null`/`undefined` before `Number()` coercion (since `Number(null) === 0` would otherwise
  silently conflate "no progress" with "0% progress").
- `js/ui/components/posterCard.test.mjs`: 13 tests covering both aspect variants,
  labels/`hideLabels`, watched badge + progress bar independently and combined, the
  `progress: 0` vs `progress: null` distinction, 0..1 clamping, and long-press/tap
  non-double-fire through the real `gestureEngine.attachLongPress` seam.
- `/code-review` (Standards + Spec axes) findings and how they were handled:
  - **Real gap, fixed**: "Manually verified in a phone-sized viewport" was unaddressed —
    only automated tests/build had been run. Verified live via a browser fixture at a
    390×844 viewport: both aspect variants, the no-image placeholder fallback, watched
    badge, and progress bar all render correctly against real images; confirmed the card's
    exact 126×189 computed dimensions; dispatched a real long-press pointer sequence and
    confirmed `suppressNextTap` gets set and the `onLongPress` callback fires with the
    correct id.
  - **Judgement call, not changed**: the spec reviewer flagged using `<button>` instead of a
    `<div>`/`<article class="... focusable" data-action="...">` (the older convention seen in
    `catalogSeeAllScreen.js`'s `.seeall-card`) as a divergence from what the implementer's own
    comment claimed to mirror. Checked: `<button>` is this epic's own established pattern
    instead — `phoneNavBar.js`'s tabs and `bottomSheet.js`'s action rows both already use
    `<button type="button" class="... focusable">` — so this is consistent with the
    mobile-parity components shipped so far, not an inconsistency. The CSS reset
    (`border:none; padding:0; margin:0; background:...; display:block;`) is sufficient since
    the button contains no text of its own (only an image and absolutely-positioned spans).
  - Minor doc gap noted by the standards reviewer (`threshold`/`moveTolerance` pass-through
    params weren't individually documented in the JSDoc) — left as a very minor style nit,
    not worth a follow-up edit given the JSDoc already explains they forward to
    `gestureEngine.attachLongPress`.
- Verified with `npm test` (44/44 passing, no existing test broken), `npm run build`, a
  before/after dist diff (only `dist/css/phone.css` changes — `posterCard.js` is tree-shaken
  out of `app.bundle.js` since nothing imports it yet, confirmed via grep), and
  `npx prettier --check`.
- Implemented via this session's Workflow tool (parallel two-axis review), which hit a
  session token limit partway through this ticket's "fix and commit" stage — the
  implementation and both reviews had already completed and were recovered from the
  workflow's journal; the manual-verification gap and this write-up were finished directly
  afterward.
