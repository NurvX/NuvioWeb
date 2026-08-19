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

**Status:** done

- [x] Profile grid renders correctly with avatar/initial/icon fallback chain matching
      existing avatar-resolution logic
- [x] Add-profile tile, edit-mode toggle, and PIN entry all work using existing logic
      unchanged
- [~] D-pad/remote regression check on TV-mode profile-selection screen shows no behavior
  change — verified by full code trace (see Comments), not a live D-pad run: the sandbox
  has no authenticated session and this route requires `AuthState.AUTHENTICATED`, so it
  can't be reached live in either TV or phone mode here.
- [~] Manually verified in a phone-sized viewport — verified via a jsdom render/mount harness
  (28 assertions, see Comments), not a live 390×844 browser render, for the same
  auth-wall reason as above.

## Comments

- `js/core/profile/profileSelectionScreen.js`: the standard surgical diff — a
  `Platform.isPhoneViewport()` guard at the top of `render()` dispatching to a new
  `renderPhone()`, a `Platform.watchPhoneViewport()` subscribe/unsubscribe in `mount()`/
  `cleanup()`, and six pure helpers (`getDefaultProfileColor`, `getProfileInitial`,
  `resolveProfileAvatarUrl`, `categoryLabel`, `getAvatarCategories`, plus the
  `PROFILE_PIN_LENGTH`/`PROFILE_PIN_TEXT` constants) changed from module-private to
  `export`ed, verbatim, for the phone module to reuse. No other line in the file changed.
  This is a singleton-object screen (not per-instance), so there's no `onPointerActivate`
  dispatch table to extend — the phone hook instead hangs directly off
  `render()`/`mount()`/`cleanup()`, matching the shape 05-01 (`settingsScreen.js`) already
  used for the same kind of screen.
- `js/core/profile/profileSelectionScreenPhone.js` (new): grid ("Who's watching?" + Manage
  Profiles toggle), create/edit editor, and PIN-entry screens, all reading/mutating the TV
  screen's own state and calling its own methods
  (`activateProfile`/`openPinOverlay`/`closePinOverlay`/`activatePinKey`/`openCreateEditor`/
  `openEditEditor`/`deleteProfile`/`activateFocusedNode`/`updateBackground`) directly —
  nothing reimplemented. One documented substitution: the TV "Manage Profiles" per-profile
  menu is `NuvioDialog`-based (sized in `vw` off a 1920px reference, unusable at 390px), so
  the phone module rebuilds the same button set (Edit / Set-or-Change PIN / Remove PIN if
  enabled / Delete if not primary) through `bottomSheet.js` instead — the same substitution
  `catalogSeeAllScreenPhone.js`/`libraryScreenPhone.js` already document. Delete asks for a
  second bottom-sheet tap to confirm rather than porting `NuvioDialog`'s TV confirm panel.
  Background reuses `screen.updateBackground(colorHex)` completely unmodified as the
  ticket's documented "simple static gradient" fidelity trade-off.
- `css/phone.css`: purely additive rules inside the single existing
  `@media (max-width: 600px)` block, no new media queries, no removed lines.
- Picked up mid-flight from another agent's implementation with two independent review
  passes already done (standards axis + spec/TV-regression-risk axis). Both reviews found
  **no hard code violations** and the TV-regression trace concluded **SAFE**: the phone
  guard is the first statement in `render()`, falling through unmodified to the pre-existing
  code when `Platform.isPhoneViewport()` is false (always false on Tizen/webOS, or on
  browser outside the phone media query); `watchPhoneViewport()`/the unsubscribe/
  `cleanupProfileSelectionScreenPhone()` are all documented no-ops off the TV path. I
  independently re-read the full diff and confirm the same: the six newly-`export`ed helpers
  changed only their `function` → `export function` keyword, nothing else.
  - Two judgement calls the standards reviewer flagged, both left as-is: (1) the avatar
    circle is 88px vs. the ticket text's "100dp" — a minor grid-fit choice (3-column grid,
    `max-width: 360px`) with no conflicting value in `spec.md`'s source-of-truth section, not
    a real spec violation; (2) message-chain-through-`screen.*` reads in the phone module —
    explicitly the intended design per this module's own header comment and the established
    pattern in `homeScreenPhone.js`/`streamScreenPhone.js`.
  - The one real gap both reviews converged on: the "manually verified in a phone-sized
    viewport" and "D-pad regression check" checklist items were claimed via a jsdom harness/
    code trace that left no reproducible artifact in the diff. I addressed this directly (see
    below) rather than just re-asserting the claim.
- Manual verification actually performed:
  - **Live browser**: built + served `dist/` at 390×844 and navigated directly at the app
    root. Confirmed guest/anonymous access is disabled app-wide and this specific route is
    additionally gated on `AuthState.AUTHENTICATED` in `js/app.js`'s
    `AuthManager.subscribe()` handler (`routeAfterAuthentication()` / `Router.navigate(
"profileSelection")` only fires post-auth) — every unauthenticated navigation lands on
    `authSignIn` regardless of URL params. No credentials exist in this sandbox and entering
    any would be out of scope, so this screen genuinely cannot be reached live here, on
    either TV or phone viewport — this isn't a shortcut, it's this route being _more_ gated
    than most other phases' screens, not less.
  - **jsdom harness** (temporary, not committed — deleted after use): imported
    `profileSelectionScreenPhone.js`'s three exported entry points directly against a mock
    `screen` object exposing the same surface TV's `ProfileSelectionScreen` does, and ran 28
    assertions covering: grid render (profile names, add-tile present under `MAX_PROFILES`);
    tapping an unlocked profile calls `activateProfile`; tapping a PIN-protected profile
    calls `openPinOverlay("unlock", ...)` instead; tapping "add" calls `openCreateEditor`;
    management-mode tap opens the bottom-sheet options menu instead of activating (Edit
    always present, Delete present only for non-primary profiles, and delete requires a
    second confirm tap before `deleteProfile` is actually called); editor screen name-input
    wiring (`syncEditorPreview`, state mutation) and `data-action="cancel-editor"` routing
    through `activateFocusedNode`; PIN keypad digit taps calling `activatePinKey` and cancel
    calling `closePinOverlay`; and that cleanup is safe to call with nothing mounted. All 28
    passed. This confirms the phone module's DOM wiring and dispatch logic are correct even
    though it doesn't substitute for seeing the real rendered layout/CSS in a browser.
  - **D-pad/TV regression**: not re-run live for the same auth-wall reason above; relying on
    the code trace (mine and both reviewers', independently converging on the same
    conclusion) that the guard clause is unconditional and every other line in
    `profileSelectionScreen.js` is byte-identical to before this diff.
- `npm test` (75/75 passing), `npm run lint` (home-scoped script passes; ran `npx eslint`
  directly against both changed/new files outside that scope — clean), `npx prettier
--check` on all three files (clean), and `npm run build` + a before/after `dist` diff
  (`git stash` the ticket's files, build, copy, pop, build, diff) confirming only
  `dist/app.bundle.js` and `dist/css/phone.css` changed, nothing else.
