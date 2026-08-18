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

const { openBottomSheet, closeActiveBottomSheet } = await import("./bottomSheet.js");

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

test("openBottomSheet renders one action row per item", () => {
  const controller = openBottomSheet({
    items: [
      { title: "Copy Link", onSelect: () => {} },
      { title: "Open externally", onSelect: () => {} }
    ]
  });
  assert.ok(document.querySelector(".phone-sheet"));
  assert.equal(document.querySelectorAll(".phone-sheet-action").length, 2);
  controller.destroy();
});

test("tapping an action row selects it and closes the sheet", () => {
  let selected = null;
  openBottomSheet({
    items: [
      { title: "Copy Link", onSelect: () => (selected = "copy") },
      { title: "Open externally", onSelect: () => (selected = "open") }
    ]
  });

  document.querySelectorAll(".phone-sheet-action")[1].click();

  assert.equal(selected, "open");
  assert.equal(document.querySelector(".phone-sheet"), null);
});

test("tapping the backdrop dismisses without selecting anything", () => {
  let selected = null;
  let dismissed = false;
  openBottomSheet({
    items: [{ title: "X", onSelect: () => (selected = "x") }],
    onDismiss: () => {
      dismissed = true;
    }
  });

  document.querySelector(".phone-sheet-backdrop").click();

  assert.equal(dismissed, true);
  assert.equal(selected, null);
  assert.equal(document.querySelector(".phone-sheet"), null);
});

test("Escape dismisses the open sheet", () => {
  let dismissed = false;
  openBottomSheet({
    items: [{ title: "X", onSelect: () => {} }],
    onDismiss: () => (dismissed = true)
  });

  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(dismissed, true);
  assert.equal(document.querySelector(".phone-sheet"), null);
});

test("opening a new sheet closes any sheet already open", () => {
  let firstDismissed = false;
  openBottomSheet({ items: [], onDismiss: () => (firstDismissed = true) });
  openBottomSheet({ items: [] });

  assert.equal(firstDismissed, true);
  assert.equal(document.querySelectorAll(".phone-sheet").length, 1);

  closeActiveBottomSheet();
});

test("closeActiveBottomSheet closes whatever is open, and is a no-op when nothing is", () => {
  openBottomSheet({ items: [] });
  closeActiveBottomSheet();
  assert.equal(document.querySelector(".phone-sheet"), null);

  assert.doesNotThrow(() => closeActiveBottomSheet());
});

test("drag-to-dismiss: a small slow drag below the distance/velocity thresholds does not dismiss", async () => {
  let dismissed = false;
  openBottomSheet({
    items: [{ title: "X", onSelect: () => {} }],
    onDismiss: () => (dismissed = true)
  });
  const dragRegion = document.querySelector(".phone-sheet-drag-region");

  dispatchPointer(dragRegion, "pointerdown", { x: 0, y: 0, pointerId: 5 });
  await wait(60);
  dispatchPointer(dragRegion, "pointerup", { x: 0, y: 20, pointerId: 5 });

  assert.equal(dismissed, false);
  closeActiveBottomSheet();
});

test("drag-to-dismiss: a drag past the distance threshold dismisses", async () => {
  let dismissed = false;
  openBottomSheet({
    items: [{ title: "X", onSelect: () => {} }],
    onDismiss: () => (dismissed = true)
  });
  const dragRegion = document.querySelector(".phone-sheet-drag-region");

  dispatchPointer(dragRegion, "pointerdown", { x: 0, y: 0, pointerId: 5 });
  await wait(60);
  dispatchPointer(dragRegion, "pointerup", { x: 0, y: 100, pointerId: 5 });

  assert.equal(dismissed, true);
});

test("drag-to-dismiss: a fast downward flick dismisses even over a short distance", async () => {
  let dismissed = false;
  openBottomSheet({
    items: [{ title: "X", onSelect: () => {} }],
    onDismiss: () => (dismissed = true)
  });
  const dragRegion = document.querySelector(".phone-sheet-drag-region");

  dispatchPointer(dragRegion, "pointerdown", { x: 0, y: 0, pointerId: 6 });
  await wait(10);
  dispatchPointer(dragRegion, "pointerup", { x: 0, y: 30, pointerId: 6 });

  assert.equal(dismissed, true);
});

// Demonstrates the consumeBackRequest() integration pattern this component is meant to be
// used with — the same pattern already used by PosterOptionsDialogController in
// castDetailScreen.js/catalogSeeAllScreen.js: a screen keeps the returned controller and
// checks/closes it from its own consumeBackRequest(), rather than the component inventing a
// new backstack concept.
test("integrates with a screen's consumeBackRequest() the same way PosterOptionsDialogController does", () => {
  const fakeScreen = {
    sheetController: null,
    openMenu(items) {
      this.sheetController = openBottomSheet({
        items,
        onDismiss: () => {
          this.sheetController = null;
        }
      });
    },
    closeMenu() {
      if (!this.sheetController) {
        return false;
      }
      this.sheetController.destroy();
      return true;
    },
    consumeBackRequest() {
      return this.closeMenu();
    }
  };

  fakeScreen.openMenu([{ title: "X", onSelect: () => {} }]);
  assert.ok(document.querySelector(".phone-sheet"), "sheet is open");

  const consumedByOpenSheet = fakeScreen.consumeBackRequest();
  assert.equal(consumedByOpenSheet, true, "back is consumed while the sheet is open");
  assert.equal(document.querySelector(".phone-sheet"), null, "back closed the sheet");

  const consumedWithNothingOpen = fakeScreen.consumeBackRequest();
  assert.equal(consumedWithNothingOpen, false, "back falls through once nothing is open");
});
