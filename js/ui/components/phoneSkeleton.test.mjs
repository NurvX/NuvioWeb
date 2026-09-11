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
  renderSkeletonBlock,
  renderSkeletonPosterCard,
  renderSkeletonShelf,
  renderSkeletonToolbar
} = await import("./phoneSkeleton.js");

const parse = (html) => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild;
};

test("renderSkeletonToolbar renders the requested chip count as shimmer blocks with chip radius", () => {
  const toolbar = parse(renderSkeletonToolbar({ chipCount: 4 }));
  assert.equal(toolbar.querySelectorAll(".phone-skeleton-chip").length, 4);
  Array.from(toolbar.querySelectorAll(".phone-skeleton-chip")).forEach((chip) => {
    assert.match(chip.getAttribute("style"), /border-radius:var\(--phone-radius-full\)/);
  });
  assert.equal(toolbar.getAttribute("aria-hidden"), "true");
});

test("renderSkeletonToolbar clamps a bad count to at least one chip", () => {
  assert.equal(
    parse(renderSkeletonToolbar({ chipCount: 0 })).querySelectorAll(".phone-skeleton-chip").length,
    1
  );
  assert.equal(
    parse(renderSkeletonToolbar({ chipCount: -3 })).querySelectorAll(".phone-skeleton-chip").length,
    1
  );
});

test("existing skeleton helpers still compose", () => {
  const block = parse(renderSkeletonBlock({ width: "60%", height: "20px" }));
  assert.match(block.getAttribute("style"), /width:60%/, "block sizes pass through");

  const shelf = parse(renderSkeletonShelf({ count: 3 }));
  assert.equal(shelf.querySelectorAll(".phone-poster").length, 3);
  assert.equal(shelf.getAttribute("aria-hidden"), "true");

  const poster = parse(renderSkeletonPosterCard({ aspect: "landscape" }));
  assert.match(
    poster.querySelector(".phone-skeleton-poster > .phone-poster-card").className,
    /landscape/
  );
});
