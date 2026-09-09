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
  TRANSITION_TOKENS,
  resolveDirection,
  getTransitionDuration,
  shouldInstant,
  buildTransitionPlan,
  playScreenTransition,
  runScreenCleanup
} = await import("./screenTransition.js");

// --- Pure planning functions ---

test("tokens mirror the motion scale (fast/normal/sheet)", () => {
  assert.equal(TRANSITION_TOKENS.fast, 150);
  assert.equal(TRANSITION_TOKENS.normal, 220);
  assert.equal(TRANSITION_TOKENS.sheetEnter, 300);
  assert.equal(TRANSITION_TOKENS.sheetExit, 250);
});

test("resolveDirection: back flag maps to back, everything else is forward", () => {
  assert.equal(resolveDirection({ isBackNavigation: true }), "back");
  assert.equal(resolveDirection({ isBackNavigation: false }), "forward");
  assert.equal(resolveDirection({}), "forward");
  assert.equal(resolveDirection(), "forward");
});

test("getTransitionDuration: screen legs use normal, sheets use sheet tokens", () => {
  assert.equal(getTransitionDuration("screen", "enter"), 220);
  assert.equal(getTransitionDuration("screen", "exit"), 220);
  assert.equal(getTransitionDuration("sheet", "enter"), 300);
  assert.equal(getTransitionDuration("sheet", "exit"), 250);
  assert.equal(getTransitionDuration("unknown-kind", "enter"), 220);
});

test("shouldInstant: only reduced motion takes the instant path", () => {
  assert.equal(shouldInstant({ reducedMotion: true }), true);
  assert.equal(shouldInstant({ reducedMotion: false }), false);
  assert.equal(shouldInstant({}), false);
  assert.equal(shouldInstant(), false);
});

test("buildTransitionPlan: symmetric fade+scale pair, direction recorded", () => {
  const plan = buildTransitionPlan({ direction: "forward", reducedMotion: false });
  assert.equal(plan.direction, "forward");
  assert.equal(plan.instant, false);
  assert.equal(plan.enterClass, "phone-screen-enter");
  assert.equal(plan.exitClass, "phone-screen-exit");
  assert.equal(plan.durationMs, 220);
  const back = buildTransitionPlan({ direction: "back", reducedMotion: false });
  assert.equal(back.enterClass, plan.enterClass);
  assert.equal(back.exitClass, plan.exitClass);
});

test("buildTransitionPlan: reduced motion is instant with no classes", () => {
  const plan = buildTransitionPlan({ direction: "forward", reducedMotion: true });
  assert.equal(plan.instant, true);
  assert.equal(plan.durationMs, 0);
  assert.equal(plan.enterClass, null);
  assert.equal(plan.exitClass, null);
});

// --- Orchestrator (jsdom DOM) ---

function setupRoots() {
  document.body.innerHTML =
    '<div id="app"><div id="home" class="screen"></div><div id="detail" class="screen"></div></div>';
  document.getElementById("home").textContent = "home content";
}

test("playScreenTransition instant path: mounts with no animation residue", async () => {
  setupRoots();
  let mounted = false;
  await playScreenTransition({
    fromRoute: "home",
    toRoute: "detail",
    direction: "forward",
    reducedMotion: true,
    mountFn: async () => {
      mounted = true;
    }
  });
  assert.equal(mounted, true);
  assert.equal(document.querySelector(".phone-screen-snapshot"), null);
  assert.equal(document.querySelector(".phone-screen-enter"), null);
  assert.equal(document.documentElement.dataset.navDirection, "forward");
});

test("playScreenTransition animated: snapshot exits inert, incoming enters, all cleaned up", async () => {
  setupRoots();
  const promise = playScreenTransition({
    fromRoute: "home",
    toRoute: "detail",
    direction: "forward",
    reducedMotion: false,
    durations: { enter: 20, exit: 20 },
    mountFn: async () => {
      document.getElementById("detail").textContent = "detail content";
    }
  });
  await promise;
  assert.equal(document.getElementById("detail").textContent, "detail content");
  assert.equal(document.querySelector(".phone-screen-snapshot"), null);
  assert.equal(document.querySelector(".phone-screen-enter"), null);
  assert.equal(document.querySelector(".phone-screen-exit"), null);
});

test("playScreenTransition overlap: stale run settles without touching the new DOM", async () => {
  setupRoots();
  const first = playScreenTransition({
    fromRoute: "home",
    toRoute: "detail",
    direction: "forward",
    reducedMotion: false,
    durations: { enter: 60, exit: 60 },
    mountFn: async () => {}
  });
  const second = playScreenTransition({
    fromRoute: "detail",
    toRoute: "home",
    direction: "back",
    reducedMotion: false,
    durations: { enter: 10, exit: 10 },
    mountFn: async () => {}
  });
  await Promise.all([first, second]);
  assert.equal(document.querySelector(".phone-screen-snapshot"), null);
  assert.equal(document.documentElement.dataset.navDirection, "back");
});

test("runScreenCleanup: clean teardown runs and reports true", () => {
  let calls = 0;
  const ok = runScreenCleanup(
    {
      cleanup: () => {
        calls += 1;
      }
    },
    "a"
  );
  assert.equal(ok, true);
  assert.equal(calls, 1);
});

test("runScreenCleanup: throwing teardown does not throw, reports false", () => {
  const ok = runScreenCleanup(
    {
      cleanup: () => {
        throw new TypeError("ghost method is not a function");
      }
    },
    "detail"
  );
  assert.equal(ok, false);
});

test("runScreenCleanup: missing screen or cleanup is a clean no-op", () => {
  assert.equal(runScreenCleanup(null, "a"), true);
  assert.equal(runScreenCleanup({}, "a"), true);
});
