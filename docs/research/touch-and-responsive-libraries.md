# Touch/Swipe Gestures & Responsive Mobile Layout — Library Research

Date: 2026-08-17
Scope: primary-source research only, no code changes. Answers the question "should we
adopt a library for touch/swipe gesture support and phone-width responsive layout, or
build on native platform APIs?" against this repo's constraints:

- Hard compat floor: Chromium **63** (`scripts/compatibilityPolicy.mjs`, `chromiumVersion: 63`).
- Existing D-pad focus engine (`js/ui/navigation/focusEngine.js`) must stay as-is; touch is additive.
- `js/ui/screens/home/homeScreen.js` rows are scrolled via manual `translateX/translateY`
  transforms driven by keydown handlers, not native scroll containers.
- Lean dependency posture: only `dashjs`, `hls.js`, `jszip`, `libbitsub` today (all
  playback/codec, none UI/gesture related). Bundle size and legacy-engine safety matter.

---

## 1. Touch/swipe gesture libraries

### Hammer.js

**Maintenance status — mixed picture, but functionally stalled as a library you'd add today.**

- npm package `hammerjs`: latest published version is **2.0.8**, published **2016-04-22**.
  Confirmed directly from the npm registry API (`registry.npmjs.org/hammerjs` →
  `dist-tags.latest = "2.0.8"`, `time["2.0.8"] = "2016-04-22T16:14:57.222Z"`). No newer
  version has ever been published to npm — the `time.modified` field on the registry
  entry (2022-11-18) reflects metadata/deprecation-notice edits, not a new release.
  Source: https://registry.npmjs.org/hammerjs
- GitHub repo `hammerjs/hammer.js`: **not archived** (`archived: false` via
  `api.github.com/repos/hammerjs/hammer.js`), and the repo has **317 open issues**. Commit
  history on the default branch (`master`) tapers off in 2019 — the most recent commits
  found via `api.github.com/repos/hammerjs/hammer.js/commits` are from **2019-05-28**
  (merges of two stale PRs) and **2019-05-10**. The repo's `pushed_at` timestamp is much
  more recent (2026-01-04) but that reflects _some_ ref being pushed to (e.g. a
  branch/tag/CI artifact), not new commits landing on `master` — no corresponding new
  commits or releases appear in the commit/tag/release listings.
  Source: https://api.github.com/repos/hammerjs/hammer.js,
  https://api.github.com/repos/hammerjs/hammer.js/commits,
  https://api.github.com/repos/hammerjs/hammer.js/tags (last tag: `v2.0.8`),
  https://api.github.com/repos/hammerjs/hammer.js/releases (0 GitHub Releases exist at all)
- **No actively-maintained fork inherits the `hammerjs` name space in a way that changes
  this calculus.** Searching the npm registry directly found no package published as
  `@egjs/hammerjs` (`registry.npmjs.org/@egjs/hammerjs` → `404 Not Found`). (Note: `egjs`
  publishes its own unrelated gesture-recognition components today, but not a drop-in
  Hammer.js fork under that name — this claim should be re-verified against
  `npmjs.com/org/egjs` if a specific egjs package is being considered.)
