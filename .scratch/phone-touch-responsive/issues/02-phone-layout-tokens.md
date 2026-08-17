# 02 — Phone layout-token & breakpoint infrastructure

**What to build:** A new family of CSS custom properties for phone layout (gutter, radius,
spacing, etc.), mirroring the structure of the existing TV-oriented layout tokens (which are
built around clamp()-based values tied to a 1920x1080 canvas), keyed to a single documented
breakpoint at a max-width around 600px — covers phones in portrait, including large ones, while
excluding small tablets. This ships as its own standalone change with no screen-level changes
bundled in; nothing consumes these tokens yet. CSS Container Queries are not used here or
anywhere in this effort — this project's compatibility floor predates their availability by a
wide margin, and no polyfill is being introduced for them. Plain viewport-width media queries
are used instead, via the existing CSS build pipeline.

This is the shared foundation the future Wave 2 responsive-reflow tickets (out of scope for now,
to be scoped separately once this exists) will build on.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A documented set of phone-oriented CSS custom properties exists, following the naming and
      structural convention of the existing TV-oriented layout tokens
- [x] Exactly one phone breakpoint is defined and documented (max-width ~600px)
- [x] The build passes with zero visual change to any existing screen (no screen consumes the new
      tokens yet)
- [x] No CSS Container Queries or other modern CSS feature requiring a polyfill is introduced

## Comments

Added a `--phone-*` token block to `css/base.css` immediately after the existing `--tv-*` block,
inside `@media (max-width: 600px) { :root { ... } }`, 1:1 name-mirrored (`tv` → `phone`) including
both `--tv-safe-gutter` and `--tv-safe-gutter-wide` (a first draft dropped the `-wide` gutter and
renamed `safe-gutter` to `gutter`; fixed after review to actually mirror the TV set 1:1 as the
ticket asks). Same plain-value/plain-value/`clamp()` triple-declaration pattern as the TV tokens.

Verified zero visual change with a before/after `npm run build` dist diff: the only build output
that changed is `dist/css/base.css`, and the only change inside it is the new token block being
appended — confirmed no selector anywhere in the codebase consumes any `--phone-*` variable yet.
