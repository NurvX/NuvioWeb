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

const { FocusEngine } = await import("./focusEngine.js");
const { Router } = await import("./router.js");
const { Platform } = await import("../../platform/index.js");

test("a real DOM click on a focusable element invokes the current screen's pointer-activation handler on the plain-browser platform", async () => {
  assert.equal(Platform.getName(), "browser");

  FocusEngine.init();

  document.body.innerHTML = '<button class="focusable" id="target">Play</button>';
  const target = document.getElementById("target");
  target.getBoundingClientRect = () => ({
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    right: 100,
    bottom: 40
  });

  let activatedWith = null;
  let resolveActivation;
  const activationHandled = new Promise((resolve) => {
    resolveActivation = resolve;
  });
  const fakeScreen = {
    container: document.body,
    onPointerActivate(activationTarget) {
      activatedWith = activationTarget;
      resolveActivation();
      return true;
    }
  };
  const originalGetCurrentScreen = Router.getCurrentScreen;
  Router.getCurrentScreen = () => fakeScreen;

  try {
    // Dispatched on the element itself, through the real listener registered by
    // FocusEngine.init() on `document` — this exercises the seam this ticket un-gated
    // (the click listener is no longer registered only for webOS), not just the
    // handler's internal guard.
    target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

    await activationHandled;

    assert.equal(
      activatedWith,
      target,
      "pointer-activation handler should fire with the clicked target"
    );
  } finally {
    Router.getCurrentScreen = originalGetCurrentScreen;
  }
});