- **Bundle size**: `hammer.min.js` from the published 2.0.8 package is **20,765 bytes
  minified / 7,359 bytes gzipped** (downloaded directly from
  `unpkg.com/hammerjs@2.0.8/hammer.min.js` and gzip'd locally). This is a full multi-touch
  gesture recognizer (pan, pinch, rotate, swipe, tap, press) — much more surface area than
  "detect a swipe."
- **Chrome-63 compatibility**: the shipped source is old-style ES5 (pre-2016 authoring
  target), so it runs fine on Chromium 63 with no transpilation needed. This is not the
  blocking issue.

**Verdict on Hammer.js: the "is it abandoned" framing undersells the real problem.** It is
not formally archived/deprecated, but it has had zero npm releases in ~10 years and no
merged commits on its main branch since 2019, with 317 open issues accumulating unaddressed.
For a team this size-and-compat conscious, pulling in ~7.4 KB gzipped of unmaintained
multi-touch gesture code to detect a one-axis swipe is disproportionate regardless of
abandonment status — the size/functionality mismatch is disqualifying on its own even
before maintenance risk is considered.

### swiped-events (john-doherty/swiped-events)

- npm package `swiped-events`: latest version **1.2.0**, published **2024-04-27**
  (`registry.npmjs.org/swiped-events` → `time["1.2.0"] = "2024-04-27T19:13:00.783Z"`),
  i.e. actively maintained within the last ~2 years as of this research date, unlike Hammer.
  Source: https://registry.npmjs.org/swiped-events
- **What it does**: dispatches `swiped-left/right/up/down` `CustomEvent`s on
  `touchstart`/`touchmove`/`touchend`, nothing else — purpose-built swipe detection, not a
  general gesture suite. Description on the npm registry: "A 1k script that adds swipe
  events to the DOM for touch enabled devices."
- **Source code inspected directly** (`unpkg.com/swiped-events@1.2.0/src/swiped-events.js`,
  downloaded and read): plain ES5 — `var` declarations, `function` keyword throughout, an
  IIFE wrapper, and even a manual `CustomEvent` polyfill for old IE/Chrome. Zero `const`,
  `let`, or arrow functions found via `grep -c "=>|const |let "` → 0 matches. This runs
  unmodified on Chromium 63 with no transpilation or polyfill work needed on our side.
- **Size**: downloaded `dist/swiped-events.min.js` directly — **1,997 bytes minified /
  945 bytes gzipped** (measured locally with `gzip`). npm registry `unpackedSize` for the
  whole published package (including source, dist, docs) is 210,923 bytes, but only the
  ~2 KB minified/~1 KB gzipped `dist` file would actually ship in our bundle.
- **Dependencies**: none (pure vanilla JS, confirmed by the "no-dependencies" framing in
  its own README and absence of a `dependencies` block driving runtime code).
- **API surface fits this codebase well**: it listens on `document` and fires
  `CustomEvent`s that any element can listen for — layers on top of existing DOM without
  requiring a rewrite of `homeScreen.js`'s row markup. It also exposes swipe distance/time
  via `event.detail`, which is enough to compute a delta to feed into the existing
  `translateX/translateY` transform logic already driving D-pad navigation, i.e. it can act
  as _just_ the gesture-recognition layer while the existing row-scroll code stays the
  source of truth for the actual transform math.

### vanilla-swipe (as a second modern option)

- npm package `vanilla-swipe`: latest version **2.4.1**, published 2022-09-27 per the npm
  registry (used as a maintenance sanity check; primary size/syntax facts below were
  measured directly).
  Source: https://registry.npmjs.org/vanilla-swipe
- **Size**: published `lib/index.js` (CJS, its `main` entry per `package.json`) is
  **12,197 bytes / 2,678 bytes gzipped** when downloaded directly
  (`unpkg.com/vanilla-swipe@2.4.1/lib/index.js`) and gzip'd locally — roughly 3x
  swiped-events' size but still an order of magnitude smaller than Hammer.js.
- **Chrome-63 compatibility**: it is TypeScript compiled to a Babel-transpiled CJS bundle —
  inspecting the downloaded file shows `@babel/helpers` shims (e.g. a `_typeof` helper) and
  `"use strict"`, targeting old engines. No `const`/`let`/arrow functions/classes leak
  through untranspiled (source inspected directly: only 1 match for
  `class |const |let ` across the whole file, inside a babel helper comment, not runtime
  ES2015+ syntax). It is a CommonJS module (`exports`/`require`), which esbuild — already
  this repo's bundler — handles natively, no ESM-interop tooling needed.
- **Trade-off vs. swiped-events**: it's a class-based API with directional-lock and
  velocity-tracking options (more configurable), at ~3x the size, and its last npm release
  predates swiped-events' most recent one by ~19 months. For "swipe left/right/up/down on a
  row," swiped-events' simpler event-based API is the better fit; vanilla-swipe is worth
  knowing about only if finer-grained velocity/lock control becomes a real requirement.

---

## 2. Are native Touch/Pointer Events + CSS scroll-snap sufficient on Chromium 63?

Confirmed directly from MDN's browser-compat-data source of truth (the same repo that
feeds MDN's and caniuse.com's compatibility tables), fetched as raw JSON so the numbers
are unambiguous and not paraphrased by a summarizer:

| API                                                | Chrome version added | Source                                                                                                               |
| -------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `TouchEvent` (touchstart/touchmove/touchend)       | **22**               | `raw.githubusercontent.com/mdn/browser-compat-data/main/api/TouchEvent.json` → `support.chrome.version_added = "22"` |
| `PointerEvent` (pointerdown/pointermove/pointerup) | **55**               | `.../api/PointerEvent.json` → `support.chrome.version_added = "55"`                                                  |
| `scroll-snap-type` (CSS)                           | **69**               | `.../css/properties/scroll-snap-type.json` → `support.chrome.version_added = "69"`                                   |

