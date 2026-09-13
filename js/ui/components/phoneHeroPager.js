// Phone hero pager — pure layout/stretch/reserve math ported from NuvioMobile's
// HomeHeroSection.kt (parity #58). No DOM here: every function is a deterministic
// transformation of plain numbers so the behavior tests can assert the exact factors the
// native app uses without a browser. `homeScreenPhone.jsx`'s `bindHeroPager` applies these
// to the `.phone-hero` track and its parallax layers.

// Native hero pager constants (HomeHeroSection.kt).
export const HERO_BACKGROUND_PARALLAX = 0.055; // background moves at 5.5% of the page offset
export const HERO_BACKGROUND_SCALE = 1.14; // bleed so the parallax never reveals an edge
export const HERO_CONTENT_PARALLAX = 0.18; // content moves at 18% of the page offset
export const HERO_SWIPE_THRESHOLD_FRACTION = 0.16; // settle past 16% of the hero width
export const HERO_SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms (300 px/s) flick gate
export const HERO_AUTO_ADVANCE_MS = 8000; // auto-advance every 8s (HERO_AUTO_SCROLL_INTERVAL_MS)
export const HERO_SCROLL_PARALLAX = 0.3; // bg translateY factor while the page scrolls
export const HERO_SCROLL_UP_SCALE_MULTIPLIER = 0.002; // pull-up (overscroll) zoom per px
export const HERO_SCROLL_DOWN_SCALE_MULTIPLIER = 0.0001; // scroll-past zoom per px
export const HERO_SCROLL_MAX_SCALE = 1.3; // CSS ceiling for the stretch/zoom
export const MOBILE_HERO_VIEWPORT_RATIO = 0.82; // base height = 82% of viewport height
export const MOBILE_HERO_MIN_HEIGHT = 360; // dp/px floor
export const MOBILE_HERO_MAX_HEIGHT = 760; // dp/px cap

const HERO_DRAG_MAX_FRACTION = 1.15; // rubber-band allowance past one page while dragging

function heroModulo(value, mod) {
  return ((value % mod) + mod) % mod;
}

/**
 * Figures out where every slide sits on the hero track for a given `activeIndex` and
 * `dragFraction` (finger displacement as a fraction of the hero width, in [-1, 1]). The
 * track wraps: when the first slide is active, the last slide is the "previous" one (base
 * -1, off the left edge) and when the last is active, the first is "next" (base +1, off the
 * right edge) — the visual equivalent of NuvioMobile's `resolveHeroTargetPage` edge-wrap.
 *
 * Returns per-slide percentage factors for CSS `translateX`:
 * - `slideX` — the slide itself (the whole page tracks the finger)
 * - `bgX` — its background layer, scaled `HERO_BACKGROUND_SCALE` and moving at the
 *   background parallax rate (so it stays glued under the slide while lagging slightly)
 * - `contentX` — its text/logo/meta content, moving faster than the page (content parallax)
 */
export function computeHeroPageLayout({ itemCount = 0, activeIndex = 0, dragFraction = 0 } = {}) {
  const count = Number.isFinite(itemCount) ? Math.trunc(itemCount) : 0;
  if (count <= 0) {
    return { slides: [], activeIndex: 0, dragFraction: 0 };
  }
  const clampedActive = heroModulo(Math.trunc(activeIndex), count);
  const clampedDrag = Number.isFinite(dragFraction) ? dragFraction : 0;

  const slides = [];
  for (let index = 0; index < count; index += 1) {
    const delta = heroModulo(index - clampedActive, count);
    const base = delta === 0 ? 0 : delta === count - 1 ? -1 : delta;
    const pageOffset = base + clampedDrag;
    slides.push({
      index,
      base,
      pageOffset,
      slideX: pageOffset * 100,
      bgX: -pageOffset * HERO_BACKGROUND_PARALLAX * 100,
      contentX: -pageOffset * HERO_CONTENT_PARALLAX * 100
    });
  }

  return { slides, activeIndex: clampedActive, dragFraction: clampedDrag };
}

