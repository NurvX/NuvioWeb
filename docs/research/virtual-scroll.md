# Virtual Scroll for Catalog + Library — Research

Date: 2026-09-09
Ticket: #32 (part of map #28). Scope: `catalogSeeAll` + `library` grids only;
home shelves out of scope for v1. Primary sources only — local code, `package.json`,
build scripts, and upstream repo READMEs / MDN. No dependencies installed.

## 1. What exists today (local sources)

### catalogSeeAll (`js/ui/screens/catalog/catalogSeeAllScreen.jsx`)

- `Body` renders **every** loaded item: `items.map(...) → renderPosterCard(...)`
  joined into one HTML string, injected via `dangerouslySetInnerHTML`
  (`catalogSeeAllScreen.jsx:266-291`).
- Growth is paginated (100/page, `nextSkip`, `catalogSeeAllScreen.jsx:533`) with
  infinite scroll at a 640px bottom threshold (`SCROLL_LOAD_THRESHOLD_PX`,
  `catalogSeeAllScreen.jsx:54,376-379`). Paging caps network, **not DOM** —
  a 500-item catalog keeps 500 poster nodes alive.
- Every page load calls `render()` which re-mounts the whole Preact tree via
  `mountPreact` (`catalogSeeAllScreen.jsx:553-562`) and re-binds a per-card
  long-press listener for **all** cards (`bindGridLongPress`,
  `catalogSeeAllScreen.jsx:348-357` → `bindPosterCardEvents` queries every
  `.phone-poster-card`, `js/ui/components/posterCard.js:138-155`).
- Scroll position is already preserved across renders/back-nav
  (`_phoneCatalogSeeAllScrollTop`, `captureRouteState`/`hydrateFromRouteState`,
  `catalogSeeAllScreen.jsx:365-367,403-444`) — any windowing must keep this working.

### library (`js/ui/screens/library/libraryScreen.js`, `libraryController.js`)

- Saved-mode vertical grid uses the identical pattern: full
  `items.map(renderPosterCard).join("")` (`libraryScreen.js:343-349`), same
  per-card long-press binding (`libraryScreen.js:828-837`).
- Library grids are bounded by the user's saved set (typically tens–low hundreds),
  while catalogSeeAll grows unboundedly via paging — catalog is the worse case.
- Cloud mode is a variable-height **row list** (`renderCloudRow`,
  `libraryScreen.js:476-512`), not a uniform poster grid — different geometry,
  recommend out of v1 (see §4).

### Image loading (`js/ui/components/posterCard.js:113-117`)

- `<img loading="lazy">` is already set. This defers network/decode for
  off-screen posters but does **not** reduce DOM node count, style/layout cost,
  or long-press listener count.

### Grid geometry (`css/phone.css`)

- Catalog: fixed `repeat(3, 1fr)` grid (`phone.css:2053-2057`).
- Library saved grid: `repeat(auto-fill, minmax(96px, 1fr))` (`phone.css:1663-1667`)
  → 3–4 columns on phones.
- Cards are `aspect-ratio: 2 / 3` with labels below (`phone.css:250-252, 321-338`).
  Rows are effectively **uniform height** → windowing math is O(1)
  (row = floor(index / columns)), no dynamic measurement needed.

### Build/packaging constraints (`package.json`, `scripts/`)

- `preact: ^10.29.8`, **no `preact/compat`**, no virtualization dep
  (`package.json:33-40`).
- esbuild IIFE, `jsx: automatic`, `jsxImportSource: preact`
  (`scripts/build.mjs:69-86`); target `["chrome120", "safari16"]`
  (`scripts/compatibilityPolicy.mjs:1-3`).
- No `core-js` anywhere in deps or build — only evergreen APIs
  (`IntersectionObserver`, `ResizeObserver`) are safe; both are native on the
  whole target range.

## 2. Options

