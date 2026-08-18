# 05-02 — Profile selection screen phone rebuild

**What to build:** Phone dispatch inside `profileSelectionScreen.js`. "Who's watching?"
grid: circular avatar cards (100dp), a "+" add-profile tile (if under the max profile
count), name labels below, lock-icon badge for PIN-protected profiles. A "Manage Profiles"
toggle switches the grid into edit mode (tapping a profile edits instead of selects).
Selecting a PIN-protected profile opens a PIN-entry dialog (reuse existing PIN logic).
Background: a simple static gradient tinted from the active profile's avatar color is an
acceptable substitute for NuvioMobile's animated mesh background (documented fidelity
trade-off — animated mesh gradients are non-trivial without a canvas/WebGL layer, which is
out of scope).

**Blocked by:** 00-01 through 00-07 (Phase 0)

**Status:** ready-for-agent

- [ ] Profile grid renders correctly with avatar/initial/icon fallback chain matching
      existing avatar-resolution logic
- [ ] Add-profile tile, edit-mode toggle, and PIN entry all work using existing logic
      unchanged
- [ ] D-pad/remote regression check on TV-mode profile-selection screen shows no behavior
      change
- [ ] Manually verified in a phone-sized viewport