/** The maximum `dragFraction` the hero track follows before rubber-banding (the finger can
 * overshoot by this much past one full page; the settle snaps back to a whole page). */
export function heroDragMaxFraction() {
  return HERO_DRAG_MAX_FRACTION;
}
/**
 * The hero's height ceiling in px — the web version of `HomeHeroSection.mobileHeroHeight`
 * (the "stretch within the CSS ceiling", delivered as a strict max-height bound at mount).
 * `belowSectionHeightHintPx` is the "viewport reserve": the height that must stay visible
 * below the hero (on phones under 600dp this protects the Continue Watching shelf, matching
 * `HomeScreen.kt`'s `continueWatchingHeroViewportReserveHeight`). When the reserve would be
 * violated the hero is capped so the section below stays on screen; the result is always
 * clamped into [minHeightPx, maxHeightPx].
 */
export function resolvePhoneHeroMaxHeight({
  viewportHeightPx = 0,
  belowSectionHeightHintPx = 0,
  widthPx = 0,
  viewportRatio = MOBILE_HERO_VIEWPORT_RATIO,
  minHeightPx = MOBILE_HERO_MIN_HEIGHT,
  maxHeightPx = MOBILE_HERO_MAX_HEIGHT
} = {}) {
  const viewportHeight = Number.isFinite(viewportHeightPx) ? Math.max(0, viewportHeightPx) : 0;
  const belowHint = Number.isFinite(belowSectionHeightHintPx)
    ? Math.max(0, belowSectionHeightHintPx)
    : 0;
  const width = Number.isFinite(widthPx) ? Math.max(0, widthPx) : 0;

  const viewportDriven = viewportHeight * (Number.isFinite(viewportRatio) ? viewportRatio : 0);
  const widthFallback = width * 1.16;
  const hasReserve = belowHint > 0 && viewportHeight > 0;

  const baseHeight =
    hasReserve || viewportHeight <= 0
      ? (viewportHeight > 0 ? viewportDriven : 0) || widthFallback
      : Math.min(viewportDriven, widthFallback);

  const maxAllowedFromViewport = hasReserve ? viewportHeight - belowHint : null;
  const capped =
    maxAllowedFromViewport != null ? Math.min(baseHeight, maxAllowedFromViewport) : baseHeight;
  const minHeight =
    maxAllowedFromViewport != null
      ? Math.min(minHeightPx, Math.max(0, maxAllowedFromViewport))
      : minHeightPx;

  return Math.max(minHeight, Math.min(maxHeightPx, Math.max(0, capped)));
}
/**
 * The hero background's zoom while the page scrolls — the web spin of NuvioMobile's
 * `heroBackgroundScrollScale`/`heroStretchZoom`. Scroll down past the hero (positive `dyPx`)
 * barely grows it; pull/overscroll up (negative, only reachable while the hero starts the
 * page) grows it 20× faster. Either way it is capped at `HERO_SCROLL_MAX_SCALE` — the CSS
 * ceiling.
 */
export function computeHeroStretchScale({
  dyPx = 0,
  upMultiplier = HERO_SCROLL_UP_SCALE_MULTIPLIER,
  downMultiplier = HERO_SCROLL_DOWN_SCALE_MULTIPLIER,
  maxScale = HERO_SCROLL_MAX_SCALE
} = {}) {
  const dy = Number.isFinite(dyPx) ? dyPx : 0;
  const scaleIncrease = dy < 0 ? Math.abs(dy) * upMultiplier : dy * downMultiplier;
  return Math.min(maxScale, 1 + Math.max(0, scaleIncrease));
}

/** The background's translateY while the page scrolls — `heroBackgroundScrollTranslationY`
 * (the sticky-parallax feel as the hero scrolls up under the nav). */
export function computeHeroScrollParallaxTranslationY(scrollTopPx, factor = HERO_SCROLL_PARALLAX) {
  const scrollTop = Number.isFinite(scrollTopPx) ? Math.max(0, scrollTopPx) : 0;
  return scrollTop * factor;
}
