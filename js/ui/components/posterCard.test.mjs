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
globalThis.PointerEvent = dom.window.PointerEvent;

const { renderPosterCard, bindPosterCardEvents } = await import("./posterCard.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dispatchPointer(el, type, { x = 0, y = 0, pointerId = 1 } = {}) {
  const event = new dom.window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    clientX: x,
    clientY: y
  });
  el.dispatchEvent(event);
}

function mountCard(props) {
  const container = document.createElement("div");
  container.innerHTML = renderPosterCard(props);
  document.body.appendChild(container);
  return container;
}

test("renders the portrait variant by default with focusable/data-action/data-id wired for onPointerActivate", () => {
  const container = mountCard({ id: "tt123", title: "Some Title", posterUrl: "poster.jpg" });
  const card = container.querySelector(".phone-poster-card");
  assert.ok(card, "card renders");
  assert.ok(card.classList.contains("phone-poster-card-portrait"));
  assert.ok(card.classList.contains("focusable"));
  assert.equal(card.dataset.action, "openDetail");
  assert.equal(card.dataset.id, "tt123");
  container.remove();
});

test("renders the landscape variant when requested", () => {
  const container = mountCard({ id: "ep1", title: "Episode 1", aspect: "landscape" });
  const card = container.querySelector(".phone-poster-card");
  assert.ok(card.classList.contains("phone-poster-card-landscape"));
  assert.equal(card.classList.contains("phone-poster-card-portrait"), false);
  container.remove();
});

test("custom action name is honored on data-action", () => {
  const container = mountCard({ id: "s1", title: "X", action: "openEpisode" });
  const card = container.querySelector(".phone-poster-card");
  assert.equal(card.dataset.action, "openEpisode");
  container.remove();
});

test("title/subtitle render below the card by default, and hideLabels suppresses them", () => {
  const shown = mountCard({ id: "1", title: "Movie Title", subtitle: "2024" });
  assert.equal(shown.querySelector(".phone-poster-title")?.textContent, "Movie Title");
  assert.equal(shown.querySelector(".phone-poster-subtitle")?.textContent, "2024");
  shown.remove();

  const hidden = mountCard({ id: "1", title: "Movie Title", subtitle: "2024", hideLabels: true });
  assert.equal(hidden.querySelector(".phone-poster-labels"), null);
  hidden.remove();
});

test("watched badge and progress bar are absent by default and both render together without interfering", () => {
  const bare = mountCard({ id: "1", title: "X" });
  assert.equal(bare.querySelector(".phone-poster-watched-badge"), null);
  assert.equal(bare.querySelector(".phone-poster-progress-track"), null);
  bare.remove();

  const combined = mountCard({ id: "1", title: "X", watched: true, progress: 0.42 });
  assert.ok(combined.querySelector(".phone-poster-watched-badge"), "watched badge renders");
  const fill = combined.querySelector(".phone-poster-progress-fill");
  assert.ok(fill, "progress fill renders");
  assert.equal(fill.style.width, "42%");
  combined.remove();
});

test("progress of exactly 0 still renders an (empty) progress bar, distinct from omitting it", () => {
  const container = mountCard({ id: "1", title: "X", progress: 0 });
  const fill = container.querySelector(".phone-poster-progress-fill");
  assert.ok(fill);
  assert.equal(fill.style.width, "0%");
  container.remove();
});

test("progress is clamped to the 0..1 range", () => {
  const over = mountCard({ id: "1", title: "X", progress: 4 });
  assert.equal(over.querySelector(".phone-poster-progress-fill").style.width, "100%");
  over.remove();

  const under = mountCard({ id: "1", title: "X", progress: -2 });
  assert.equal(under.querySelector(".phone-poster-progress-fill").style.width, "0%");
  under.remove();
});

test("bindPosterCardEvents fires onLongPress with the card's id after the long-press threshold", async () => {
  const container = mountCard({ id: "tt999", title: "X" });
  const card = container.querySelector(".phone-poster-card");

  let longPressedId = null;
  const detach = bindPosterCardEvents(container, {
    threshold: 30,
    onLongPress: (id) => {
      longPressedId = id;
    }
  });

  dispatchPointer(card, "pointerdown", { x: 0, y: 0 });
  await wait(60);
  dispatchPointer(card, "pointerup", { x: 0, y: 0 });

  assert.equal(longPressedId, "tt999");
  assert.equal(
    card.dataset.suppressNextTap,
    "1",
    "suppressNextTap is set for FocusEngine to consume"
  );
  detach();
  container.remove();
});

test("a quick tap (released before the long-press threshold) does not fire onLongPress or set suppressNextTap", async () => {
  const container = mountCard({ id: "tt1", title: "X" });
  const card = container.querySelector(".phone-poster-card");

  let longPressed = false;
  const detach = bindPosterCardEvents(container, {
    threshold: 500,
    onLongPress: () => {
      longPressed = true;
    }
  });

  dispatchPointer(card, "pointerdown", { x: 0, y: 0 });
  dispatchPointer(card, "pointerup", { x: 0, y: 0 });

  assert.equal(longPressed, false);
  assert.equal(card.dataset.suppressNextTap, undefined);
  detach();
  container.remove();
});

test("bindPosterCardEvents is a no-op teardown when no onLongPress is supplied", () => {
  const container = mountCard({ id: "tt1", title: "X" });
  const detach = bindPosterCardEvents(container, {});
  assert.doesNotThrow(() => detach());
  container.remove();
});
