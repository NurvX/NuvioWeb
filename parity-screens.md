# Screen-by-screen parity gap walk (research for #47, map #44)

Question: walking home, detail, player, library, search/discover, catalog see-all,
settings, account/onboarding, cast, trakt, supporters, debug — what phone
behaviors/layouts present in NuvioMobile are missing or wrong on web?

Method: primary sources only, no implementation. Native checkout refreshed to
`e377942` (past the `a30bf51` pin the token/component audits used — those two are
explicitly NOT re-verified here). Web is this repo @ `a6a7491` on
`research/parity-screens`. Each gap tagged **CSS-only**, **needs-JSX** (markup,
no new logic), or **needs-logic** (new data flow / gesture / state).

Component verdicts (springs vs CSS, haze vs backdrop-filter, M3 sheets vs CSS
sheets) live in `parity-components.md`; token verdicts in `parity-tokens.md`.
This file names only what each screen is missing or renders wrong.

## 1. Home — diverged (closest to parity of the twelve)

Native: `features/home/HomeScreen.kt` + `components/HomeHeroSection.kt`.
Web: `js/ui/screens/home/homeScreenPhone.jsx`.

- CORRECTION to the component audit: the native hero is NOT pager-less —
  `HomeHeroSection.kt:22-23` uses `HorizontalPager` with the same
  `HERO_AUTO_SCROLL_INTERVAL_MS = 8_000L` (`:74`). Web 8s auto-advance is
  parity, not web-only. What web lacks is pager chrome and physics: parallax
  background (1.14x scale, 0.055 bg / 0.18 content), scroll stretch/zoom
  (`heroStretchHeight`, max 1.3x), edge-wrap paging, velocity + 0.16-fraction
  swipe resolution, touchSlop axis-lock. — needs-JSX + needs-logic
- Hero viewport reserve: native reserves below-section height so the hero never
  covers continue-watching on small screens
  (`mobileHeroBelowSectionHeightHint`, `<600dp`, `HomeScreen.kt:874-896`). Web
  has no equivalent. — needs-JSX
- Scroll-position restore per profile: native `MaintainHomeScrollPosition`
  (`HomeScrollPosition.kt`, incl. `28df1e7` hero-position fix). Web re-renders
  from top on back/profile switch. — needs-logic
- Inline states: native renders `NuvioNetworkOfflineCard` mid-list,
  `HomeEmptyStateCard`, hero+skeleton rows while resolving
  (`HomeScreen.kt:919-1037`). Web phone home has no offline card, no empty
  state, no skeleton path (hero + shelves only). — needs-JSX (primitives exist
  in `phoneSkeleton.js`)
- Continue-watching long-press opens the generic zoom overlay instead of the
  native `NuvioContinueWatchingActionSheet` (header + Go-to-details /
  Play-manually / Start-from-beginning / Remove,
  `core/ui/ContinueWatchingActionSheet.kt:43-113`). Web has no CW sheet. —
  needs-JSX + needs-logic
- Poster-card customization consumed on native home — out of scope per map
  (noted, no action).

## 2. Detail — diverged (structure matches, interactive depth does not)

Native: `features/details/MetaDetailsScreen.kt` + `components/Detail*.kt`.
Web: `js/ui/screens/detail/metaDetailsScreen.js` (~4000 lines, TV+phone shared).

- Action row: web has play + expandable library/watched icons. Native
  `DetailActionButtons.kt:58-214` is a 52dp pill-row: full-width play surface
  (long-pressable), N secondary icons revealed by animated width
  (`menuProgress`, 240ms tween) with haptic ticks and rotating MoreHoriz
  toggle. Same buttons, different choreography: no staggered reveal, no
  haptics, no play long-press on web. — CSS-only + needs-logic (haptics)
- Hero trailer: both auto-play muted with crossfade, but native pipes
  `playWhenReady`, ready/ended/error callbacks and a mute toggle with animated
  icon (`DetailHero.kt:66-197`, `HeroTrailerAudioState`); web resolves a
  YouTube embed with DOM-synced state and no error/ended path on phone markup.
  — needs-logic
