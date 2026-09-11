# CLAUDE.md

Guidance for Claude Code working in this repository.

## Workflow

For every user input, follow this sequence:

1. **`/wayfinder`** — orient on the request, understand what's being asked and where it fits
2. **`/to-spec`** — turn the understanding into a spec and create/update a GitHub project
3. **`/to-tickets`** — break the spec into GitHub Issues with clear acceptance criteria
4. **`/implement`** — execute the work, referencing the issues created above

Always start with `/wayfinder`. Skip steps that don't apply (e.g., a quick bug fix may not need
a full spec or new project, but still start with `/wayfinder` to orient).

For **bug fixes**, use `/diagnosing-bugs` after `/wayfinder` instead of the spec/tickets flow.

## Project overview

Nuvio Web is a mobile-first web app — a browser-delivered companion to
[NuvioMobile](https://github.com/NuvioMedia/NuvioMobile) (the native Kotlin Multiplatform
app). Both share the same Stremio-addon-ecosystem backend and data model. This web app is the
browser/PWA version; the native app handles Play Store / App Store distribution.

The app is a client-side playback/discovery interface for Stremio addons — it does not host or
store media itself. NuvioMobile's Compose source
(`composeApp/src/commonMain/kotlin/com/nuvio/app/`) is the design source of truth: layout,
tokens, and interaction patterns are ported from it, not reinvented.

**This project is being migrated from a TV-first app (Samsung Tizen / LG webOS) to a
mobile-phone-only product.** The end state is zero TV code. See [Migration status](#migration-status)
for what's done and what remains.

## Commands

```bash
npm install                    # install deps
npm run build                  # build to dist/ via esbuild (JSX automatic transform + PostCSS)
npm run serve                  # serve dist/ locally
python3 -m http.server 8080 -d dist   # alternative local static serve

npm run lint                   # ESLint (currently scoped — see Code style)
npm run format                 # prettier --write .
npm run format:check           # prettier --check . (pre-commit hook via husky)

npm run test                   # node --test "**/*.test.mjs"
```

### Browser testing

Always test in Chrome against the production URL **https://nuvioweb-web.vercel.app/** —
the session there is already signed in, so no manual login is needed. Use the local
`npm run serve` build only when the change under test isn't deployed yet (Vercel
auto-deploys `main`, so merge first, then verify on the URL above).

Runtime config (Supabase URL/keys, TMDB/Trakt/Simkl/Premiumize credentials, proxy URLs, etc.)
is sourced from `local.properties` (gitignored; see `local.example.properties` for the schema)
and baked into `dist/nuvio.env.js` at build time by `scripts/envProperties.mjs`. `js/config.js`
reads these values off `globalThis.__NUVIO_ENV__` at runtime — there is no `.env`/process.env
access in app code.

