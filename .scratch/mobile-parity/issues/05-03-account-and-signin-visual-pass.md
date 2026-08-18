# 05-03 — Account/sign-in-adjacent screens visual pass

**What to build:** A visual-only rebuild of the account, sign-in, QR/device-linking, and
sync-code screens to match the phone design tokens/component language — these screens are
already tap-functional (the prior `phone-touch-responsive` effort made `onPointerActivate`
work for account/sync-code, and the sign-in/QR screens already had working native
`onclick` handlers). This ticket does not change any interaction logic — only markup/CSS to
match `--phone-*` tokens, card/row styling consistent with `05-01`'s settings visual
language, and (for account) an avatar treatment consistent with `05-02`'s profile cards.

**Blocked by:** 00-01 (tokens), 05-01 (for consistent card/row styling to match)

**Status:** ready-for-agent

- [ ] Account, sign-in, QR sign-in, and sync-code screens visually match the phone design
      system (colors, type, spacing, radii)
- [ ] No interaction logic changed — every tap/action that worked before this ticket still
      works identically after
- [ ] D-pad/remote regression check on all four TV-mode screens shows no behavior change
- [ ] Manually verified in a phone-sized viewport
