import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeHeroPageLayout,
  computeHeroStretchScale,
  computeHeroScrollParallaxTranslationY,
  heroDragMaxFraction,
  resolvePhoneHeroMaxHeight,
  HERO_BACKGROUND_PARALLAX,
  HERO_CONTENT_PARALLAX,
  HERO_SCROLL_MAX_SCALE
} from "./phoneHeroPager.js";

// Pure layout math ported from NuvioMobile's HomeHeroSection.kt (parity #58) — no DOM.

test("computeHeroPageLayout: centers the active slide and wraps neighbors", () => {
  const layout = computeHeroPageLayout({ itemCount: 3, activeIndex: 0, dragFraction: 0 });

  assert.equal(layout.activeIndex, 0);
  assert.deepEqual(
    layout.slides.map((slide) => [slide.index, slide.base, slide.pageOffset]),
    [
      [0, 0, 0], // active, centered
      [1, 1, 1], // next, one page right
      [2, -1, -1] // previous, wrapped one page left
    ]
  );
});

test("computeHeroPageLayout: wrap keeps the previous slide left of the first", () => {
  const layout = computeHeroPageLayout({ itemCount: 3, activeIndex: 0, dragFraction: 0.4 });
  const prev = layout.slides.find((slide) => slide.index === 2);
  assert.equal(prev.base, -1);
  assert.equal(prev.pageOffset, -0.6, "previous slide peeks in from the left while dragging right");
});

test("computeHeroPageLayout: parallax factors trail the page (bg slower, content faster)", () => {
  const layout = computeHeroPageLayout({ itemCount: 3, activeIndex: 0, dragFraction: 0.5 });
  const next = layout.slides.find((slide) => slide.index === 1);

  assert.equal(next.slideX, 150, "the page itself tracks the finger");
  assert.equal(next.bgX, -next.pageOffset * HERO_BACKGROUND_PARALLAX * 100, "bg parallax factor");
  assert.equal(next.contentX, -next.pageOffset * HERO_CONTENT_PARALLAX * 100, "content parallax");

  // Native: bg moves at 5.5% and content at 18% of the page offset.
  assert.equal(next.bgX, -8.25);
  assert.equal(next.contentX, -27);
});

test("computeHeroPageLayout: clamps the active index into the wrapped track", () => {
  const layout = computeHeroPageLayout({ itemCount: 2, activeIndex: 5, dragFraction: 0 });
  assert.equal(layout.activeIndex, 1, "index 5 of a 2-item track wraps to 1");
  assert.deepEqual(
    layout.slides.map((slide) => slide.base),
    [-1, 0],
    "first slide is the wrapped previous of the last (off the left edge)"
  );
});

test("computeHeroPageLayout: empty/zero counts return no slides", () => {
  assert.equal(computeHeroPageLayout({ itemCount: 0 }).slides.length, 0);
});

test("heroDragMaxFraction: smaller than a full page so the rubber-band overshoot stays bounded", () => {
  assert.ok(heroDragMaxFraction() > 1, "drag may overshoot one page");
  assert.ok(heroDragMaxFraction() < 1.5, "but never by half a page more");
});

test("resolvePhoneHeroMaxHeight: caps the viewport-driven height by the width fallback", () => {
  // Native: base = min(900 * 0.82, 420 * 1.16) = 487.2 when no reserve applies.
  const height = resolvePhoneHeroMaxHeight({ viewportHeightPx: 900, widthPx: 420 });
  assert.equal(height, 487.2);
});

test("resolvePhoneHeroMaxHeight: caps at the width fallback when the viewport drives no height", () => {
  const height = resolvePhoneHeroMaxHeight({ viewportHeightPx: 0, widthPx: 420 });
  assert.equal(height, 487.2, "420 * 1.16 fallback");
});

test("resolvePhoneHeroMaxHeight: the viewport reserve keeps the section below on screen", () => {
  // 900px tall phone, 220px reserved below the hero (CW shelf) → 680 max, and 900*0.82=738
  // would exceed it, so the reserve wins.
  const withReserve = resolvePhoneHeroMaxHeight({
    viewportHeightPx: 900,
    belowSectionHeightHintPx: 220,
    widthPx: 420
  });
  assert.equal(withReserve, 680, "hero capped to viewport minus the reserve");

  // ...and it can never drop below the reserve-aware minimum.
  const tiny = resolvePhoneHeroMaxHeight({
    viewportHeightPx: 300,
    belowSectionHeightHintPx: 260,
    widthPx: 360
  });
  assert.equal(tiny, 40, "min(360, 300-260)");
});

test("resolvePhoneHeroMaxHeight: clamps into the native 360..760 ceil", () => {
  const small = resolvePhoneHeroMaxHeight({ viewportHeightPx: 200, widthPx: 100 });
  assert.equal(small, 360, "never below the floor");
  const huge = resolvePhoneHeroMaxHeight({ viewportHeightPx: 5000, widthPx: 3000 });
  assert.equal(huge, 760, "never above the cap");
});

test("computeHeroStretchScale: pull-up grows 20x faster than scroll-past and is capped", () => {
  assert.ok(
    computeHeroStretchScale({ dyPx: -100 }) > computeHeroStretchScale({ dyPx: 100 }),
    "scrolling up (overscroll) zooms more than scrolling past"
  );
  // 100px pull-up with the native 0.002 multiplier → 1.2.
  assert.equal(computeHeroStretchScale({ dyPx: -100 }), 1.2);
  assert.equal(computeHeroStretchScale({ dyPx: 100 }), 1.01);
  assert.equal(computeHeroStretchScale({ dyPx: -10000 }), HERO_SCROLL_MAX_SCALE, "capped at 1.3");
  assert.equal(computeHeroStretchScale({ dyPx: 0 }), 1);
});

test("computeHeroScrollParallaxTranslationY: 30% of the scroll offset, non-negative", () => {
  assert.equal(computeHeroScrollParallaxTranslationY(0), 0);
  assert.equal(computeHeroScrollParallaxTranslationY(100), 30);
  assert.equal(computeHeroScrollParallaxTranslationY(-50), 0, "clamped at zero");
});
