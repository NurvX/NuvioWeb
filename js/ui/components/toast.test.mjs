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
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

const { showToast, dismissToast } = await import("./toast.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A genuinely-dismissed toast lingers in the DOM through its exit transition before removal,
// so every test that ends with a toast showing must settle before the next test's DOM
// assertions would see it.
const TOAST_EXIT_MS = 250;
const settle = async () => {
  await wait(TOAST_EXIT_MS);
  assert.equal(document.querySelector(".phone-toast"), null, "toast fully removed");
};

test("showToast renders a single role=status toast with the message", async () => {
  const controller = showToast("PIN saved");

  assert.ok(controller, "returns a controller for a real message");
  const toast = document.querySelector(".phone-toast");
  assert.ok(toast, "toast element exists");
  assert.equal(toast.getAttribute("role"), "status");
  assert.equal(toast.getAttribute("aria-live"), "polite");
  assert.equal(toast.textContent, "PIN saved");

  await wait(10); // rAF applies the .visible enter state
  assert.ok(toast.classList.contains("visible"), "toast becomes visible after a frame");

  dismissToast();
  await settle();
});

test("blank messages are a no-op", () => {
  assert.equal(showToast(""), null);
  assert.equal(showToast("   "), null);
  assert.equal(showToast(null), null);
  assert.equal(document.querySelector(".phone-toast"), null);
});

test("a new toast replaces the current one — one toast at a time", async () => {
  showToast("First");
  showToast("Second");

  const toasts = document.querySelectorAll(".phone-toast");
  assert.equal(toasts.length, 1, "only one toast element exists");
  assert.equal(toasts[0].textContent, "Second", "the newest message wins");

  dismissToast();
  await settle();
});

test("toast auto-dismisses after its duration", async () => {
  showToast("Temporary", { durationMs: 30 });

  assert.ok(document.querySelector(".phone-toast"));
  await settle();
});

test("dismissToast hides the toast immediately; a stale controller cannot kill a newer toast", async () => {
  const first = showToast("First", { durationMs: 60_000 });
  showToast("Second", { durationMs: 60_000 });

  first.dismiss(); // stale — must not dismiss the replacement

  const surviving = document.querySelector(".phone-toast");
  assert.ok(surviving, "newer toast survives a stale dismiss");
  assert.equal(surviving.textContent, "Second");

  dismissToast();
  await wait(10);
  const exiting = document.querySelector(".phone-toast");
  if (exiting) {
    assert.equal(exiting.classList.contains("visible"), false, "immediately hidden");
  }

  await settle();
});

test("dismissToast is a safe no-op when nothing is showing", () => {
  assert.doesNotThrow(() => dismissToast());
  assert.doesNotThrow(() => dismissToast(123));
});
