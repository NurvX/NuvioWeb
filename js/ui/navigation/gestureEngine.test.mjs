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
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.localStorage = dom.window.localStorage;

const {
  exceedsMoveTolerance,
  resolveTapOutcome,
  classifySwipe,
  computeSnapIndex,
  attachLongPress,
  attachSwipe,
  attachPager
} = await import("./gestureEngine.js");

// --- Pure classification functions ---

test("exceedsMoveTolerance: within tolerance is false, past it is true", () => {
  assert.equal(exceedsMoveTolerance(3, 4, 10), false); // distance 5
  assert.equal(exceedsMoveTolerance(6, 8, 5), true); // distance 10
  assert.equal(exceedsMoveTolerance(10, 0, 10), false); // exactly at tolerance
});

test("resolveTapOutcome: only a clean, un-fired, un-cancelled gesture is a tap", () => {
  assert.equal(resolveTapOutcome({}), true);
  assert.equal(resolveTapOutcome({ longPressFired: true }), false);
  assert.equal(resolveTapOutcome({ movedTooFar: true }), false);
  assert.equal(resolveTapOutcome({ cancelled: true }), false);
  assert.equal(resolveTapOutcome({ longPressFired: true, movedTooFar: true }), false);
});

test("classifySwipe: below both distance and velocity thresholds has no direction", () => {
  const result = classifySwipe({ dx: 5, dy: 0, elapsedMs: 1000, axis: "x" });
  assert.equal(result.direction, null);
});

test("classifySwipe: far enough distance classifies direction on the x axis", () => {
  const left = classifySwipe({ dx: -40, dy: 0, elapsedMs: 1000, axis: "x" });
  assert.equal(left.direction, "left");
  const right = classifySwipe({ dx: 40, dy: 0, elapsedMs: 1000, axis: "x" });
  assert.equal(right.direction, "right");
});

test("classifySwipe: far enough distance classifies direction on the y axis", () => {
  const up = classifySwipe({ dx: 0, dy: -40, elapsedMs: 1000, axis: "y" });
  assert.equal(up.direction, "up");
  const down = classifySwipe({ dx: 0, dy: 40, elapsedMs: 1000, axis: "y" });
  assert.equal(down.direction, "down");
});

test("classifySwipe: a short but fast flick still classifies via velocity", () => {
  const result = classifySwipe({ dx: 15, dy: 0, elapsedMs: 20, axis: "x", minDistance: 24 });
  assert.equal(result.direction, "right");
});

test("computeSnapIndex: small drags below threshold don't advance", () => {
  const next = computeSnapIndex({ currentIndex: 1, itemCount: 3, dx: -10, itemWidth: 300 });
  assert.equal(next, 1);
});

test("computeSnapIndex: a drag past the distance threshold advances one item", () => {
  const forward = computeSnapIndex({ currentIndex: 1, itemCount: 3, dx: -150, itemWidth: 300 });
  assert.equal(forward, 2);
  const backward = computeSnapIndex({ currentIndex: 1, itemCount: 3, dx: 150, itemWidth: 300 });
  assert.equal(backward, 0);
});

test("computeSnapIndex: a fast flick advances even with a short distance", () => {
  const next = computeSnapIndex({
    currentIndex: 0,
    itemCount: 3,
    dx: -20,
    itemWidth: 300,
    velocity: 0.5
  });
  assert.equal(next, 1);
});

test("computeSnapIndex: clamps at the edges instead of wrapping", () => {
  const next = computeSnapIndex({ currentIndex: 2, itemCount: 3, dx: -150, itemWidth: 300 });
  assert.equal(next, 2, "dragging past the last item stays clamped, does not wrap");
});

test("computeSnapIndex: wrap mode wraps at the edges (native hero edge-wrap)", () => {
  // Dragging right at the first item lands on the last.
  const wrapRight = computeSnapIndex({
    currentIndex: 0,
    itemCount: 3,
    dx: 150,
    itemWidth: 300,
    wrap: true
  });
  assert.equal(wrapRight, 2, "first -> last when dragging right at the start");

  // Dragging left at the last item lands on the first.
  const wrapLeft = computeSnapIndex({
    currentIndex: 2,
    itemCount: 3,
    dx: -150,
    itemWidth: 300,
    wrap: true
  });
  assert.equal(wrapLeft, 0, "last -> first when dragging left at the end");

  // A sub-threshold drag still stays put (no phantom wrap).
  const stay = computeSnapIndex({
    currentIndex: 0,
    itemCount: 3,
    dx: 10,
    itemWidth: 300,
    wrap: true
  });
  assert.equal(stay, 0, "small drag below the threshold does not wrap");
});