Cross-checked against caniuse.com's rendered tables directly (not a secondary summary):
caniuse.com/touch shows Chrome supported from version 22 onward; caniuse.com/pointer shows
Chrome 52-54 had it disabled by default and full support from **Chrome 55**, matching MDN
exactly.
Sources: https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent,
https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent,
https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-type,
https://caniuse.com/touch, https://caniuse.com/pointer

**This confirms the hypothesis in the brief, with one correction worth flagging**: Touch
Events landed at Chrome 22 and Pointer Events at Chrome 55 — both are safely below the
Chromium 63 floor, so either API works purely on version-support grounds. `scroll-snap-type`
landed at Chrome 69, which is **above** the Chromium 63 floor — CSS scroll-snap cannot be
relied on unconditionally for the oldest supported engines and would need a JS-driven
fallback (which the existing `translateX`/`translateY` row logic already effectively is).

**Conclusion for Q2**: yes, native Touch Events (available since Chrome 22, universally
supported well below the floor) are sufficient with zero library dependency to detect
swipe gestures — read `touchstart`/`touchmove`/`touchend` coordinates, compute a delta, and
feed that into the same transform math the D-pad handlers already drive. Pointer Events are
also safely available (Chrome 55) if a unified touch+mouse+pen event model is preferred, but
add no real capability over Touch Events for this repo's phone-only swipe use case. CSS
`scroll-snap-type` should not be leaned on as the primary mechanism given it lands after the
compat floor — it can be added later as a progressive enhancement gated behind a feature
check, not depended on.

---

## 3. CSS Container Queries — not usable given the Chrome 63 floor

Confirmed via MDN browser-compat-data raw source (`css/at-rules/container.json` and
`css/properties/container-type.json`): both report
**`support.chrome.version_added = "105"`**.
Source: https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/at-rules/container.json,
https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/container-type.json

Cross-checked against the rendered caniuse.com table directly: it shows Chrome 105 with
"Partial support" and full support beginning at **Chrome 106** (the partial/full split
likely reflects `container-type: size` vs. `inline-size` nuances or query-unit support
landing slightly later; MDN's BCD entry for the at-rule/property itself pins the baseline
at 105). Either number — 105 or 106 — is **42-43 major versions above** the Chromium 63
floor this codebase targets.
Source: https://caniuse.com/css-container-queries

**Conclusion for Q3**: the brief's hypothesis (~Chromium 105) is confirmed. Container
Queries are not usable, full stop, given the Chrome 63 floor — there is no polyfill/fallback
posture that makes sense here (a JS-based container-query polyfill would itself need
`ResizeObserver`, see Q4, and is disproportionate weight for what plain viewport media
queries already solve). The correct approach is exactly what the codebase already has
infrastructure for: **plain `@media (max-width: …)` viewport queries**, run through the
existing PostCSS legacy-fallback pipeline (`scripts/build.mjs`) that already handles
autoprefixing and CSS-feature polyfilling for the Chromium-63 target. Add phone-width
breakpoints (e.g. ~360-430px, per the brief) as ordinary `@media` rules; no new tooling
required.

---

## 4. ResizeObserver vs. plain CSS media queries for responsive breakpoints

