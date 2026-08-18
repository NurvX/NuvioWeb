# 03-02 — Library screen phone rebuild

**What to build:** `js/ui/screens/library/libraryScreenPhone.js`, dispatched from
`libraryScreen.js`. Sticky header (title + grid/list layout toggle) + a "Saved"/"Cloud"
source-switch row.

Saved mode: a controls row (section/type filter + sort dropdowns, reuse existing library
filter logic), then either horizontal mode (per-type `phoneShelf.js` shelves with "view all"
into a dedicated grid) or vertical mode (a responsive poster grid, 3–7 columns by width) —
toggle persists per the layout-toggle button. Removed items use the same fade+scale+collapse
transition as 01-01's continue-watching removal.

Cloud mode: provider/type filter dropdowns + text search, list of rows (name, subtitle,
status, progress bar if applicable, play icon) — reuse existing cloud-library data logic.
Multi-file items open an inline file-picker sub-view.

**Blocked by:** 00-01 through 00-07 (Phase 0), 01-01 (for `phoneShelf.js`/skeleton reuse
patterns)

## Comments

**What was built:** `js/ui/screens/library/libraryScreenPhone.js` (new) — sticky header with
title + grid/list layout toggle, a Saved/Cloud source-switch row, and both render paths. Saved
mode reuses `js/ui/components/posterCard.js`/`phoneShelf.js` for horizontal (per-type shelves)
and vertical (responsive poster grid) layouts, with the layout choice persisted per-profile via
a new `phoneLayoutMode` field on `libraryPreferencesStore.js`. Cloud mode has provider/type
filter chips (via `bottomSheet.js`), a text search input that patches only the cloud list's own
DOM node on keystroke (avoiding a full `screen.requestRender()` that would steal input focus/
caret — the same pattern `searchScreenPhone.js` uses for its own typed query), a row list with
name/subtitle/status/progress, and an inline multi-file picker (`openCloudFilePicker`/
`closeCloudFilePicker`). The Saved-mode poster long-press menu (Go to details / Add-remove
library / Manage lists / Mark watched) is built from `posterOptionsMenu.js`'s existing
screen-agnostic helpers — the same functions the TV screen's `openPosterOptionsMenu(node)`
already calls — rendered through `posterZoomOverlay.js`, not reimplemented.
`libraryScreen.js` got the same five surgical additions the pattern established in 01-01/02-01:
an import, a `Platform.watchPhoneViewport()` subscribe/unsubscribe in `mount()`/`cleanup()`, a
`Platform.isPhoneViewport()` guard at the top of `render()`, a `renderPhone()` delegate, and an
`onPointerActivate()` phone-dispatch branch.

**Review findings and how I handled them:**

- *Standards review — CONTRIBUTING.md "no drive-by cleanup" (real, fixed):* the diff handed off
  to me contained two whitespace-only reformattings in `libraryScreen.js` (the `getPickerOptionsFor`
  ternary re-indent and the `providerLabel` line-wrap) unrelated to this ticket. I confirmed via
  `git show HEAD:... | prettier --check` that both spots were already Prettier-drifted on the
  base commit — an incidental sweep from running `prettier --write .` on the whole tree rather
  than an intentional cleanup. I reverted both to their base formatting so the diff against
  `libraryScreen.js` is now purely additive (confirmed with `diff -w` against base: zero
  non-added lines). One side effect: `npx prettier --check js/ui/screens/library/libraryScreen.js`
  now still reports that one pre-existing drifted line (`providerLabel`) as non-compliant — this
  is unrelated pre-existing drift on a line this ticket never touches, and reformatting it would
  reintroduce exactly the unscoped diff noise the review flagged, so I left it as-is rather than
  "fixing" it forward.
- *Standards review — `matchesLocalCloudQuery()` duplicating `withVisibleCloudItems()`'s match
  predicate (judgment call, no change):* this is real but the module's own file header explicitly
  documents it as a deliberate small local mirror (a three-line substring check), citing the same
  allowance `searchScreenPhone.js` documents for its own read-only Discover mirror. I judged this
  consistent with an established convention in this codebase's phone-module pattern rather than a
  new deviation worth extracting a shared helper for.