test("computeSnapIndex: wrap respects the native hero fraction/velocity thresholds", () => {
  // 16% of the width (native HERO_SWIPE_THRESHOLD_FRACTION) is enough to advance.
  const fraction = computeSnapIndex({
    currentIndex: 0,
    itemCount: 3,
    dx: -50,
    itemWidth: 300,
    distanceThreshold: 0.16,
    wrap: true
  });
  assert.equal(fraction, 1, "a 16% drag advances in wrap mode");
  // ...but not quite enough below it.
  const shortFraction = computeSnapIndex({
    currentIndex: 0,
    itemCount: 3,
    dx: -40,
    itemWidth: 300,
    distanceThreshold: 0.16,
    wrap: true
  });
  assert.equal(shortFraction, 0, "a drag just under 16% does not advance");

  // A 300 px/s flick (0.3 px/ms) advances even over a tiny distance.
  const flick = computeSnapIndex({
    currentIndex: 1,
    itemCount: 3,
    dx: -10,
    itemWidth: 300,
    velocity: 0.31,
    velocityThreshold: 0.3,
    wrap: true
  });
  assert.equal(flick, 2, "native 300px/s velocity gate advances in wrap mode");
});

// --- DOM-facing seams ---

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

test("attachLongPress: a quick release fires onTap, not onLongPress", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let tapped = false;
  let longPressed = false;
  const detach = attachLongPress(el, {
    threshold: 30,
    onTap: () => {
      tapped = true;
    },
    onLongPress: () => {
      longPressed = true;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  dispatchPointer(el, "pointerup", { x: 10, y: 10 });

  assert.equal(tapped, true);
  assert.equal(longPressed, false);
  assert.equal(el.dataset.suppressNextTap, undefined);

  detach();
  el.remove();
});

test("attachLongPress: holding past the threshold fires onLongPress, not onTap, and sets suppressNextTap", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let tapped = false;
  let longPressed = false;
  const detach = attachLongPress(el, {
    threshold: 20,
    onTap: () => {
      tapped = true;
    },
    onLongPress: () => {
      longPressed = true;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  dispatchPointer(el, "pointerup", { x: 10, y: 10 });

  assert.equal(longPressed, true);
  assert.equal(tapped, false);
  assert.equal(el.dataset.suppressNextTap, "1");

  detach();
  el.remove();
});

test("attachLongPress: moving past tolerance before the threshold cancels the long-press and is not a tap", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let tapped = false;
  let longPressed = false;
  const detach = attachLongPress(el, {
    threshold: 30,
    moveTolerance: 5,
    onTap: () => {
      tapped = true;
    },
    onLongPress: () => {
      longPressed = true;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  dispatchPointer(el, "pointermove", { x: 40, y: 10 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  dispatchPointer(el, "pointerup", { x: 40, y: 10 });

  assert.equal(longPressed, false);
  assert.equal(tapped, false);

  detach();
  el.remove();
});

test("attachLongPress: onHoldStart/onHoldEnd fire alongside a long-press hold, in addition to onLongPress", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const events = [];
  const detach = attachLongPress(el, {
    threshold: 20,
    onLongPress: () => events.push("longPress"),
    onHoldStart: () => events.push("holdStart"),
    onHoldEnd: () => events.push("holdEnd")
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(events, ["longPress", "holdStart"]);
  dispatchPointer(el, "pointerup", { x: 10, y: 10 });

  assert.deepEqual(events, ["longPress", "holdStart", "holdEnd"]);

  detach();
  el.remove();
});

test("attachLongPress: onHoldEnd does not fire for a plain tap that never reached the hold threshold", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let holdStarted = false;
  let holdEnded = false;
  const detach = attachLongPress(el, {
    threshold: 200,
    onHoldStart: () => {
      holdStarted = true;
    },
    onHoldEnd: () => {
      holdEnded = true;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  dispatchPointer(el, "pointerup", { x: 10, y: 10 });

  assert.equal(holdStarted, false);
  assert.equal(holdEnded, false);

  detach();
  el.remove();
});

test("attachLongPress: onHoldEnd fires on pointercancel after a hold started", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const events = [];
  const detach = attachLongPress(el, {
    threshold: 20,
    onHoldStart: () => events.push("start"),
    onHoldEnd: () => events.push("end")
  });

  dispatchPointer(el, "pointerdown", { x: 10, y: 10 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  dispatchPointer(el, "pointercancel", { x: 10, y: 10 });

  assert.deepEqual(events, ["start", "end"]);

  detach();
  el.remove();
});

test("attachSwipe: reports live movement and the classified end result", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const moves = [];
  let endResult = null;
  const detach = attachSwipe(el, {
    axis: "x",
    onSwipeMove: ({ dx, dy }) => moves.push({ dx, dy }),
    onSwipeEnd: (result) => {
      endResult = result;
    }
  });

  dispatchPointer(el, "pointerdown", { x: 0, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointermove", { x: 20, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointermove", { x: 50, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointerup", { x: 60, y: 0, pointerId: 7 });

  assert.deepEqual(moves, [
    { dx: 20, dy: 0 },
    { dx: 50, dy: 0 }
  ]);
  assert.equal(endResult.direction, "right");
  assert.equal(endResult.cancelled, false);

  detach();
  el.remove();
});

test("attachSwipe: calls onDismiss only when the classified direction matches dismissDirection", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let dismissed = false;
  const detach = attachSwipe(el, {
    axis: "y",
    onDismiss: () => {
      dismissed = true;
    }
  });

  // Swipe up: not the "down" dismiss direction for a y-axis sheet, should not dismiss.
  dispatchPointer(el, "pointerdown", { x: 0, y: 100, pointerId: 3 });
  dispatchPointer(el, "pointerup", { x: 0, y: 40, pointerId: 3 });
  assert.equal(dismissed, false);

  // Swipe down far enough: matches the default y-axis dismiss direction.
  dispatchPointer(el, "pointerdown", { x: 0, y: 0, pointerId: 3 });
  dispatchPointer(el, "pointerup", { x: 0, y: 100, pointerId: 3 });
  assert.equal(dismissed, true);

  detach();
  el.remove();
});

test("attachPager: swiping past the threshold changes the page index", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const seen = [];
  const detach = attachPager(el, {
    itemWidth: 300,
    getItemCount: () => 3,
    onIndexChange: (index) => seen.push(index)
  });

  dispatchPointer(el, "pointerdown", { x: 200, y: 0, pointerId: 9 });
  dispatchPointer(el, "pointerup", { x: 20, y: 0, pointerId: 9 }); // dx = -180, past 0.3*300

  assert.deepEqual(seen, [1]);

  detach();
  el.remove();
});

test("attachPager: auto-advance wraps back to the first item after the last", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const seen = [];
  const detach = attachPager(el, {
    itemWidth: 300,
    getItemCount: () => 2,
    autoAdvanceMs: 10,
    onIndexChange: (index) => seen.push(index)
  });

  try {
    // A single tick lands strictly between the first (~10ms) and second (~20ms) advance —
    // detach() unconditionally below also guards against a dangling recurring timer if this
    // assertion ever fails.
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.deepEqual(seen, [1]);
  } finally {
    detach();
    el.remove();
  }
});
test("attachPager: wrap mode wraps at the edges (native hero edge-wrap)", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const seen = [];
  const detach = attachPager(el, {
    itemWidth: 300,
    getItemCount: () => 3,
    wrap: true,
    onIndexChange: (index) => seen.push(index)
  });

  // Drag right past the threshold while on the first item: wraps to the last.
  dispatchPointer(el, "pointerdown", { x: 200, y: 0, pointerId: 9 });
  dispatchPointer(el, "pointerup", { x: 320, y: 0, pointerId: 9 }); // dx = +120, past 0.3*300
  assert.deepEqual(seen, [2], "first item dragged right wraps to the last");

  // Drag left past the threshold while on the last item: wraps to the first.
  dispatchPointer(el, "pointerdown", { x: 200, y: 0, pointerId: 9 });
  dispatchPointer(el, "pointerup", { x: 20, y: 0, pointerId: 9 }); // dx = -180
  assert.deepEqual(seen, [2, 0], "last item dragged left wraps to the first");

  detach();
  el.remove();
});

test("attachPager: onDragMove streams finger displacement and onDragEnd fires once on lift", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const moves = [];
  let dragStarts = 0;
  let dragEnds = null;
  const detach = attachPager(el, {
    itemWidth: 300,
    getItemCount: () => 2,
    wrap: true,
    onDragStart: () => {
      dragStarts += 1;
    },
    onDragMove: ({ dx }) => moves.push(dx),
    onDragEnd: ({ dx, cancelled }) => {
      dragEnds = { dx, cancelled };
    }
  });

  dispatchPointer(el, "pointerdown", { x: 200, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointermove", { x: 220, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointermove", { x: 250, y: 0, pointerId: 7 });
  dispatchPointer(el, "pointerup", { x: 250, y: 0, pointerId: 7 });

  assert.equal(dragStarts, 1);
  assert.deepEqual(moves, [20, 50]);
  assert.equal(dragEnds.dx, 50);
  assert.equal(dragEnds.cancelled, false);

  detach();
  el.remove();
});

test("attachPager: getCurrentIndex keeps snaps relative to externally-driven index changes", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let externalIndex = 0;
  const seen = [];
  const detach = attachPager(el, {
    itemWidth: 300,
    getItemCount: () => 3,
    wrap: true,
    getCurrentIndex: () => externalIndex,
    onIndexChange: (index) => {
      externalIndex = index; // the consumer stays authoritative (dot navigation does this)
      seen.push(index);
    }
  });

  // A dot-navigation-style jump the pager never saw: internal index would still say 0.
  externalIndex = 5;

  // Drag right: settles relative to the external 5 — wrapIndex(5-1, 3) = 1. A stale
  // internal 0 would have wrapped to 2 instead.
  dispatchPointer(el, "pointerdown", { x: 200, y: 0, pointerId: 8 });
  dispatchPointer(el, "pointerup", { x: 320, y: 0, pointerId: 8 });
  assert.deepEqual(seen, [1], "the snap read the external index, not the stale internal one");

  detach();
  el.remove();
});