- Trakt comments: web has the data flow (items, paging, spoiler stripping) but
  no phone section markup — native `DetailCommentsSection` +
  `CommentDetailSheet` render inline. Web phone renders
  hero/actions/meta/synopsis/seasons/cast/related only. — needs-JSX
- Episode watched management: native `EpisodeWatchedActionSheet`; web toggles
  watched inline with no sheet. — needs-JSX
- Expandable synopsis: native `ExpandableDescription`; web synopsis has no
  expand/collapse on phone. — CSS-only + needs-JSX
- Trailers rail: native `DetailTrailersSection` + `TrailerPlayerPopup`; web
  embeds a single hero trailer, no rail/popup. — needs-JSX
- Floating header present on both (`phone-detail-floating-header` exists) —
  parity on presence; curve exactness is grilling material.
## 3. Player — diverged (chrome present, panels and gestures partial)

Native: `features/player/PlayerScreenContent.kt`, `PlayerSurfaceGestures.kt`,
`PlayerScreenRuntimeGestureActions.kt`, `skip/`, `PlayerSidePanel.kt`,
`PlayerSourcesPanel.kt`, `SubtitleModal.kt`, `AudioTrackModal.kt`,
`ParentalGuideOverlay.kt`, `PlayerNextEpisodeAutoPlay.kt`.
Web: `js/ui/screens/player/playerScreenPhone.js` + `playerGestures.js`.

- Control chrome (header / center / bottom bar / lock / skip-intro pill /
  next-episode + pause slots) and the gesture vocabulary both exist —
  gesture-vs-gesture matched in the component audit; thresholds/axis-lock/fling
  stop are grilling material, not gaps.
- Track/subtitle selection: native `SubtitleModal` + `AudioTrackModal` with
  language preferences, SDH filter, style panel; web capsule dialogs are
  thinner (no filtering, no preferred-language persistence). — needs-logic
- Sources panel: native `PlayerSourcesPanel` + `PlayerStreamList` (in-place
  switching); web phone has a sources capsule but no in-place panel. —
  needs-JSX + needs-logic
- Episodes panel: native `PlayerEpisodesPanel`; web phone has no in-player
  episode list. — needs-JSX + needs-logic
- Side panel: native `PlayerSidePanel`; no web equivalent. — needs-JSX
- Skip-intro: native `SkipIntroButton` backed by `SkipIntroApi`/repository with
  submit dialog; web pill exists but has no API-backed timing or submit flow.
  — needs-logic
- Parental-guide overlay: native `ParentalGuideOverlay` + repository; no web
  equivalent. — needs-JSX + needs-logic
- External-player launch: native `ExternalPlayerLauncherEffect` + coordinator;
  web has URL helpers but no phone launch flow. — needs-logic
- Play-availability gating: native `PlaybackAvailability` (`972109f` disables
  play with no source); web play button has no no-source disabled state. —
  needs-logic

## 4. Library — diverged (saved + cloud present, management chrome missing)

Native: `features/library/LibraryScreen.kt`. Web:
`js/ui/screens/library/libraryScreen.js`.

- Saved shelves/grid, cloud filter/search rows, list-picker sheet, zoom menu,
  windowed grid (shared `virtualPosterGrid` core) — all present.
- Sort/layout control: native `LibraryDisplaySettingsRepository` (layout-mode
  toggle + sort option row, `:271/:412`); web has a layout setter but no sort
  UI on phone. — needs-JSX + needs-logic
- Tracking membership feedback: native `TrackingMembershipFeedback` +
  removal-confirmation dialogs; web list-picker acts without the
  confirm/feedback layer. — needs-JSX
- Inline states: native `NuvioNetworkOfflineCard`, per-tab
  `HomeEmptyStateCard`, skeleton toolbar + rows; web saved-empty exists but no
  offline card and no skeleton path. — needs-JSX
- Cloud file rows: native `CloudLibraryFilePicker`/`CloudLibraryFileRow` with
  status lines and display-status mapping; web cloud rows are shallower. —
  needs-JSX + needs-logic

