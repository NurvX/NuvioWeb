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

const { WINDOW_ITEM_THRESHOLD, DEFAULT_OVERSCAN_ROWS, computeWindow, renderWindowedGrid } =
  await import("./virtualPosterGrid.js");

const GEOMETRY = { columns: 3, rowHeight: 200, rowGap: 12 };

// --- computeWindow: pure row math ---

test("computeWindow: short lists render whole with no spacers", () => {
  const range = computeWindow({ itemCount: 9, ...GEOMETRY, scrollTop: 0, viewportHeight: 600 });
  assert.equal(range.startIndex, 0);
  assert.equal(range.endIndex, 9);
  assert.equal(range.topSpacerPx, 0);
  assert.equal(range.bottomSpacerPx, 0);
});

test("computeWindow: top of a long list renders first rows plus overscan", () => {
  const range = computeWindow({ itemCount: 500, ...GEOMETRY, scrollTop: 0, viewportHeight: 600 });
  // 600px viewport ~= 3 rows visible + 2 overscan rows = 5 rows = 15 items
  assert.equal(range.startIndex, 0);
  assert.equal(range.endIndex, 15);
  assert.equal(range.topSpacerPx, 0);
  assert.ok(range.bottomSpacerPx > 0);
});

test("computeWindow: scrolled position maps scrollTop to start row with overscan", () => {
  // One row = 212px; scrollTop 1060 = row 5; minus 2 overscan rows = row 3 = index 9
  const range = computeWindow({
    itemCount: 500,
    ...GEOMETRY,
    scrollTop: 1060,
    viewportHeight: 600
  });
  assert.equal(range.startIndex, 9);
  assert.equal(range.endIndex, 30);
  assert.equal(range.topSpacerPx, 3 * 212);
});

test("computeWindow: end clamps to item count and shrinks bottom spacer", () => {
  const range = computeWindow({
    itemCount: 20,
    ...GEOMETRY,
    scrollTop: 100000,
    viewportHeight: 600
  });
  assert.equal(range.endIndex, 20);
  assert.equal(range.bottomSpacerPx, 0);
  assert.ok(range.topSpacerPx > 0);
});

test("computeWindow: spacers account for every item exactly", () => {
  const rowStride = 212;
  const range = computeWindow({
    itemCount: 500,
    ...GEOMETRY,
    scrollTop: 1060,
    viewportHeight: 600
  });
  const totalRows = Math.ceil(500 / 3);
  const renderedRows = Math.ceil((range.endIndex - range.startIndex) / 3);
  const spacerRows = range.topSpacerPx / rowStride + range.bottomSpacerPx / rowStride;
  assert.equal(renderedRows + spacerRows, totalRows);
});

test("computeWindow: empty list renders nothing", () => {
  const range = computeWindow({ itemCount: 0, ...GEOMETRY, scrollTop: 0, viewportHeight: 600 });
  assert.deepEqual(
    [range.startIndex, range.endIndex, range.topSpacerPx, range.bottomSpacerPx],
    [0, 0, 0, 0]
  );
});

// --- renderWindowedGrid: HTML shape ---

test("renderWindowedGrid: injects window cards between spacers, keeps card markup", () => {
  document.body.innerHTML = '<div id="grid"></div>';
  const grid = document.getElementById("grid");
  const items = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}` }));
  renderWindowedGrid(grid, {
    items,
    renderCard: (item) => `<div class="phone-poster-card" data-id="${item.id}"></div>`,
    range: { startIndex: 9, endIndex: 24, topSpacerPx: 636, bottomSpacerPx: 16000 }
  });
  const cards = grid.querySelectorAll(".phone-poster-card");
  assert.equal(cards.length, 15);
  assert.equal(cards[0].dataset.id, "id-9");
  assert.equal(cards[14].dataset.id, "id-23");
  const spacers = grid.querySelectorAll(".phone-grid-spacer");
  assert.equal(spacers.length, 2);
  assert.equal(spacers[0].style.height, "636px");
});

test("renderWindowedGrid: no spacers when window covers everything", () => {
  document.body.innerHTML = '<div id="grid"></div>';
  const grid = document.getElementById("grid");
  renderWindowedGrid(grid, {
    items: [{ id: "a" }],
    renderCard: (item) => `<div class="phone-poster-card" data-id="${item.id}"></div>`,
    range: { startIndex: 0, endIndex: 1, topSpacerPx: 0, bottomSpacerPx: 0 }
  });
  assert.equal(grid.querySelectorAll(".phone-grid-spacer").length, 0);
  assert.equal(grid.querySelectorAll(".phone-poster-card").length, 1);
});

test("thresholds: small grids stay fully rendered", () => {
  assert.ok(WINDOW_ITEM_THRESHOLD >= 30);
  assert.ok(DEFAULT_OVERSCAN_ROWS >= 1);
});

test("renderWindowedGrid: malformed range fails open to a full render", () => {
  document.body.innerHTML = '<div id="grid"></div>';
  const grid = document.getElementById("grid");
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));
  const renderCard = (item) => `<div class="phone-poster-card" data-id="${item.id}"></div>`;
  renderWindowedGrid(grid, { items, renderCard, range: globalThis.window });
  assert.equal(grid.querySelectorAll(".phone-poster-card").length, 10);
  assert.equal(grid.querySelectorAll(".phone-grid-spacer").length, 0);
  renderWindowedGrid(grid, { items, renderCard });
  assert.equal(grid.querySelectorAll(".phone-poster-card").length, 10);
});

test("renderWindowedGrid: preserves the scroller position across the swap", () => {
  document.body.innerHTML = '<div id="scroller"><div id="grid"></div></div>';
  const grid = document.getElementById("grid");
  const scroller = document.getElementById("scroller");
  let pinned = null;
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get() {
      return pinned;
    },
    set(v) {
      pinned = v;
    }
  });
  pinned = 5000;
  const items = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}` }));
  renderWindowedGrid(grid, {
    items,
    renderCard: (item) => `<div class="phone-poster-card" data-id="${item.id}"></div>`,
    range: { startIndex: 60, endIndex: 75, topSpacerPx: 4000, bottomSpacerPx: 2000 },
    scroller
  });
  assert.equal(pinned, 5000);
  assert.equal(grid.querySelectorAll(".phone-poster-card").length, 15);
});