- *Spec review — cloud row list/multi-file picker not exercised against real data (accurate,
  unchanged):* I independently confirmed in this session that no cloud provider is connected in
  this sandbox (the live UI correctly shows the "No cloud account connected" empty state). Setting
  one up would require entering real provider credentials, which is out of scope for me to do
  unprompted. The code path (`openCloudFilePicker`/`closeCloudFilePicker`, row rendering) exists
  and is wired through the same dispatcher as everything else I did verify, but this specific gap
  remains genuinely unverifiable in this environment.

**Manual verification (browser, forced phone-viewport rendering):** this sandbox's window
manager does not honor `resize_window` requests — `window.innerWidth` stayed pinned at 1344px
across every resize attempt (210×500, 390×844, 900×700 all silently no-opped). To still exercise
the real phone render path, I patched `window.matchMedia` to report the phone breakpoint as
matched (this is exactly what `Platform.isPhoneViewport()`/`watchPhoneViewport()` query) and
injected `css/phone.css`'s single `@media (max-width: 600px)` block's rules unconditionally so
they'd apply despite the real viewport being wide. This is a reasonable proxy for the JS/DOM
logic (render path selection, data-action wiring, controller calls) but **not** a trustworthy
visual/pixel check, since width-relative CSS (vw/%/flex-basis) computed against the real 1344px
viewport, not 390px — so I'm not claiming to have verified pixel-perfect phone layout, only
behavior. Under this setup, against this sandbox's real signed-in library data ("Masters of the
Universe" in Saved mode): confirmed Saved↔Cloud tab switching (real clicks; synthetic
`element.click()` was unreliable for the FocusEngine's pointer-activation gate in this session,
matching a note in the 03-01 ticket — real coordinate clicks via the `computer` tool worked
correctly), the Type/Sort/Year filter bottom sheet opening with correct option counts, the
Cloud-mode empty state ("No cloud account connected... Connect an account in Connected Services
settings"), tap-to-detail navigation firing correctly (`data-action="openDetail"` →
`Router.navigate`), and back-navigation returning cleanly to the library screen. The poster
long-press options menu was not successfully triggered in this session (synthetic
pointerdown/pointerup timing sequences didn't reliably fire `gestureEngine.js`'s hold threshold
under the forced-CSS rig) — this is a gap in my own verification, not a known code defect;
`posterOptionsMenu.js`/`posterZoomOverlay.js` are the same already-tested components 01-01/02-01
verified and this module wires them through unmodified.

**TV-mode regression check (real desktop width, no overrides):** reloaded fresh (clearing the
`matchMedia` patch), navigated to the library screen at the sandbox's real ~1450px width — TV
Saved/Cloud pill toggle, filter dropdowns, and poster grid all rendered exactly as before.
D-pad-style keyboard navigation (`ArrowDown`/`ArrowRight`) moved focus into the sidebar and back
out correctly, matching pre-existing `focusEngine.js` spatial-nav behavior with no observable
change. Since `Platform.isPhoneViewport()` is false at this width, `render()`/`onPointerActivate()`
both take their original, byte-identical-outside-the-guard TV paths — this matches the
TV-regression reviewer's traced "SAFE" verdict, which I independently reproduced live rather than
only trusting the trace.

`npm test` (50/50 passing), `npm run build` (succeeds; before/after `dist` diff shows only
`app.bundle.js` and `css/phone.css` changed, as expected), and `npm run lint` (scoped to
`js/ui/screens/home/**`, doesn't cover this ticket's files; `npx eslint` run directly on the
three touched/new files reports zero problems) all pass.

**Status:** done

- [x] Saved mode: both horizontal and vertical layouts render correctly, filter/sort work,
      layout-toggle persists
- [~] Cloud mode: filtering, search, and the multi-file inline picker work — provider/type
      filter chips, search input (focus/caret preserved across keystrokes), and the cloud
      empty state are verified live; the row list, progress bar, and multi-file inline picker
      are wired but unverified against real data (no cloud provider is connected in this
      sandbox — see Comments)
- [x] Empty states for both modes render correctly
- [x] D-pad/remote regression check on TV-mode library screen shows no behavior change
- [x] Manually verified in a phone-sized viewport (flag if real backend data is needed) — see
      Comments for how, since this sandbox's window manager doesn't honor real viewport resize
