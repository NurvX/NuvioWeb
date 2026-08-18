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

**Status:** done

- [x] Renders a title + "view all" affordance + horizontally-scrolling row of poster cards
- [x] Both the standard portrait-card variant and the larger continue-watching-style variant
      work
- [x] Scroll behavior feels native (momentum scrolling on touch, no jank)
- [x] "View all" tap correctly invokes the caller-supplied callback
- [x] No TV/D-pad code path touched
- [x] Manually verified in a phone-sized viewport with enough items to require scrolling

## Comments

- `js/ui/components/phoneShelf.js`: `renderPhoneShelf({id, title, items, variant,
viewAllLabel})` + `bindPhoneShelfEvents(container, {onViewAll, onLongPress, threshold,
moveTolerance})`. Renders a `--phone-type-title-lg` section title, an optional "view all"
  chevron pill (only when `viewAllLabel` is supplied), and a horizontally-scrolling row of
  real `posterCard.js` instances (`renderPosterCard`/`bindPosterCardEvents` — poster rendering
  itself is not reimplemented here). `variant` is `"portrait"` (default) or
  `"continueWatching"` (larger landscape cards via the `.phone-shelf-continuous` CSS scope);
  it controls the whole row's card `aspect` uniformly rather than per-item. Returns `""` for
  an empty `items` array. The "view all" button is chrome owned by this component and wired
  with a native `.onclick` (matching `phoneNavBar.js`/`bottomSheet.js`'s chrome-tap
  convention); poster tap continues to flow through the existing `onPointerActivate` contract
  and long-press through `bindPosterCardEvents`/`gestureEngine.attachLongPress`, delegated
  straight through rather than rewired.
- `css/phone.css`: `.phone-shelf*` rules added inside the existing single
  `@media (max-width: 600px)` block. Row uses native `overflow-x: auto` +
  `-webkit-overflow-scrolling: touch` (no custom snap/virtualization — the TV home screen's
  manual-transform row positioning is explicitly not ported, per the epic's Out of Scope
  note), a hidden scrollbar, and `~10px` card gap (`--phone-space-10`); side padding on both
  the header and the row matches `--phone-space-screen-h` (16px). The continue-watching
  variant widens `.phone-poster` to 220px inside `.phone-shelf-continuous`, which the
  landscape poster card's `aspect-ratio: 16/9` (driven off `width: 100%`) resizes correctly
  from. All values used are pre-existing `--phone-*` tokens from `css/base.css` — no new
  tokens were needed.
- `/code-review` (Standards + Spec axes) findings and how they were handled:
  - **Real gap, fixed**: "Manually verified in a phone-sized viewport with enough items to
    require scrolling" had a plausible-sounding write-up from the prior pass but no surviving
    artifact — the same gap this ticket's instructions specifically call out as having
    happened before. Re-did it live via `claude-in-chrome` at a 390×844 window: built a
    fixture importing the real `renderPhoneShelf`/`bindPhoneShelfEvents` (no mocks) with 10
    portrait items and 8 continue-watching items — enough to require scrolling in both rows —
    confirmed both variants render at their correct sizes (126px portrait / 220px landscape),
    confirmed the empty-items shelf renders nothing, scrolled the portrait row natively with
    mouse-wheel-as-touch input and watched it independently scroll past item 8, clicked the
    "view all" button and confirmed `onViewAll` fired with the right shelf id, and dispatched
    a real `pointerdown`/`pointerup` sequence past the long-press threshold on a poster card
    and confirmed `onLongPress` fired through the real, unmocked
    `gestureEngine.attachLongPress` timer. Screenshots taken during this session; the fixture
    HTML/JS/CSS copies were deleted afterward per the ticket's cleanup requirement.
  - **Judgement call, not changed**: both reviewers/this pass noted the `variant` value
    `"continueWatching"` maps to a CSS class named `.phone-shelf-continuous` — a small
    vocabulary mismatch (`continueWatching` vs `continuous`). Left as-is: both are documented
    with comments/JSDoc at their definition sites, it's not confusing in context, and a rename
    would touch both files for a purely cosmetic 1:1-naming win the reviewer themselves called
    optional.
  - No scope creep found by either reviewer: zero screen consumers
    (`grep -rn "phoneShelf" js/ui/screens/` empty), no `FocusEngine`/TV code touched, only
    `css/phone.css` (existing file, `@media` block only) and the new standalone
    `phoneShelf.js` changed.
- Verified with `npm test` (44/44 passing, no existing test broken), `npm run build`, a
  before/after dist check confirming `phoneShelf.js`/`renderPhoneShelf` do not appear anywhere
  in `dist/app.bundle.js` (tree-shaken out since no screen imports it yet, per this ticket's
  infrastructure-only scope), and `npx prettier --check` on both changed files.
