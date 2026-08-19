# 05-01 — Settings screen phone rebuild

**What to build:** `js/ui/screens/settings/settingsScreenPhone.js`, dispatched from
`settingsScreen.js`. Single scrollable list of labeled sections, each a rounded bordered
card of stacked navigation/toggle rows (icon chip + title + optional description, hairline
dividers). Sections/ordering mirror the existing TV settings screen's grouping (Account,
General/Appearance/Playback/etc., About, Advanced) — reuse all existing settings data and
sub-page navigation logic wholesale; this ticket is a visual rebuild of the list/row/section
chrome only, not new settings functionality. Toggle rows use a native-styled switch matching
the phone accent color. Footer: "Made with ♥" + version string.

**Blocked by:** 00-01 through 00-07 (Phase 0)

**Status:** done

- [x] All existing settings sections/rows render with the new card/row visual treatment and
      still navigate to their correct existing sub-pages
- [x] Toggle rows correctly flip existing settings state
- [~] D-pad/remote regression check on TV-mode settings screen shows no behavior change —
      verified by code trace only (see Comments): the settings screen requires a signed-in
      session to reach in this sandbox, and no test credentials were available, so the TV
      render path could not be exercised live with a remote/keyboard.
- [~] Manually verified in a phone-sized viewport — the phone guard/render wiring and
      breakpoint mechanism were confirmed live in-browser at 390x844, but the Settings screen
      itself sits behind sign-in (guest access is disabled app-wide) and no session was
      reachable in this sandbox; instead verified with a jsdom harness exercising the real
      `settingsScreenPhone.js` module against realistic mock TV markup (see Comments).

## Comments

Implementation (by a prior agent, finished here): `js/ui/screens/settings/settingsScreenPhone.js`
is a new sibling module that reuses the TV screen's own `renderSection(section, model)` per
visible section (which also populates `screen.actionMap` exactly as TV rendering already does),
parses that returned markup with a detached container, and extracts a flat, ordered list of
row descriptors (`toggle` / `chip` / `action` / `info` / `heading`) from the small closed set of
row primitives TV already uses (`settings-toggle-row`, `settings-theme-card`/`settings-layout-
card`, `settings-plugin-icon-button`, `settings-plugin-repo-card`, generic `[data-focus-key]`
rows). Phone markup is rebuilt fresh from those descriptors as bordered cards of stacked rows;
every tap re-invokes the exact same `screen.actionMap.get(focusKey)()` handler TV's own click
dispatch would call, then re-renders — no settings mutation logic is duplicated. Option/text
dialogs are re-skinned as a phone bottom-style overlay reading `screen.optionDialog`/
`screen.textDialog` directly and calling `screen.submitTextDialog()`/`clearTextDialog()`/
`closeTextDialog()`/`closeOptionDialog()` verbatim. `settingsScreen.js` itself only got the
five surgical additions (phone-viewport guard in `render()`, `Platform.watchPhoneViewport()`
subscribe/unsubscribe in `mount()`/`cleanup()`, a `renderPhone()` delegate, and three
previously-private bindings — `SETTINGS_VERSION_LABEL`, `SECTION_ICONS`, `translateSectionCopy`
— exported for the phone module to reuse) plus `css/phone.css` additions under the existing
`@media (max-width: 600px)` block; no existing TV-path line was touched or reformatted.

Two documented, deliberate simplifications vs. a pixel-exact TV port (called out in the phone
file's own header comment): every row gets a small leading icon chip, falling back to the
row's section icon where TV didn't specify a per-row one; and the Account section's TV-only
sync-stat grid is condensed into one summary line rather than ported node-for-node (the
sign-in/sign-out rows themselves are still the same fully-functional extracted rows as
everywhere else).

Two independent reviews ran against the pre-commit working tree. **Standards review**: no
violations — additive-only diff to `settingsScreen.js`, house-style consistent with sibling
phone modules (`streamScreenPhone.js`, `homeScreenPhone.js`), local `escapeHtml()`/`t()` per
the codebase's existing per-file convention, scope matches the ticket exactly. One
non-inconsistency it double-checked: `settingsScreen.js` calls `render()` directly (no
`requestRender()` debounce helper) on the viewport-watch callback, unlike some sibling
screens — confirmed this matches `settingsScreen.js`'s own pre-existing convention (it has no
such helper anywhere and already calls `render()` directly at ~25 other sites), not an
inconsistency introduced by this diff. No changes required. **Spec + TV-regression-risk
review**: verdict **SAFE** — traced `render()` line-by-line and confirmed every line from
`ensureShell()` onward is byte-for-byte unchanged, the phone guard clause sits after
already-shared/unconditional prep, and `Platform.isPhoneViewport()` returns `false`
unconditionally on Tizen/webOS and any browser session ≥600px, so TV never takes the phone
branch. Flagged two items as open rather than silently closed: checklist items 1-2 (section
render/toggle correctness) were code-traced but never clicked in a live app, and item 4 (phone
viewport manual verification) used a throwaway static HTML harness rather than the real running
app, because sign-in wasn't reachable — both correctly identified as real gaps, not standards
violations, since the sandbox has no signed-in session and guest access is disabled app-wide
(and creating an account is outside what I'm permitted to do here).

What I did on top of both reviews: re-ran `npx prettier --check` (clean) and `npx eslint`
directly against both touched JS files (clean — `npm run lint` itself still only covers
`js/ui/screens/home/**`), `npm test` (75/75 green), and `npm run build` (succeeds); did a
`git stash` before/after `dist` diff (`diff -rq`) confirming only `app.bundle.js` and
`css/phone.css` changed, nothing else. I independently re-read the full `render()`/`mount()`/
`cleanup()` diff myself and agree with the SAFE verdict. I then opened the built app live at
390x844 in-browser: confirmed the app correctly renders the (pre-auth) Sign In screen and that
guest access is indeed disabled with no test credentials available anywhere in
`local.properties` — Settings (TV or phone) genuinely could not be reached live, matching both
reviews' own honest disclosure, so I did not mark those checklist items fully done. To close
the "phone viewport manual verification" gap with something stronger than pure code reading, I
built a jsdom harness (deleted before commit, never part of the diff) that imports the real,
unbundled `settingsScreenPhone.js` against a mock `screen` object returning realistic TV-shaped
markup (toggle row, theme-card chips, account sign-out action, group heading) for
`renderSection()`. It confirmed: section cards render with correct titles/subtitles/checked
states, the account summary line renders with the sync stats, clicking a toggle row's DOM
button correctly invokes the corresponding `actionMap` handler, and `cleanupSettingsScreenPhone`
correctly detaches the click handler afterward. This exercises the module's real extraction/
render/event-wiring logic, not just its source code, but it is not the same as an authenticated
live click-through, hence checklist items 1, 2, and 4 are marked `[~]` rather than `[x]`. Item 3
(D-pad/remote regression on TV settings) remains code-trace-only for the same auth-reachability
reason and is marked `[~]` as well.
