# 00-05 — Shelf/row primitive (`phoneShelf.js`)

**What to build:** `js/ui/components/phoneShelf.js` — the single most reused component in
this whole effort. Renders: a section title (`--phone-type-title-lg`) + optional "view all"
chevron pill button on the right, then a horizontally-scrolling row of `posterCard.js`
instances with ~10px gap between cards, native browser scroll (no custom snap/virtualization
needed — the TV app's manual-transform row positioning is explicitly not being ported, per
the epic spec's Out of Scope). Side padding matches `--phone-space-screen-h` (16px) at the
row's start/end.

Accept a variant flag for continue-watching-style larger landscape cards vs standard
portrait poster cards (Phase 1 needs both), and accept a "view all" callback that Phase 1+
screens wire to their own catalog/see-all navigation.

This is reused verbatim (per the epic spec) by: Home catalog/collection rows, Detail
related-content rows, Library horizontal mode, and Folder rows-mode — so get the scroll
behavior, spacing, and title/chevron treatment right here rather than in each consumer.

**Blocked by:** 00-01 (tokens), 00-04 (poster card)

**Status:** ready-for-agent

- [ ] Renders a title + "view all" affordance + horizontally-scrolling row of poster cards
- [ ] Both the standard portrait-card variant and the larger continue-watching-style variant
      work
- [ ] Scroll behavior feels native (momentum scrolling on touch, no jank)
- [ ] "View all" tap correctly invokes the caller-supplied callback
- [ ] No TV/D-pad code path touched
- [ ] Manually verified in a phone-sized viewport with enough items to require scrolling
