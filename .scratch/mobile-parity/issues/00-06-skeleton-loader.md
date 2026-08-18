# 00-06 — Skeleton/shimmer loading helper

**What to build:** `js/ui/components/phoneSkeleton.js` + shimmer keyframes in
`css/phone.css`. A shimmer = an animated gradient sweep, white at 10%/6% alpha, looping
continuously. Export small helpers for the common skeleton shapes this effort will need
downstream: a poster-card-shaped skeleton (matches `posterCard.js`'s dimensions), a
shelf-row-shaped skeleton (title bar + row of poster skeletons, for Home/Search/Library
loading states), and a generic rounded-rect skeleton block (for text lines, buttons, etc.).

**Blocked by:** 00-01 (tokens)

**Status:** ready-for-agent

- [ ] Shimmer animation renders smoothly (no visible frame-skipping) and loops correctly
- [ ] Poster-card, shelf-row, and generic block skeleton helpers all render correctly
- [ ] No TV/D-pad code path touched
- [ ] Manually verified in a phone-sized viewport
