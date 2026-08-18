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

**Status:** ready-for-agent

- [ ] All existing settings sections/rows render with the new card/row visual treatment and
      still navigate to their correct existing sub-pages
- [ ] Toggle rows correctly flip existing settings state
- [ ] D-pad/remote regression check on TV-mode settings screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport
