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

const {
  normalizeTrackerOptions,
  toggleTrackerOption,
  collectSelectedKeys,
  openTrackingListPickerSheet
} = await import("./phoneTrackingPicker.js");

// ---------------------------------------------------------------------------------------
// Pure option-state logic
// ---------------------------------------------------------------------------------------

test("normalizeTrackerOptions maps tabs + membership into {key, title, selected}", () => {
  const options = normalizeTrackerOptions(
    [
      { key: "watching", title: "Watching" },
      { key: "dropped", title: "Dropped" }
    ],
    { watching: true, dropped: false }
  );
  assert.deepEqual(options, [
    { key: "watching", title: "Watching", selected: true },
    { key: "dropped", title: "Dropped", selected: false }
  ]);
});

test("normalizeTrackerOptions falls back to a local Library tab when no tabs resolve", () => {
  const options = normalizeTrackerOptions([], {});
  assert.deepEqual(options, [{ key: "local", title: "Library", selected: false }]);
  assert.equal(
    normalizeTrackerOptions(null, {}, { fallbackTitle: "My Lists" })[0].title,
    "My Lists"
  );
});

test("toggleTrackerOption flips a checkbox; singleSelect makes it radio-like", () => {
  const options = normalizeTrackerOptions(
    [
      { key: "a", title: "A" },
      { key: "b", title: "B" }
    ],
    {}
  );
  const toggledA = toggleTrackerOption(options, "a");
  assert.deepEqual(collectSelectedKeys(toggledA), ["a"]);

  const multiBoth = toggleTrackerOption(toggledA, "b");
  assert.deepEqual(collectSelectedKeys(multiBoth), ["a", "b"]);

  const radioA = toggleTrackerOption(options, "a", { singleSelect: true });
  assert.deepEqual(collectSelectedKeys(radioA), ["a"]);
  const radioB = toggleTrackerOption(radioA, "b", { singleSelect: true });
  assert.deepEqual(collectSelectedKeys(radioB), ["b"]);
  const radioOff = toggleTrackerOption(radioB, "b", { singleSelect: true });
  assert.deepEqual(collectSelectedKeys(radioOff), []);
});

// ---------------------------------------------------------------------------------------
// openTrackingListPickerSheet — shared-scaffold render + toggle/save callbacks
// ---------------------------------------------------------------------------------------

test("picker sheet renders option rows with checkmark on selected, Save last", () => {
  const controller = openTrackingListPickerSheet({
    title: "Severance",
    subtitle: "Choose lists",
    options: [
      { key: "watching", title: "Watching", selected: true },
      { key: "dropped", title: "Dropped", selected: false }
    ]
  });
  const sheet = document.querySelector(".phone-sheet");
  assert.ok(sheet, "sheet is open");
  const titles = Array.from(sheet.querySelectorAll(".phone-sheet-action-title")).map(
    (node) => node.textContent
  );
  assert.deepEqual(titles, ["Watching", "Dropped", "Save"]);
  assert.equal(sheet.querySelectorAll(".phone-sheet-action-trailing").length, 1);
  controller.destroy();
});

test("tapping an option row toggles it in place and keeps the sheet open", () => {
  const controller = openTrackingListPickerSheet({
    title: "Severance",
    options: [
      { key: "watching", title: "Watching", selected: false },
      { key: "dropped", title: "Dropped", selected: false }
    ]
  });
  const sheet = document.querySelector(".phone-sheet");
  const watchingRow = Array.from(sheet.querySelectorAll(".phone-sheet-action"))[0];

  watchingRow.click();
  assert.ok(document.querySelector(".phone-sheet"), "sheet stays open on toggle");
  assert.equal(sheet.querySelectorAll(".phone-sheet-action-trailing").length, 1);

  watchingRow.click();
  assert.equal(sheet.querySelectorAll(".phone-sheet-action-trailing").length, 0, "toggle off");
  controller.destroy();
});

test("singleSelect toggling clears the other rows (radio semantics)", () => {
  const controller = openTrackingListPickerSheet({
    title: "Simkl",
    singleSelect: true,
    options: [
      { key: "watching", title: "Watching", selected: true },
      { key: "dropped", title: "Dropped", selected: false }
    ]
  });
  const sheet = document.querySelector(".phone-sheet");
  const droppedRow = Array.from(sheet.querySelectorAll(".phone-sheet-action"))[1];
  droppedRow.click();
  const marks = Array.from(sheet.querySelectorAll(".phone-sheet-action"));
  assert.equal(marks[0].querySelectorAll(".phone-sheet-action-trailing").length, 0);
  assert.equal(marks[1].querySelectorAll(".phone-sheet-action-trailing").length, 1);
  controller.destroy();
});

test("Save passes the final selected keys then closes the sheet", () => {
  let savedKeys = null;
  let dismissed = false;
  const controller = openTrackingListPickerSheet({
    title: "Severance",
    options: [
      { key: "watching", title: "Watching", selected: false },
      { key: "dropped", title: "Dropped", selected: false }
    ],
    onSave: (keys) => (savedKeys = keys),
    onDismiss: () => (dismissed = true)
  });
  const sheet = document.querySelector(".phone-sheet");
  const rows = Array.from(sheet.querySelectorAll(".phone-sheet-action"));
  rows[0].click(); // select watching
  rows[2].click(); // Save

  assert.deepEqual(savedKeys, ["watching"]);
  assert.equal(document.querySelector(".phone-sheet"), null, "sheet closes after save");
  assert.equal(dismissed, false, "save does not count as a user dismiss");
});

test("error notice renders above the rows when provided", () => {
  const controller = openTrackingListPickerSheet({
    title: "Simkl",
    noticeHtml: '<div class="phone-sheet-notice">Could not save list changes.</div>',
    options: [{ key: "a", title: "A", selected: false }]
  });
  const sheet = document.querySelector(".phone-sheet");
  assert.ok(sheet.querySelector(".phone-sheet-notice")?.textContent.includes("Could not save"));
  controller.destroy();
});
