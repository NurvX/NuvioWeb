# 00-01 — Real phone design tokens (ported from NuvioMobile)

**What to build:** Replace the placeholder `--phone-*` token block in `css/base.css`
(introduced by the prior `phone-touch-responsive` effort as a structural mirror of the
`--tv-*` tokens, with guessed values) with the real values ported from NuvioMobile's
`composeApp/src/commonMain/kotlin/com/nuvio/app/core/ui/{Tokens,ThemeColors,TypeScale}.kt`:

- Colors: `--phone-text-primary #F5F7F8`, `--phone-text-secondary #B8BEC5`,
  `--phone-text-muted #969CA3`, `--phone-border-default #252A2A`, `--phone-success #66BB6A`,
  `--phone-warning #FFC857`, `--phone-danger #E36A8A`, `--phone-info #42A5F5`,
  `--phone-overlay-scrim rgba(0,0,0,.56)`. Plus 7 selectable accent presets as
  `--phone-accent-{crimson,ocean,violet,emerald,amber,rose,white}-{secondary,variant,bg,
  bg-elevated,bg-card,focus-ring}` (values in the epic spec.md) — ship all 7 as tokens even
  though only one is wired as "active" for now (`--phone-accent-secondary` etc. aliasing to
  Crimson, NuvioMobile's default).
- Typography: 13 named sizes (`--phone-type-label-xs` through `--phone-type-display-md`),
  each with a paired line-height token, using the JetBrains Sans-equivalent weight
  (`SemiBold`/`Bold`/`Regular` — pick the closest already-loaded web font or note if
  JetBrains Sans needs to be added as a web font in a follow-up).
- Spacing scale 1–96 (`--phone-space-1` … `--phone-space-96`) plus semantic aliases
  (`--phone-space-screen-h: 16px`, `--phone-space-section-gap: 24px`, etc.).
- Radius scale (`--phone-radius-xs` through `--phone-radius-full`) plus semantic aliases
  (`--phone-radius-card: 24px`, `--phone-radius-poster: 12px`, etc.).
- Motion: `--phone-motion-{instant,fast,normal,sheet-enter,sheet-exit,slow,cinematic}` (ms)
  and `--phone-ease-{standard,decelerate,accelerate}` (cubic-bezier).

All still scoped inside the existing `@media (max-width: 600px) { :root { ... } }` block.
Zero screen consumes any of these yet — this ships standalone, same as the prior effort's
phone-token ticket.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Every color, typography, spacing, radius, and motion token listed above exists in
      `css/base.css`, correctly scoped to the existing `max-width: 600px` breakpoint
- [x] Values match the source-of-truth extraction in `.scratch/mobile-parity/spec.md`
      (re-verify against a fresh clone of NuvioMobile if anything is ambiguous)
- [x] The build passes with zero visual change to any existing screen (before/after
      `npm run build` dist diff shows only `dist/css/base.css` changed, and nothing new
      consumes the tokens)
- [x] `npx prettier --check css/base.css` passes

## Comments

Implementation notes:

- Shipped all 7 accent presets (42 tokens) even though only Crimson is aliased as "active"
  (`--phone-accent-secondary` etc.) — matches the ticket's explicit ask to port all 7 for a
  future theme picker, not speculative addition (confirmed via code review).
- `--phone-font-family` aliases the existing `--app-font-family` (Inter) rather than loading
  JetBrains Sans — this repo doesn't have that font loaded yet; noted as a follow-up if
  pixel-exact font matching turns out to matter.
- `/code-review` (Standards + Spec axes) caught one real gap: the epic `spec.md` didn't
  actually contain the detailed value table this ticket's checklist references — it only
  existed in a private (non-repo) planning file. Fixed by adding a full "Source of truth:
  NuvioMobile design values" section to `.scratch/mobile-parity/spec.md` with the complete
  color/typography/spacing/radius/motion tables, so future tickets in this epic have a real,
  in-repo reference to verify against instead of a circular pointer.
- Also added inline comments in `base.css` for two values a reviewer flagged as
  suspicious-looking but are faithful to the source: `--phone-ease-emphasized` is
  byte-identical to `--phone-ease-standard` (true in NuvioMobile's own simplified token set,
  not a copy-paste error), and `--phone-accent-white-on-secondary` exists only for the White
  preset (real source asymmetry — White's near-white secondary needs inverted text color,
  unlike the other 6 presets' darker/saturated secondaries).
- Verified with a before/after `npm run build` dist diff: only `dist/css/base.css` changed,
  confirmed via `grep` that no selector anywhere in the codebase consumes any `--phone-*`
  token added by this ticket yet.
