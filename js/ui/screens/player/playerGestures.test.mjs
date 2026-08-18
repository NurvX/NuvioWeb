import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/"
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;

const {
  classifyHorizontalZone,
  classifyVerticalDragSide,
  isNearVerticalEdge,
  resolveDragAxis,
  computeSeekRateSecondsPerPixel,
  computeSeekPreviewSeconds,
  computeVerticalDragValue,
  isDoubleTap,
  attachPlayerGestureLayer,
  PLAYER_GESTURE_HOLD_SPEED
} = await import("./playerGestures.js");

// --- Pure classification functions ---

test("classifyHorizontalZone: splits into left/middle/right thirds", () => {
  assert.equal(classifyHorizontalZone(10, 300), "left");
  assert.equal(classifyHorizontalZone(150, 300), "middle");
  assert.equal(classifyHorizontalZone(290, 300), "right");
  assert.equal(classifyHorizontalZone(50, 0), "middle", "no width falls back to middle");
});

test("classifyVerticalDragSide: splits into left/right halves", () => {
  assert.equal(classifyVerticalDragSide(10, 300), "left");
  assert.equal(classifyVerticalDragSide(200, 300), "right");
  assert.equal(classifyVerticalDragSide(150, 300), "right", "exact midpoint counts as right");
});

test("isNearVerticalEdge: true within the margin of top or bottom, false in the middle", () => {
  assert.equal(isNearVerticalEdge(5, 800, 28), true);
  assert.equal(isNearVerticalEdge(795, 800, 28), true);
  assert.equal(isNearVerticalEdge(400, 800, 28), false);
  assert.equal(isNearVerticalEdge(400, 0, 28), false, "invalid height never excludes");
});

test("resolveDragAxis: null while within lock tolerance on both axes, else the dominant axis", () => {
  assert.equal(resolveDragAxis(5, 5, 16), null);
  assert.equal(resolveDragAxis(30, 5, 16), "horizontal");
  assert.equal(resolveDragAxis(5, 30, 16), "vertical");
  assert.equal(resolveDragAxis(20, 20, 16), "horizontal", "ties favor horizontal");
});

test("computeSeekRateSecondsPerPixel: scales with duration, more sensitive (lower rate) for shorter content", () => {
  const shortRate = computeSeekRateSecondsPerPixel(120); // 2 min clip
  const longRate = computeSeekRateSecondsPerPixel(7200); // 2 hour movie
  assert.ok(shortRate < longRate, "shorter content must have a smaller seconds-per-pixel rate");
  assert.ok(shortRate > 0);
});

test("computeSeekRateSecondsPerPixel: clamps to sane bounds for zero/huge durations", () => {
  assert.equal(computeSeekRateSecondsPerPixel(0), computeSeekRateSecondsPerPixel(undefined));
  const huge = computeSeekRateSecondsPerPixel(10_000_000);
  const veryLong = computeSeekRateSecondsPerPixel(1_000_000);
  assert.equal(huge, veryLong, "rate is clamped at the top end");
});

test("computeSeekPreviewSeconds: moves forward/back from the base position and clamps to duration", () => {
  const forward = computeSeekPreviewSeconds({ baseSeconds: 100, dx: 100, durationSeconds: 3600 });
  assert.ok(forward > 100);
  const clampedHigh = computeSeekPreviewSeconds({
    baseSeconds: 3590,
    dx: 100000,
    durationSeconds: 3600
  });
  assert.equal(clampedHigh, 3600);
  const clampedLow = computeSeekPreviewSeconds({
    baseSeconds: 5,
    dx: -100000,
    durationSeconds: 3600
  });
  assert.equal(clampedLow, 0);
});

test("computeVerticalDragValue: dragging up increases, down decreases, clamped to 0..1", () => {
  const up = computeVerticalDragValue({ startValue: 0.5, dy: -200, viewportHeight: 800 });
  assert.ok(up > 0.5);
  const down = computeVerticalDragValue({ startValue: 0.5, dy: 200, viewportHeight: 800 });
  assert.ok(down < 0.5);
  const clampedTop = computeVerticalDragValue({
    startValue: 0.9,
    dy: -100000,
    viewportHeight: 800
  });
  assert.equal(clampedTop, 1);
  const clampedBottom = computeVerticalDragValue({
    startValue: 0.1,
    dy: 100000,
    viewportHeight: 800
  });
  assert.equal(clampedBottom, 0);
});

