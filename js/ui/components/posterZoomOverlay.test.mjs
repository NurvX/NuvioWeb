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
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

const { openPosterZoomOverlay, closeActivePosterZoomOverlay } =
  await import("./posterZoomOverlay.js");

test("openPosterZoomOverlay renders title, subtitle and one row per action", () => {
  const controller = openPosterZoomOverlay({
    title: "Some Movie",
    subtitle: "Movie  •  2020",
    posterUrl: "https://example.com/poster.jpg",
    actions: [
      { id: "details", label: "Go to details", onSelect: () => {} },
      { id: "library", label: "Add to library", onSelect: () => {} }
    ]
  });

  assert.ok(document.querySelector(".phone-zoom-backdrop"));
  assert.equal(document.querySelector(".phone-zoom-title").textContent, "Some Movie");
  assert.equal(document.querySelector(".phone-zoom-subtitle").textContent, "Movie  •  2020");
  assert.equal(document.querySelectorAll(".phone-zoom-action").length, 2);

  controller.destroy();
});

test("only one overlay can be open at a time — opening a new one closes the previous", () => {
  openPosterZoomOverlay({ title: "First", actions: [] });
  assert.equal(document.querySelectorAll(".phone-zoom-backdrop").length, 1);

  openPosterZoomOverlay({ title: "Second", actions: [] });
  assert.equal(document.querySelectorAll(".phone-zoom-backdrop").length, 1);
  assert.equal(document.querySelector(".phone-zoom-title").textContent, "Second");

  closeActivePosterZoomOverlay();
});

test("selecting an action closes the overlay and calls onSelect with nothing else selected", () => {
  let selectedId = null;
  openPosterZoomOverlay({
    title: "Some Movie",
    actions: [
      { id: "details", label: "Go to details", onSelect: () => (selectedId = "details") },
      { id: "remove", label: "Remove", onSelect: () => (selectedId = "remove") }
    ]
  });

  document.querySelectorAll(".phone-zoom-action")[1].click();

  assert.equal(selectedId, "remove");
  assert.equal(document.querySelector(".phone-zoom-backdrop"), null);
});

test("tapping the backdrop dismisses without calling any action", () => {
  let called = false;
  openPosterZoomOverlay({
    title: "Some Movie",
    actions: [{ id: "details", label: "Go to details", onSelect: () => (called = true) }]
  });

  document.querySelector(".phone-zoom-backdrop").click();

  assert.equal(called, false);
  assert.equal(document.querySelector(".phone-zoom-backdrop"), null);
});

test("Escape dismisses the overlay", () => {
  openPosterZoomOverlay({ title: "Some Movie", actions: [] });
  assert.ok(document.querySelector(".phone-zoom-backdrop"));

  const event = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  document.dispatchEvent(event);

  assert.equal(document.querySelector(".phone-zoom-backdrop"), null);
});

test("destructive actions get the destructive class hook", () => {
  openPosterZoomOverlay({
    title: "Some Movie",
    actions: [
      { id: "details", label: "Go to details", onSelect: () => {} },
      { id: "remove", label: "Remove", destructive: true, onSelect: () => {} }
    ]
  });

  const actionButtons = document.querySelectorAll(".phone-zoom-action");
  assert.equal(actionButtons[0].classList.contains("phone-zoom-action-destructive"), false);
  assert.equal(actionButtons[1].classList.contains("phone-zoom-action-destructive"), true);

  closeActivePosterZoomOverlay();
});
