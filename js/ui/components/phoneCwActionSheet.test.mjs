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

const { buildCwSheetRows, openCwActionSheet } = await import("./phoneCwActionSheet.js");

// ---------------------------------------------------------------------------------------
// buildCwSheetRows — pure row branching (#53 acceptance: next-up hides start-from-beginning,
// manual play only when offered, every row fires its own callback)
// ---------------------------------------------------------------------------------------

test("non-next-up item gets details + start-from-beginning + remove rows in native order", () => {
  const fired = [];
  const rows = buildCwSheetRows(
    { isNextUp: false, title: "S1E1" },
    {
      onOpenDetails: () => fired.push("details"),
      onStartFromBeginning: () => fired.push("startOver"),
      onRemove: () => fired.push("remove")
    }
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["details", "startFromBeginning", "remove"]
  );
  rows.forEach((row) => row.onSelect());
  assert.deepEqual(fired, ["details", "startOver", "remove"]);
});

test("next-up item hides start-from-beginning (resume-bound) but keeps details + remove", () => {
  const rows = buildCwSheetRows(
    { isNextUp: true, title: "Next Up" },
    {
      onOpenDetails: () => {},
      onStartFromBeginning: () => assert.fail("must not be offered for next-up"),
      onRemove: () => {}
    }
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["details", "remove"]
  );
});

test("play manually row only appears when the flag AND a handler are both present", () => {
  const rowsOff = buildCwSheetRows(
    { isNextUp: false },
    { showManualPlayOption: true, onOpenDetails: () => {}, onRemove: () => {} }
  );
  assert.ok(
    rowsOff.every((row) => row.id !== "playManually"),
    "handler missing -> no manual row"
  );

  let played = false;
  const rowsOn = buildCwSheetRows(
    { isNextUp: false },
    {
      showManualPlayOption: true,
      onOpenDetails: () => {},
      onPlayManually: () => (played = true),
      onRemove: () => {}
    }
  );
  assert.ok(rowsOn.some((row) => row.id === "playManually"));
  rowsOn.find((row) => row.id === "playManually").onSelect();
  assert.equal(played, true);
});

test("labelFor drives the copy; default falls back", () => {
  const withI18n = buildCwSheetRows(
    { isNextUp: false },
    {
      onOpenDetails: () => {},
      onRemove: () => {},
      labelFor: (key, fallback) => `${key}::${fallback}`,
      onStartFromBeginning: () => {}
    }
  );
  assert.equal(
    withI18n.find((row) => row.id === "details").label,
    "cw_action_go_to_details::Go to details"
  );
});

// ---------------------------------------------------------------------------------------
// openCwActionSheet — the shared scaffold renders header (poster/title/subtitle) + rows
// ---------------------------------------------------------------------------------------

test("openCwActionSheet renders the poster header + rows on the shared sheet host", () => {
  const controller = openCwActionSheet({
    item: { title: "Severance", episodeCode: "S1E1", episodeTitle: "Good News", isNextUp: false },
    posterUrl: "https://example.com/poster.jpg",
    onOpenDetails: () => {},
    onStartFromBeginning: () => {},
    onRemove: () => {}
  });

  const sheet = document.querySelector(".phone-sheet");
  assert.ok(sheet, "sheet is open");
  assert.ok(sheet.querySelector(".phone-cw-sheet-header"), "poster header renders");
  assert.ok(
    sheet
      .querySelector(".phone-cw-sheet-poster-image")
      ?.getAttribute("src")
      ?.includes("poster.jpg"),
    "poster image source"
  );
  assert.ok(
    sheet.querySelector(".phone-sheet-title")?.textContent.includes("Severance"),
    "title in header"
  );

  const titles = Array.from(sheet.querySelectorAll(".phone-sheet-action-title")).map(
    (node) => node.textContent
  );
  assert.deepEqual(titles, ["Go to details", "Start from beginning", "Remove"]);
  controller.destroy();
});

test("openCwActionSheet row taps fire their callback after dismissal", () => {
  let removed = false;
  let controller = null;
  controller = openCwActionSheet({
    item: { title: "Severance", isNextUp: false },
    showManualPlayOption: true,
    onOpenDetails: () => {},
    onPlayManually: () => {},
    onStartFromBeginning: () => {},
    onRemove: () => (removed = true)
  });

  const removeButton = Array.from(document.querySelectorAll(".phone-sheet-action")).find(
    (button) => button.querySelector(".phone-sheet-action-title")?.textContent === "Remove"
  );
  removeButton.click();

  assert.equal(removed, true);
  assert.equal(document.querySelector(".phone-sheet"), null, "sheet dismissed on select");
});