## 5. Search / Discover — diverged (feature-rich, states thin)

Native: `features/search/SearchScreen.kt`. Web: `searchScreen.js` +
`discoverScreen.js`.

- Search, debounced commit, recent terms with removal, discover filters via
  bottom sheet, offline status flag — all present.
- Empty-state reasons: native distinguishes NoActiveAddons /
  NoSearchCatalogs / RequestFailed(+retry) / NoResults (`:386-442`); web
  collapses these with no retry affordance on failure. — needs-JSX +
  needs-logic
- Recent row: native `SearchRecentSection`/`SearchRecentRow` with offline card
  inside failure state; web recents are a simpler list. — CSS-only + needs-JSX
- Skeleton rows while resolving; web has no search skeleton. — needs-JSX

## 6. Catalog see-all — closest to parity

Native: `features/catalog/CatalogScreen.kt`. Web: `catalogSeeAllScreen.jsx`.

- Grid, windowing, skeleton, empty state, zoom menu, list picker, header
  padding — all present. Column-count rule
  (`catalogGridColumnsForWidth` vs web geometry) is tuning, not a gap.
- Offline card: native `CatalogEmptyState` embeds `NuvioNetworkOfflineCard` on
  failure; web `EmptyState` has no offline variant. — needs-JSX
- Loading footer (`CatalogLoadingFooter` pagination hint); web appends
  silently. — CSS-only
## 7. Settings — diverged (largest surface, several native-only pages)

Native: `features/settings/` (~40 pages; `SettingsScreen.kt` with search-reveal,
`SettingsSearch`, full-screen pages). Web: `settingsScreen.js`.

- Settings search with scroll-reveal (`SettingsSearchRevealThreshold`, haptic +
  240ms animation, `:600-644`); web has no settings search. — needs-JSX +
  needs-logic
- Nav-bar style picker — OUT OF SCOPE per map (noted, no action).
- Poster-customization page — OUT OF SCOPE per map (noted, no action).
- Custom theme editor + preview (`CustomThemeEditor`, generative Custom
  palette) — web covers 7 fixed presets only. — needs-JSX + needs-logic
- App-icon picker (platform-gated); web has no install icon to change —
  likely N/A, flag for grilling. — needs-logic
- Native pages with no web section: Notifications, MDBList, Simkl sync-info
  dialog, Sentry/privacy, Continue-watching preferences, Home-screen (hero)
  preferences, Meta-screen preferences, in-settings Supporter membership card.
  Each small; enumerate at spec time. — needs-JSX (mostly)
- Appearance themes, language, playback, tracking/Trakt, debrid, TMDB,
  addons/plugins entry points — present on both.

## 8. Account / Auth / Onboarding — diverged (flows exist, native depth greater)

Native: `features/auth/AuthScreen.kt` (mobile + large layouts, device-link),
`features/profiles/`. Web: `accountScreen.jsx`,
`accountSettingsContent.jsx`, `authSignInScreen.jsx`,
`authQrSignInScreen.jsx`, `syncCodeScreen.jsx`,
`essentialAddonSetupScreen.jsx`, `experienceModeSelectionScreen.jsx`.

- Sign-in / QR / sync code / profiles / sync overview / onboarding setup +
  experience-mode — all present on web. No native onboarding flow found
  (`grep onboarding` in the native tree returns nothing) — web onboarding is
  web-only by necessity, not a gap.
- Device-link beyond QR: native `DeviceLinkAuthSection` +
  `ServerConnectionDialogs`; web QR covers the headless-TV-link case only. —
  needs-logic (grilling: is server-connection relevant to a browser client?)
- Auth brand/gradient treatment — visual, token-adjacent; grilling material.
  — CSS-only

## 9. Cast (person detail) — diverged, thin on both

Native: `features/details/PersonDetailScreen.kt` + `TmdbEntityBrowseScreen.kt`.
Web: `castDetailScreen.jsx` (hero, biography, empty state, skeleton).

- Filmography rail: native carries browsable entity rails; web shows hero +
  biography only, no filmography/known-for rail. — needs-JSX + needs-logic