Confirmed via MDN browser-compat-data raw source: `api/ResizeObserver.json` →
`support.chrome.version_added = "64"`. Cross-checked directly against the rendered
caniuse.com table (https://caniuse.com/resizeobserver), which likewise shows full support
beginning at Chrome 64.
Source: https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ResizeObserver.json,
https://caniuse.com/resizeobserver

This confirms the brief's hypothesis that ResizeObserver landed **after** the Chromium 63
floor — by exactly one version (64 vs. 63). That is a hard blocker on relying on it
unconditionally: any phone-layout logic gated on `ResizeObserver` would silently not run on
a hypothetical Chromium-63-exact engine, and this repo's own compat policy treats 63 as the
floor to actually support, not a rounding buffer.

**What ResizeObserver offers that `@media` doesn't** (per its own spec/MDN description,
`developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`): it observes the _content/border
box size of a specific element_ as it resizes for any reason (flex/grid reflow, content
change, programmatic resize) — not just the viewport. `@media` queries only ever see
viewport dimensions (or, with Container Queries — unusable here per Q3 — a queryable
ancestor's box). For this app's actual stated need ("general responsive CSS approach for
phone viewport widths ~360-430px"), the thing being measured **is** the viewport, which is
exactly what plain `@media` was built for — ResizeObserver would be solving a problem this
app doesn't have (per-element size reactivity independent of viewport), while adding a
runtime dependency that is one Chrome version too new for the floor.

**Conclusion for Q4**: skip ResizeObserver-based breakpoint helpers. Plain viewport
`@media` queries, already supported by the existing PostCSS pipeline, are both sufficient
and safely within the compat floor (`@media` width queries have been supported since very
early Chrome versions, well below 63 — not separately re-verified here since it was not in
question, but implicit in the existing 1280px-2600px TV breakpoints already working today).
If a future need arises for _element-level_ size reactivity (e.g. a row component that must
react to its own container width independent of viewport, inside a dynamically-sized
panel), that would be the one legitimate reason to revisit ResizeObserver — and even then
only with a capability check (`if ('ResizeObserver' in window)`) and a media-query fallback,
never as the sole mechanism.

---

## Recommendation

**Adopt `swiped-events` (npm `swiped-events@1.2.0`) as a single, narrowly-scoped
dependency for swipe detection. Do not adopt Hammer.js. Do not adopt any Container-Query or
ResizeObserver-based tooling — use plain `@media` viewport breakpoints through the existing
PostCSS pipeline instead.**

Reasoning, tied directly to the facts gathered above:

1. **Native Touch Events alone (Q2) are a legitimate zero-dependency option** — Chrome 22
   support means there's no compat blocker to writing `touchstart/touchmove/touchend`
   handlers by hand, and the logic needed (track start X/Y, compute delta on end, threshold
   check, feed into the existing `translateX/translateY` transform math) is genuinely small.
   A from-scratch implementation is defensible and would keep the dependency count at zero.

2. **However, `swiped-events` costs almost nothing extra over hand-rolling it, and reduces
   maintenance surface**: 945 bytes gzipped (measured directly from its published dist
   file), zero dependencies, plain ES5 requiring no transpilation for Chrome 63, actively
   released as recently as 2024 (unlike Hammer.js's 2016 npm freeze), and its `CustomEvent`
   contract (`swiped-left`/`swiped-right`/`swiped-up`/`swiped-down`, with distance/time in
   `event.detail`) integrates cleanly as a thin gesture-recognition layer feeding the
   existing row-transform code in `homeScreen.js` — it does not require rewriting how rows
   are positioned, only adding a listener that nudges the existing transform state. Given
   this team already treats "don't duplicate/replace the D-pad transform logic" as a
   constraint, letting a tested, single-purpose library own only the touch-delta math (the
   fiddly, edge-case-prone part — direction thresholds, accidental-scroll suppression, tap
   vs. swipe disambiguation) while our own code keeps owning the transform/position logic
   is a better seam than reinventing the touch-tracking edge cases in-house.

3. **Hammer.js is disqualified on proportionality, not just staleness**: even setting aside
   its ~10-year-stale npm releases and stalled commit history (last merged commits 2019,
   317 open issues), it ships 7,359 bytes gzipped of general multi-touch gesture recognition
   (pan/pinch/rotate/tap/press) for a codebase that needs only "detect a horizontal or
   vertical swipe." That's roughly 7.8x swiped-events' footprint for capability this app
   won't use, which fails this team's stated bundle-size sensitivity regardless of the
   maintenance question.

4. **Container Queries are simply not an option** (Chrome 105/106 vs. floor 63) — use the
   viewport `@media` approach the build already supports. **ResizeObserver is one version
   too new** (Chrome 64 vs. floor 63) and solves a per-element sizing problem this specific
   ask doesn't have — skip it in favor of plain `@media (max-width: 430px)`-style rules,
   added through the existing `scripts/build.mjs` PostCSS pipeline alongside the current
   1280px-2600px TV tiers.

Net new dependency footprint if this recommendation is followed: **one package,
`swiped-events`, ~1 KB gzipped, zero transitive dependencies, ES5-native** — consistent with
this repo's existing lean/legacy-safe dependency posture (`dashjs`, `hls.js`, `jszip`,
`libbitsub`), and no CSS tooling changes needed beyond adding ordinary media-query rules.
