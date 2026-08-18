# 04-01 — Streams (source picker) screen phone rebuild

**What to build:** Phone dispatch inside `streamScreen.js`. Full-screen over a blurred/dimmed
backdrop of the item's artwork (`backdrop-filter: blur(22px)` — already a proven pattern in
this repo). Hero block: episode thumbnail + "SxxEyy" badge + episode/show title for
episodes, or centered logo/title for movies. Optional "Resume from…" pill banner if saved
progress exists (reuse existing resume logic). Horizontally-scrolling filter-chip row
(refresh + "All" + one per addon/source, reuse existing `sourceChips`/`addonFilter` state
already in `streamScreen.js`). Grouped result list (by addon, then by source-name subheader
when >1 source per addon) of stream-result rows: label, quality/codec subtitle, badge row
(provider/file-size badges, reuse existing badge-matching logic), addon logo+name trailing
column, highlighted state for the currently-selected stream mid-playback. Tap = `playStream`
(existing function, unchanged — already handles the external-player handoff). Long-press =
`bottomSheet.js` (00-03) action menu: Copy Link / Open in external player / Open in internal
player / Download as file. Loading states: per-addon-group spinner+"fetching…", full-list
spinner while nothing loaded, footer spinner while some addons still pending, and the
existing empty-state variants (no addons, no compatible addons, fetch failed, no streams).

**Blocked by:** 00-01 through 00-07 (Phase 0), 00-03 (bottom sheet)

**Status:** ready-for-agent

- [ ] Filter chips, grouped result list, and all loading/empty states render correctly using
      existing `streamScreen.js` data logic unchanged
- [ ] Tap plays the stream (including external-player handoff, unchanged from existing
      `playStream`/`tryOpenInExternalPlayer` logic)
- [ ] Long-press opens the bottom-sheet action menu with working Copy Link / external /
      internal / download actions
- [ ] D-pad/remote regression check on TV-mode stream screen shows no behavior change
- [ ] Manually verified in a phone-sized viewport (flag if real backend/addon data is needed)