There is no CI job that runs lint/tests/build; the only check is `pr-template-check.yml`
(validates PR descriptions against CONTRIBUTING.md's required sections).

### Deployment

Vercel auto-deploys every push to `main` via the `vercel[bot]` GitHub integration on the
**NurvX/NuvioWeb** repo. Two Vercel projects are linked:

- **`nuvioweb`** — Production
- **`nuvioweb-web`** — Production

Each commit to `main` triggers two parallel production deployments (one per project). The
integration is configured through GitHub (not the Vercel team dashboard), so these projects
don't appear in `vercel.com` team project listings. Deployment status is visible via GitHub
deployment events (`gh api repos/NurvX/NuvioWeb/deployments`).

## Architecture

### Target state

The app is a single esbuild IIFE bundle (`js/app.js` entry point) with Preact JSX
(`jsx: "automatic"`, `jsxImportSource: "preact"`). The target build pipeline:

- **esbuild** with modern browser `target` (last 2 versions of Chrome/Safari mobile) — no
  `core-js` polyfill bundle, no PostCSS legacy CSS pipeline for old TV WebKit engines.
- **CSS** is mobile-first — phone styles are the base (no media query wrapper). The current
  `@media (max-width: 600px)` scoping in `css/phone.css` will be inverted so phone is default.
- **Distribution** is planned as a PWA (manifest + service worker for install-to-homescreen).
  Specifics are not yet implemented.

### Layering (`js/`)

- **`platform/`** — platform abstraction. Target: a mobile-oriented platform layer detecting
  iOS vs. Android (via `platform/mobileDeviceDetection.js`) and dispatching to mobile-specific
  adapters (safe-area handling, Android back gesture, PWA install prompt differences).
  `platform/index.js` currently still has the TV detection/dispatch layer — this will be
  collapsed.
- **`data/`** — repository implementations and I/O.
  - `data/local/` — per-feature localStorage-backed stores.
  - `data/remote/api/` — thin fetch wrappers per addon/service; `data/remote/dto/` — raw
    response shapes; `data/remote/supabase/` — Supabase-backed sync/account APIs.
  - `data/repository/` — concrete repositories combining local stores + remote APIs + caching
    (e.g. `catalogRepository.js`, `streamRepository.js`, `watchProgressRepository.js`).
- **`domain/`** — `domain/model/` plain data shapes; `domain/repository/` — repository
  contracts (documentation-only shapes the `data/repository/` implementations satisfy).
- **`core/`** — business/service layer: auth (`core/auth/`), profiles/sync (`core/profile/`),
  player (`core/player/` — engines in `core/player/engines/`), debrid resolution
  (`core/debrid/`), addon/catalog helpers, network helpers (`core/network/safeApiCall.js`,
  `httpClient.js`), diagnostics.
- **`ui/`** — presentation layer.
  - `ui/navigation/` — `router.js` (route table, history/back-stack), `gestureEngine.js`
    (touch interaction — see below), `screen.js` (shared show/hide helpers).
  - `ui/screens/<feature>/` — one folder per route/feature. Each screen is a Preact JSX
    component (`.jsx`). Screens are registered in `ui/navigation/router.js`.
  - `ui/components/` and `ui/theme/` — shared widgets and theming.
- **`bootstrap/`** — top-level shell rendering (`renderAppShell.js`).
- **`i18n/`** — `res/values*/` per-locale string resources; `I18n.init()`/`I18n.apply()` wire
  them into the DOM. Note: the current `I18n.apply()` pattern (DOM scan for `data-i18n`
  attributes) needs adaptation for Preact JSX screens that render their own DOM.

### Gesture engine (`ui/navigation/gestureEngine.js`)

This is the primary interaction model — it replaces the old D-pad `FocusEngine` (which is
TV-only dead code). Pure Pointer Events, no framework. Provides:

- `attachLongPress` — long-press detection with configurable threshold
- `attachSwipe` — swipe direction/velocity classification
- `attachPager` — horizontal paging with snap physics

Each `attach*` function wires DOM listeners and delegates classification to a pure, DOM-free
function (also exported for unit testing). Screens attach gestures in their mount lifecycle.
All phone layouts must respect `env(safe-area-inset-*)` for notched phones, especially the
bottom tab bar and fullscreen player.

### Player

`core/player/playerController.js` is the playback facade. Three browser engines:

- `nativeVideoEngine.js` — plain `<video>` element
- `hlsJsEngine.js` — HLS.js (primary path for mobile)
- `dashJsEngine.js` — DASH playback

`platformAvplayEngine.js` (Tizen/webOS AVPlay) has been deleted. The player controller inlines
a disabled stub. Subtitle rendering supports bitmap decode (`bitmapSubtitleDecoder.js`)
alongside text cues.

### App startup (`js/app.js`)

Target simplified boot sequence: render shell → `Platform.init()` → `I18n.init()` →
`Router.init()` / `PlayerController.init()` → theme/i18n apply → `AuthManager.bootstrap()`.
Guest/anonymous access is disabled — signed-out users land on `authSignIn`.

TV-specific startup steps to remove: `core-js` warm-up, performance-mode class toggling for
constrained/legacy Chromium, `setupWebOsAppLifecycle()`.

Router target: strip TV lifecycle hooks (webOS resume-route persistence, Tizen back-guard
timing), add mobile equivalents (Android back = browser back via `popstate`, PWA resume =
normal page load).

## Code style

- Prettier: 100-char width, double quotes, semicolons, no trailing commas (`.prettierrc.json`).
  `format:check` runs on pre-commit via husky.
- **Screen format**: Preact JSX (`.jsx`) is the canonical format for all screens. When touching
  a screen that is still vanilla JS, convert it to JSX if the screen is small enough that the
  conversion doesn't overshadow the actual change (use judgment — don't turn a one-line fix
  into a full rewrite).
