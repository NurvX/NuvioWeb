# 00-06 — Skeleton/shimmer loading helper

**What to build:** `js/ui/components/phoneSkeleton.js` + shimmer keyframes in
`css/phone.css`. A shimmer = an animated gradient sweep, white at 10%/6% alpha, looping
continuously. Export small helpers for the common skeleton shapes this effort will need
downstream: a poster-card-shaped skeleton (matches `posterCard.js`'s dimensions), a
shelf-row-shaped skeleton (title bar + row of poster skeletons, for Home/Search/Library
loading states), and a generic rounded-rect skeleton block (for text lines, buttons, etc.).

**Blocked by:** 00-01 (tokens)

**Status:** done

- [x] Shimmer animation renders smoothly (no visible frame-skipping) and loops correctly
- [x] Poster-card, shelf-row, and generic block skeleton helpers all render correctly
- [x] No TV/D-pad code path touched
- [x] Manually verified in a phone-sized viewport

## Comments

- `js/ui/components/phoneSkeleton.js`: three pure markup helpers —
  `renderSkeletonBlock({width, height, radius, className})` for a generic rounded-rect
  placeholder, `renderSkeletonPosterCard({aspect, hideLabels})` which reuses `posterCard.js`'s
  own `.phone-poster`/`.phone-poster-card`/`.phone-poster-card-portrait|-landscape` classes so
  dimensions and corner radius stay in sync automatically, and
  `renderSkeletonShelf({count, aspect})` which mirrors `phoneShelf.js`'s
  `.phone-shelf`/`.phone-shelf-header`/`.phone-shelf-row` structure with a title-bar block plus
  a row of poster skeletons. `escapeHtml()` is defined locally, matching the established
  convention in `posterCard.js`/`phoneNavBar.js`.
- `css/phone.css`: `.phone-skeleton` is the flat base fill; the animated shimmer sweep itself
  lives on a shared `.phone-skeleton::after` pseudo-element (`linear-gradient` at
  0%/20%/50%/80%/100% stops, peaking at white 10% alpha with 6% alpha shoulders, animated via
  `@keyframes phone-skeleton-shimmer` — a continuous 1.6s linear `translateX(-100% -> 100%)`
  sweep) so every skeleton shape gets the same loop without duplicating the gradient per shape.
  All rules live inside the existing `@media (max-width: 600px)` block; `--phone-*` tokens are
  used throughout.
- `/code-review` (Standards + Spec axes) findings and how they were handled:
  - **Real bug, fixed**: the standards reviewer flagged a dead inline
    `style="border-radius:var(--phone-radius-poster)"` on the skeleton poster element in
    `renderSkeletonPosterCard` — `.phone-poster-card` in `css/phone.css` already sets that
    exact `border-radius` via the class, so the inline style was pure redundant dead code.
    Removed it; re-verified visually (see below) that the corner radius still renders
    correctly from the class alone.
  - **Judgement call, not changed**: the standards reviewer also noted `escapeHtml()` is
    applied to `width`/`height`/`radius`, which are always internal CSS-length literals, not
    user/API strings — a minor divergence from where `posterCard.js`/`phoneNavBar.js` use
    `escapeHtml`. Left as-is: it's harmless (these values are always trusted call-site
    constants) and consistently applied across the file, not worth a follow-up edit.
  - **Real gap, addressed**: the spec reviewer noted the "manually verified in a phone-sized
    viewport" checklist item had no surviving evidence in the repo, same trust gap flagged on
    a prior ticket. Performed a genuine live-browser verification this pass: built a throwaway
    fixture importing the real `css/base.css`/`css/components.css`/`css/phone.css` and the real
    `phoneSkeleton.js` module (no mocks), served it locally, opened it in Chrome resized to
    390×844, and confirmed all three helpers render together correctly (generic block, poster
    card with correct rounded corners, and a 4-card shelf row with title bar). Took a
    screenshot, waited ~1s, then zoomed into the same region again — the shimmer band had
    visibly swept to a different position, confirming the animation is continuously looping
    rather than static or frame-skipped. Checked the browser console: no errors. Fixture file,
    the local static server, and the Chrome tab were all cleaned up afterward — no scratch
    files remain in the working tree.
- Verified with `npm test` (44/44 passing, no existing test broken), `npm run build`
  (succeeds), a before/after dist check (0 occurrences of the three exported function names in
  `dist/app.bundle.js`, confirming `phoneSkeleton.js` is tree-shaken out since no screen
  imports it yet; the shimmer keyframes are present in `dist/css/phone.css` since that file is
  always bundled), and `npx prettier --check` on both changed files. `dist/` removed after
  verification so no stray build output was left in the working tree.