- Hero/skeleton/empty present on web. `CastSharedTransition.kt` has no web
  equivalent — motion-grilling material, not a screen gap.

## 10. Stream (source list) — diverged (actions + resume chrome missing)

Native: `features/streams/StreamsScreen.kt` (hero blocks, provider filter row,
stream sections, `StreamActionsSheet`, `ResumeBanner`, availability gating).
Web: `streamScreen.jsx` (flattened/merged items, badge chips, debrid identity).

- Per-stream actions sheet (copy link / download / open externally,
  `:1135-1160`); web has no stream long-press/menu. — needs-JSX + needs-logic
- Resume banner (`ResumeBanner:587-624`, percent-or-clock pill); web has no
  resume affordance on the stream list. — needs-JSX
- Provider filter row (`:776`, filter chips); web merges streams without
  provider filtering. — needs-JSX + needs-logic
- Empty-state reasons (`NoAddonsInstalled` / `NoCompatibleAddons` /
  `StreamFetchFailed` / `NoStreamsFound`); web states less granular. —
  needs-JSX
- Playback-availability gating (`PlaybackAvailability.kt`, new since pin); web
  play path doesn't gate. — needs-logic
- Stream merging, quality/headline lines, badge chips, debrid identity are
  web-only depth with no native counterpart; keep.
## 11. Collection — diverged (viewer present, management absent)

Native: `features/collection/` (`FolderDetailScreen`, `CollectionEditorScreen`,
`CollectionManagementScreen`, sync service). Web: `folderDetailScreen.js`
(folder hero seed, source rows/tabs, round-robin merge).

- Collection editor (title/backdrop/pin/view-mode/show-all-tab) and management
  screen (add/edit/remove/reorder folders) have no web equivalent; web renders
  folder content only. Largest collection gap. — needs-JSX + needs-logic
- Folder viewing (source rows, tab labels, fallback merging) present.

## 12. Plugin / Addons — diverged, mild

Native: `features/addons/AddonsScreen.kt` (no dedicated plugins screen found).
Web: `pluginScreen.jsx`, `pluginsScreen.js`, `catalogOrderScreen.jsx`.

- Addon rows, install/manage entry, catalog ordering — present.
- Empty-state card (`EmptyStateCard:379`, personal-media copy variant); web has
  no addons empty state. — needs-JSX
- Catalog-order screen has no native counterpart found (web-only, keep).

## 13. Trakt / Supporters / Debug — present, shallow (phone CSS landed `b02c76f`)

Native: Trakt = repositories only (no dedicated screen — settings-integrated);
Supporters = `SupportersContributorsPage.kt`; no native debug console found.
Web: `traktScreen.jsx`, `supportersContributorsScreen.jsx` +
`supportersData.js`, `consoleDebugScreen.jsx`.

- All three render on phone. Trakt screen is web-only chrome over shared repos
  — keep. Debug console is a dev tool with no native counterpart — keep.
- Supporters cards: native `SupportersCard:600` layout vs web rows — visual
  comparison never done; flag for grilling, not a declared gap. — CSS-only
  (verify)

## Cross-screen notes (for the fidelity grilling, not gaps)

- `NuvioNetworkOfflineCard` appears on native home/library/search/catalog but
  on ZERO web phone screens — one shared primitive closes four rows above.
- `HomeEmptyStateCard` / `HomeSkeletonRow` / `SkeletonBlock` / `SkeletonPoster`
  are the same story: shared primitives, not per-screen work.
- Haptics accompany native sheets/menus everywhere; web has none (platform API
  gap — `navigator.vibrate` partial).
- Play long-press, CW next-up vs in-progress branching (`isNextUp`), and
  `skipPartiallyExpanded` sheet behavior are small logic deltas inside the rows
  above, not standalone gaps.
- Out of scope (map): Downloads screen, poster-card customization UI, nav-bar
  style toggle. Supabase #13 untouched except where a parity surface needs it
  (profiles/sync overview read from it — no new dependency found in this walk).

## Files touched by this research

- This file only (`parity-screens.md`). No app code changed.