- ES modules throughout (`"type": "module"` in package.json).
- **Target ESLint config**: lint all `js/**/*.{js,jsx}` with JSX-aware rules. Currently ESLint
  only scopes real linting to `js/ui/screens/home/**` (see `lint:home:incremental` in
  package.json); `no-unused-vars` (`_`-prefixed exempt) and `no-empty` (empty catch allowed)
  apply more broadly.

## Migration status

The app is migrating from a TV-first (Samsung Tizen / LG webOS) interface to a mobile-phone-only
product. **TV code is dead** — delete it freely, never maintain it, don't consider TV
compatibility when making changes.

### Workstreams

**Screens** — 18 of ~22 screens have phone variants (12 Preact JSX, 6 vanilla JS). Missing:
`cast`, `debug`, `supporters`, `trakt`. Target: phone module IS the screen (no dispatch, no
`isPhoneViewport()` check, no `*Phone` suffix — rename/collapse). The current dual-mode
pattern (each screen checks `Platform.isPhoneViewport()` and delegates to a sibling Phone
module) will be collapsed so the phone module is the only render path.

**CSS** — 5,185 lines in `css/phone.css`, all scoped inside `@media (max-width: 600px)`.
Target: invert to mobile-first (phone styles are the base, no breakpoint wrapper). ~21K lines
in `css/components.css` are TV-era styles to be replaced/removed.

**Build pipeline** — currently targets Chromium 63/68 (Tizen 2019 / webOS 2020) with a PostCSS
legacy fallback pipeline and separate `core-js` polyfill bundle. Target: modern mobile browsers
(last 2 versions Chrome/Safari), drop `core-js`, drop legacy CSS pipeline.

**Platform layer** — `platform/index.js` still detects `browser`/`webos`/`tizen` and dispatches
to three adapters. Target: mobile platform layer with iOS/Android adapters via
`mobileDeviceDetection.js`. Dead code to delete: `platform/tizen/` (~222 lines),
`platform/webos/` (~850 lines), `platform/adapters/tizenAdapter.js` (~119 lines),
`platform/adapters/webosAdapter.js` (~64 lines).

**Router** — still has webOS resume-route persistence and Tizen back-guard timing. Target:
simple history-stack with Android back (`popstate`) and PWA resume handling.

**Player** — `platformAvplayEngine.js` deleted; player controller stubs the AVPlay engine as
disabled inline. The three browser engines (native, HLS.js, DASH.js) stay.

**FocusEngine** — `focusEngine.js` deleted. `gestureEngine.js` handles all phone interaction.

**Packaging scripts** — deleted: `package-tizen.mjs`, `package-webos.mjs`, `ares-*.mjs`,
`sync-*.mjs`, and their npm script entries. `release-platform-artifacts.yml` workflow also deleted.

**i18n** — `I18n.apply()` scans the DOM for `data-i18n` attributes. Needs adaptation for
Preact JSX screens that manage their own DOM.

**ESLint** — currently scoped to `js/ui/screens/home/**` only. Target: all `js/**/*.{js,jsx}`
with JSX-aware rules.

## Agent skills

### Issue tracking

Issues and specs are tracked in **GitHub Issues** on this repository. The migration is tracked
in the [Mobile Migration](https://github.com/users/NurvX/projects/2) GitHub Project.

Before starting work, check open issues (`gh issue list`) and the project board for context on
what's planned, in progress, or blocked. When picking up a task, reference the relevant issue
number. When completing work that closes an issue, note it in the commit message
(`Closes #<number>`).

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root, created lazily. See
`docs/agents/domain.md`.
