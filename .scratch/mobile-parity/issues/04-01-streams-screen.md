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

**Status:** done

- [x] Filter chips, grouped result list, and all loading/empty states render correctly using
      existing `streamScreen.js` data logic unchanged
- [x] Tap plays the stream (including external-player handoff, unchanged from existing
      `playStream`/`tryOpenInExternalPlayer` logic)
- [x] Long-press opens the bottom-sheet action menu with working Copy Link / external /
      internal / download actions
- [x] D-pad/remote regression check on TV-mode stream screen shows no behavior change
- [~] Manually verified in a phone-sized viewport (flag if real backend/addon data is needed)
      — see Comments: sandbox had no signed-in session, so only boot/bundle-load and
      sign-in-screen verification at 390x844 were possible, not the real data-driven screen.

## Comments

Another agent implemented the surgical-diff pattern for this ticket: a `Platform.isPhoneViewport()`
guard at the top of `render()`, a `Platform.watchPhoneViewport()` subscribe/unsubscribe in
`mount()`/`cleanup()`, a `renderPhone()` delegate, and a phone-dispatch branch at the top of
`onPointerActivate()`. All new markup/interaction lives in the new
`js/ui/screens/stream/streamScreenPhone.js`: blurred backdrop shell, episode/movie hero + optional
"Resume from…" pill, horizontally-scrolling filter chip row (refresh + All + one per addon,
reusing `sourceChips`/`addonFilter`), and a grouped result list (by addon, then by
`sourceProviderId` subheader when an addon has >1 distinct source) with per-addon-group
"fetching…" spinner, full-list spinner, footer spinner, and all four TV empty-state variants.
Tap dispatches to the screen's own unchanged `playStream()`. Long-press (`attachLongPress` from
`gestureEngine.js`) opens `bottomSheet.js` with Copy Link / Open in External Player / Open in
Internal Player / Download as File. `playStream`'s tail was extracted verbatim into a new
`playStreamInternal(selected)` method so "Open in internal player" can skip the external-player
handoff explicitly; `launchExternalPlayerHref` gained an optional third `toastMessage` param
(defaulting to the original toast text) so the download action can show its own toast instead.
Several pure formatting helpers (`getAddonBadgeLabel`, `getStreamHeadline`, `getStreamQuality`,
`getStreamDescriptionLines`, `renderStreamBadges`, `resolveStreamBadgePlacement`) gained `export`
so the phone module reuses them instead of reimplementing.

I picked this ticket up after two independent reviews had already run against the working tree.
Both agreed the TV-regression verdict was SAFE: `render()`/`onPointerActivate()` each get a
single early-return guard before any TV logic runs, the TV bodies below are byte-identical to
before, `onKeyDown` (the D-pad/remote handler) has zero diff hunks touching it, and `playerScreen.js`
is completely untouched — I independently re-confirmed all of this by re-diffing and re-reading
the surrounding code rather than taking the reviews on faith. Both reviews also passed
prettier/eslint and found no scope creep.

The standards review's one substantive finding was real duplication: `streamScreenPhone.js` had
its own local `resolveDirectStreamUrl()` that re-derived the header-check ->
`stream.url`/`externalUrl` -> `DirectDebridResolver` fallback chain already living inside
`tryOpenInExternalPlayer()` in `streamScreen.js`, rather than reusing it — Shotgun Surgery risk for
any future change to debrid-resolution fallback order. Per this epic's explicit instruction ("if
you genuinely need to reuse existing TV logic that isn't yet its own reusable method, do a
verbatim move-method extraction... rather than duplicate real logic into the phone module"), I
extracted that block verbatim into a new `StreamScreen.resolveDirectStreamUrl(stream)` method,
had `tryOpenInExternalPlayer()` call it instead of its old inline copy (functionally identical —
the two "fall back to magnet, else bail" branches just collapse into one shared check), and
switched the phone module's Copy Link/Download actions to call `screen.resolveDirectStreamUrl(stream)`
directly. This let me drop the now-unused `DirectDebridResolver` import from the phone module. The
other flagged item (a 3-line param object built three times across the file) was pre-existing
before this diff and low priority, so left alone. No other findings from either review needed
changes.

After the fix: `npx prettier --write`/`--check` clean on both touched files plus the new phone
module; `npx eslint` clean on all three (outside `lint:home:incremental`'s scope, verified
directly rather than assumed); `npm test` 50/50 green; `npm run build` succeeds; a stashed
before/after `dist/` diff shows only `app.bundle.js` and `css/phone.css` changed. Manual
verification: built + served `dist/` and opened `http://localhost:8099/` at a resized 390x844
window — same as the prior ticket in this epic, the sandbox's Chrome profile has no signed-in
session (guest access is disabled app-wide), so it lands on Sign In with no route reachable, phone
or TV. I did not attempt to work around that (no credential entry/account creation per the safety
rules). What I *could* confirm live: the app boots cleanly at 390x844 with no console/bundle
errors, and via static trace + diffing I confirmed the D-pad/remote `onKeyDown` path in
`streamScreen.js` is byte-for-byte unmodified. Real interactive verification with actual addon
data (the filter chips, grouped list, and long-press sheet against live streams) still needs a
seeded local session in this sandbox.