| Option                                                                                                                     | Bundle weight (primary-source claim)                         | Preact compat                                                                                                                                                                                                                                                                                                                                                                              | 500-item poster-grid fit                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Hand-rolled fixed-grid windowing** (own Preact component: spacer divs + visible row slice on scroll, `overscan` rows) | **+0 bytes** dep cost (~100–150 lines own code, estimate)    | Native — same `preact` import + `mountPreact` pattern as today                                                                                                                                                                                                                                                                                                                             | **Best fit.** Uniform 3-col / 2:3 geometry → trivial fixed-row math; plugs into existing paging threshold, scroll-restore state, and per-card long-press binding (bind only visible window). Zero new API surface.                                                                                                                                                                                                                                                                                    |
| **B. `content-visibility: auto` + `contain-intrinsic-size`** on `.phone-poster` (CSS-only, keeps full DOM)                 | +0 bytes                                                     | N/A (CSS)                                                                                                                                                                                                                                                                                                                                                                                  | Partial. Skips off-screen _rendering_ (MDN: "skip an element's rendering work until it is needed"). But DOM nodes, Preact re-render cost, and long-press listeners remain; needs per-card intrinsic-size estimates to avoid scrollbar jump. MDN marks it **Baseline 2024** ("newly available since Sept 2024") — Safari < 18 lacks it, so on our `safari16` floor it is **progressive enhancement only, not a solution**. Source: https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility |
| **C. `preact-virtual-list`** (`developit/preact-virtual-list`)                                                             | No size claim in README (single small component)             | Native Preact (`import VirtualList from 'preact-virtual-list'`), but **stale**: 18 commits, Travis-CI era, ~231 stars, single-column `rowHeight` **list only — no grid support**. Would need fork/adaptation for a 3-col poster grid. Source: https://github.com/developit/preact-virtual-list                                                                                             |
| **D. Virtua** (`inokawa/virtua`)                                                                                           | README claim: **~3kB gzipped** per component, tree-shakeable | **No Preact adapter.** Adapters: React / Vue / Solid / Svelte / Angular only; `VGrid` is experimental. React entry via `preact/compat` (not installed) = shim weight + compat risk. Source: https://github.com/inokawa/virtua                                                                                                                                                              |
| **E. TanStack Virtual** (`TanStack/virtual`)                                                                               | README claim: **10–15kb** ("Lightweight (10–15kb)")          | **No Preact adapter.** Adapters: React / Solid / Vue / Svelte only; headless core is framework-agnostic but needs hand-written Preact binding (observer + state sync) — most of option A's work plus 10–15kb. Grid needs custom code ("needs customization" per Virtua's comparison table, corroborated by TanStack README's list-first docs). Source: https://github.com/TanStack/virtual |

Notes:

- D/E weight claims are the projects' own README statements, not measured in our
  bundle; either would also need `preact/compat` (absent from `package.json`)
  for their React entries, adding further unmeasured weight.
- `IntersectionObserver`-based lazy-mount (render skeletons, mount cards near
  viewport) was considered as option F but is strictly worse than A here:
  same scroll plumbing, plus one observer per card, with no benefit over
  row-slice windowing on uniform geometry.

## 3. Recommendation

**Option A — hand-rolled fixed-grid windowing, no new dependency — for v1.**

1. Build one shared `VirtualPosterGrid` Preact component (fixed `columns`,
   measured row height via `ResizeObserver`, overscan ~2 rows, top/bottom
   spacer divs) and use it in `catalogSeeAll` first (unbounded growth =
   biggest win), then library saved-mode vertical grid (same card geometry,
   `minmax(96px,1fr)` column count derived from container width).
2. Keep existing infinite-paging (100/page, 640px threshold) and
   `loading="lazy"`; windowing composes with both.
3. Keep route-state scroll restore working by mapping saved `scrollTop` to a
   start-row on remount; re-bind long-press only for the visible window.
4. Add option B (`content-visibility: auto` + `contain-intrinsic-size`) as a
   cheap progressive enhancement later — never as the mechanism, given the
   `safari16` floor.
5. Explicitly out of v1: home shelves (ticket scope) and library cloud-mode
   rows (variable height — needs estimated-height windowing, separate design).

Why not a library: no evaluated library ships a Preact grid adapter (C is
list-only and stale; D/E are React-first with no Preact entry), so any of them
costs bundle weight _plus_ compat/binding work for a worse fit than ~150 lines
of geometry-trivial own code on uniform 3-col/2:3 cards.
