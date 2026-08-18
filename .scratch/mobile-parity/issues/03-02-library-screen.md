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

**Status:** ready-for-agent

- [ ] Saved mode: both horizontal and vertical layouts render correctly, filter/sort work,
      layout-toggle persists
- [ ] Cloud mode: filtering, search, and the multi-file inline picker work
- [ ] Empty states for both modes render correctly
- [ ] D-pad/remote regression check on TV-mode library screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport (flag if real backend data is needed)