test("isDoubleTap: true only for the same zone within the delay window", () => {
  assert.equal(
    isDoubleTap({ lastTapAt: 1000, lastTapZone: "left", now: 1200, zone: "left" }, 260),
    true
  );
  assert.equal(
    isDoubleTap({ lastTapAt: 1000, lastTapZone: "left", now: 1400, zone: "left" }, 260),
    false,
    "too slow"
  );
  assert.equal(
    isDoubleTap({ lastTapAt: 1000, lastTapZone: "left", now: 1200, zone: "right" }, 260),
    false,
    "different zone"
  );
  assert.equal(isDoubleTap({ lastTapAt: 0, zone: "left", now: 100 }, 260), false, "no prior tap");
});

// --- DOM-facing wiring ---

function makeSurface({ width = 390, height = 700 } = {}) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height
  });
  document.body.appendChild(el);
  return el;
}

function dispatchPointer(el, type, { x = 0, y = 0, pointerId = 1, button = 0 } = {}) {
  const event = new dom.window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    button,
    clientX: x,
    clientY: y
  });
  el.dispatchEvent(event);
}

test("attachPlayerGestureLayer: a plain tap in the middle third fires onSingleTap after the double-tap delay, not immediately", async () => {
  const el = makeSurface();
  let taps = 0;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    doubleTapDelayMs: 30,
    onSingleTap: () => taps++
  });

  dispatchPointer(el, "pointerdown", { x: 195, y: 350 });
  dispatchPointer(el, "pointerup", { x: 195, y: 350 });
  assert.equal(taps, 0, "must wait out the disambiguation delay first");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(taps, 1);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: two quick taps on the left third fire a backward seek, not two single taps", async () => {
  const el = makeSurface();
  let taps = 0;
  let seekDirection = null;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    doubleTapDelayMs: 200,
    onSingleTap: () => taps++,
    onSeekTap: (direction) => {
      seekDirection = direction;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 30, y: 350 });
  dispatchPointer(el, "pointerup", { x: 30, y: 350 });
  dispatchPointer(el, "pointerdown", { x: 30, y: 350 });
  dispatchPointer(el, "pointerup", { x: 30, y: 350 });

  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(seekDirection, -1);
  assert.equal(taps, 0, "the double-tap must fully suppress the pending single tap");

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: two quick taps on the right third fire a forward seek", async () => {
  const el = makeSurface();
  let seekDirection = null;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    doubleTapDelayMs: 200,
    onSeekTap: (direction) => {
      seekDirection = direction;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 360, y: 350 });
  dispatchPointer(el, "pointerup", { x: 360, y: 350 });
  dispatchPointer(el, "pointerdown", { x: 360, y: 350 });
  dispatchPointer(el, "pointerup", { x: 360, y: 350 });

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(seekDirection, 1);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: a double-tap in the middle third fires onSingleTap exactly once, not twice", async () => {
  const el = makeSurface();
  let taps = 0;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    doubleTapDelayMs: 200,
    onSingleTap: () => taps++
  });

  dispatchPointer(el, "pointerdown", { x: 195, y: 350 });
  dispatchPointer(el, "pointerup", { x: 195, y: 350 });
  dispatchPointer(el, "pointerdown", { x: 195, y: 350 });
  dispatchPointer(el, "pointerup", { x: 195, y: 350 });

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(taps, 1);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: holding past the threshold fires onHoldStart, releasing fires onHoldEnd, and no tap fires", async () => {
  const el = makeSurface();
  const events = [];
  let taps = 0;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    holdThresholdMs: 20,
    doubleTapDelayMs: 200,
    onHoldStart: () => events.push("start"),
    onHoldEnd: () => events.push("end"),
    onSingleTap: () => taps++
  });

  dispatchPointer(el, "pointerdown", { x: 195, y: 350 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(events, ["start"]);
  dispatchPointer(el, "pointerup", { x: 195, y: 350 });
  assert.deepEqual(events, ["start", "end"]);

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(taps, 0, "a resolved hold must never also fire a tap");

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: horizontal drag reports scrub previews and commits on release", async () => {
  const el = makeSurface();
  const previews = [];
  let ended = null;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({
      width: 390,
      height: 700,
      currentSeconds: 100,
      durationSeconds: 3600,
      scrubEnabled: true
    }),
    onScrubMove: ({ previewSeconds }) => previews.push(previewSeconds),
    onScrubEnd: (result) => {
      ended = result;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 100, y: 350 });
  dispatchPointer(el, "pointermove", { x: 160, y: 350 });
  dispatchPointer(el, "pointermove", { x: 220, y: 350 });
  dispatchPointer(el, "pointerup", { x: 220, y: 350 });

  assert.equal(previews.length, 2);
  assert.ok(previews[1] > previews[0], "dragging further right previews further forward");
  assert.equal(ended.committed, true);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: a scrub drag cancelled by pointercancel does not commit", async () => {
  const el = makeSurface();
  let ended = null;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700, currentSeconds: 100, durationSeconds: 3600 }),
    onScrubEnd: (result) => {
      ended = result;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 100, y: 350 });
  dispatchPointer(el, "pointermove", { x: 160, y: 350 });
  dispatchPointer(el, "pointercancel", { x: 160, y: 350 });

  assert.equal(ended.committed, false);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: vertical drag on the left half reports brightness, not volume", async () => {
  const el = makeSurface();
  const brightnessValues = [];
  const volumeValues = [];
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700, brightness: 0.5, volume: 0.5 }),
    onBrightnessMove: (value) => brightnessValues.push(value),
    onVolumeMove: (value) => volumeValues.push(value)
  });

  dispatchPointer(el, "pointerdown", { x: 60, y: 400 });
  dispatchPointer(el, "pointermove", { x: 60, y: 350 });
  dispatchPointer(el, "pointerup", { x: 60, y: 350 });

  assert.ok(brightnessValues.length > 0);
  assert.equal(volumeValues.length, 0);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: vertical drag on the right half reports volume, not brightness", async () => {
  const el = makeSurface();
  const brightnessValues = [];
  const volumeValues = [];
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700, brightness: 0.5, volume: 0.5 }),
    onBrightnessMove: (value) => brightnessValues.push(value),
    onVolumeMove: (value) => volumeValues.push(value)
  });

  dispatchPointer(el, "pointerdown", { x: 330, y: 400 });
  dispatchPointer(el, "pointermove", { x: 330, y: 350 });
  dispatchPointer(el, "pointerup", { x: 330, y: 350 });

  assert.ok(volumeValues.length > 0);
  assert.equal(brightnessValues.length, 0);

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: a pointerdown too close to the top or bottom edge is ignored entirely", async () => {
  const el = makeSurface({ height: 700 });
  let taps = 0;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    edgeMargin: 28,
    doubleTapDelayMs: 20,
    onSingleTap: () => taps++
  });

  dispatchPointer(el, "pointerdown", { x: 195, y: 10 });
  dispatchPointer(el, "pointerup", { x: 195, y: 10 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(taps, 0, "a tap starting in the top edge margin must not register");

  dispatchPointer(el, "pointerdown", { x: 195, y: 695 });
  dispatchPointer(el, "pointerup", { x: 195, y: 695 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(taps, 0, "a tap starting in the bottom edge margin must not register");

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: shouldIgnoreTarget lets the caller exclude existing interactive chrome", async () => {
  const el = makeSurface();
  const button = document.createElement("button");
  button.className = "player-control-btn";
  el.appendChild(button);

  let taps = 0;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700 }),
    doubleTapDelayMs: 20,
    shouldIgnoreTarget: (target) => Boolean(target?.closest?.(".player-control-btn")),
    onSingleTap: () => taps++
  });

  dispatchPointer(button, "pointerdown", { x: 195, y: 350 });
  dispatchPointer(button, "pointerup", { x: 195, y: 350 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(taps, 0, "a pointerdown on excluded chrome must never start a gesture session");

  detach();
  el.remove();
});

test("attachPlayerGestureLayer: scrubEnabled:false suppresses scrub preview/commit for a horizontal drag", async () => {
  const el = makeSurface();
  let moved = false;
  let ended = false;
  const detach = attachPlayerGestureLayer(el, {
    getContext: () => ({ width: 390, height: 700, scrubEnabled: false }),
    onScrubMove: () => {
      moved = true;
    },
    onScrubEnd: () => {
      ended = true;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 100, y: 350 });
  dispatchPointer(el, "pointermove", { x: 200, y: 350 });
  dispatchPointer(el, "pointerup", { x: 200, y: 350 });

  assert.equal(moved, false);
  assert.equal(ended, false);

  detach();
  el.remove();
});

test("PLAYER_GESTURE_HOLD_SPEED is a sane finite multiplier greater than 1", () => {
  assert.ok(Number.isFinite(PLAYER_GESTURE_HOLD_SPEED));
  assert.ok(PLAYER_GESTURE_HOLD_SPEED > 1);
});
