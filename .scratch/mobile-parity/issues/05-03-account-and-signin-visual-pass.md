# 05-03 — Account/sign-in-adjacent screens visual pass

**What to build:** A visual-only rebuild of the account, sign-in, QR/device-linking, and
sync-code screens to match the phone design tokens/component language — these screens are
already tap-functional (the prior `phone-touch-responsive` effort made `onPointerActivate`
work for account/sync-code, and the sign-in/QR screens already had working native
`onclick` handlers). This ticket does not change any interaction logic — only markup/CSS to
match `--phone-*` tokens, card/row styling consistent with `05-01`'s settings visual
language, and (for account) an avatar treatment consistent with `05-02`'s profile cards.

**Blocked by:** 00-01 (tokens), 05-01 (for consistent card/row styling to match)

**Status:** done

- [x] Account, sign-in, QR sign-in, and sync-code screens visually match the phone design
      system (colors, type, spacing, radii)
- [x] No interaction logic changed — every tap/action that worked before this ticket still
      works identically after
- [x] D-pad/remote regression check on all four TV-mode screens shows no behavior change
      (verified live for `authSignIn`, the only one of the four reachable through a real
      browser session; the other three are byte-identical guard-clause/verbatim-extraction
      patterns confirmed by diff inspection — see Comments)
- [x] Manually verified in a phone-sized viewport (real browser DOM + real phone.css/base.css
      cascade for all five files; see Comments for exactly how, given `resize_window` doesn't
      change the actual viewport in this sandbox)

## Comments

**What was built.** Five phone render modules (`accountScreenPhone.js`,
`accountSettingsContentPhone.js`, `authQrSignInScreenPhone.js`, `authSignInScreenPhone.js`,
`syncCodeScreenPhone.js`), each a pure markup function reused by a small guard-clause/dispatch
addition in its TV screen file, mirroring the `homeScreenPhone.js` reference pattern. All five
reuse the `phone-settings-card`/`phone-settings-row*` family from 05-01 and 05-03's own shared
`phone-auth-*`/`phone-qr-*`/`phone-settings-dialog*` chrome for the auth/QR/sync-code screens,
plus a 05-02-style avatar chip for the account identity row. `authQrSignInScreen.js`'s change is
a verbatim move-extraction of the old inline `mount()` body into a new `renderShell()` method (so
a phone/TV branch could be added around it) — no markup logic changed, confirmed by diff.

**Review findings and how they were handled.** Two independent reviewers ran: a Standards axis
review and a combined Spec + TV-regression-risk review.

- Standards review found zero hard violations. It flagged the per-file `escapeHtml()`
  duplication and `accountSettingsContentPhone.js`'s loose `(value, label)` parameter shape as
  baseline smells — both confirmed to be pre-existing house style copied faithfully from the TV
  originals, not new debt introduced by this ticket, so no fix was needed.
- Spec review returned a SAFE verdict on TV-regression risk (traced every guard clause and
  confirmed the `authQrSignInScreen.js` extraction is whitespace-only vs. the old inline
  template). Its one real gap: the "manually verified in a phone-sized viewport" and "D-pad
  regression" checklist items were claimed by the original implementer but only backed by
  Node-side smoke tests calling the render functions with mock state — not an actual browser
  render. That gap is what this pass closed (see below).

**Manual verification actually performed.** This sandbox's `resize_window` tool does not change
the real browser viewport (`window.innerWidth` stayed pinned regardless of the requested size —
confirmed by requesting 390px, 450px, and 1600px and observing no change), so a literal "resize to
390x844 and look" wasn't possible. Instead:
- Built `dist/` and served it locally, loaded it in the real Chrome instance, and forced phone
  mode for real by overriding `matchMedia` for the `(max-width: 600px)` query and injecting the
  *actual* `--phone-*` token block and phone.css rule block (both normally gated behind that same
  media query) unwrapped into the page — i.e. the real CSS cascade, not a mock. `authSignIn` was
  reached this way through its own real code path (a live click on its "Sign In" button opened
  the phone-styled email/password bottom-sheet dialog, screenshotted, confirmed correct crimson
  accent theming, avatar-less centered layout, and bottom-sheet slide-up chrome).
- `account`, `authQrSignIn`, and `syncCode` are not reachable through any live user flow at all
  right now — grepping the codebase confirms no `Router.navigate("authQrSignIn"/"syncCode")` call
  exists anywhere outside `router.js`'s own route table, and `app.js` explicitly comments "Guest/
  anonymous access has been disabled ... No bypass and no QR code flow anymore," gating
  signed-out users to only `authSignIn`/`trakt`. This is a pre-existing app-wide condition, not
  something this ticket introduced or is in scope to fix. To still get a real-browser check for
  these (plus `accountSettingsContent`, which the standards reviewer confirmed is dead code with
  no live callers), each module's exported render function was loaded directly as an ES module in
  the same real Chrome tab against the same real `base.css`/`phone.css` (forced-unwrapped as
  above) with representative mock state, and screenshotted. All five rendered correctly: proper
  card/row/dialog chrome, avatar chips with initial letters and accent colors, QR card layout,
  sync-code action list, and bottom-sheet dialogs peeking in from the bottom edge with the dimmed
  scrim. No console errors in any of the five.
- D-pad/remote regression: rebuilt+served TV mode (no override) and drove `authSignIn` with real
  keyboard input — Enter on the focused "Sign In" card opened the (unchanged) TV email dialog,
  Escape closed it back to the focused card, matching pre-ticket behavior exactly. The other three
  screens' guard clauses are structurally identical `if (Platform.isPhoneViewport()) { return }`
  insertions before byte-identical TV bodies (confirmed by diff, not just by claim), so the same
  conclusion holds for them without needing a separate live keyboard pass.

Prettier, ESLint (ran explicitly against `js/ui/screens/account/**/*.js` since the repo's
`lint:home:incremental` script only covers `js/ui/screens/home/**`), `npm test` (75/75), and
`npm run build` all pass clean. A before/after `dist` diff shows only `app.bundle.js` and
`css/phone.css` changed, as expected.
