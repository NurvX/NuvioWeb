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
  readResumePromptState,
  markPlayerEntered,
  markPlayerExitedNormally,
  consumeResumePrompt,
  renderResumePromptFloating,
  bindResumePrompt
} = await import("./phoneResumePrompt.js");

const STORAGE_KEY = "nuvio.phoneResumePrompt";

// ---------------------------------------------------------------------------------------
// Storage transitions (the one-shot arm/clear/consume contract)
// ---------------------------------------------------------------------------------------

test("markPlayerEntered arms wasInPlayer + videoId + the CW-shaped snapshot", () => {
  localStorage.clear();
  markPlayerEntered("tt123:s1e1", {
    contentId: "tt123",
    title: "Severance",
    season: 1,
    episode: 1
  });
  const state = readResumePromptState();
  assert.equal(state.wasInPlayer, true);
  assert.equal(state.videoId, "tt123:s1e1");
  assert.equal(state.item.title, "Severance");
});

test("consumeResumePrompt is one-shot: returns the item once, then the arm is cleared", () => {
  localStorage.clear();
  markPlayerEntered("tt123:s1e1", { contentId: "tt123", title: "Severance" });
  const first = consumeResumePrompt();
  assert.equal(first.videoId, "tt123:s1e1");
  assert.equal(first.item.title, "Severance");
  assert.equal(consumeResumePrompt(), null, "second consume is null");
  assert.equal(readResumePromptState().wasInPlayer, false, "arm cleared");
});

test("consumeResumePrompt returns null when never armed", () => {
  localStorage.clear();
  assert.equal(consumeResumePrompt(), null);
});

test("markPlayerExitedNormally clears the arm so home never prompts after a normal exit", () => {
  localStorage.clear();
  markPlayerEntered("tt456", { contentId: "tt456", title: "Movie" });
  markPlayerExitedNormally();
  assert.equal(readResumePromptState().wasInPlayer, false);
  assert.equal(consumeResumePrompt(), null);
});

test("markPlayerEntered ignores an empty videoId (nothing to resume)", () => {
  localStorage.clear();
  markPlayerEntered("", { title: "X" });
  assert.equal(readResumePromptState().wasInPlayer, false);
});

// ---------------------------------------------------------------------------------------
// Floating prompt render + action wiring
// ---------------------------------------------------------------------------------------

test("renderResumePromptFloating emits poster/copy/Resume/Dismiss markup", () => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = renderResumePromptFloating({
    title: "Severance",
    subtitle: "S1E1 • Good News",
    posterUrl: "https://example.com/p.jpg",
    resumeLabel: "Resume",
    dismissLabel: "Dismiss"
  });
  const prompt = host.querySelector(".phone-resume-prompt");
  assert.ok(prompt, "prompt renders");
  assert.ok(prompt.querySelector(".phone-resume-prompt-title")?.textContent.includes("Severance"));
  assert.ok(prompt.querySelector(".phone-resume-prompt-subtitle")?.textContent.includes("S1E1"));
  assert.ok(prompt.querySelector("[data-resume-action]"), "Resume action present");
  assert.ok(prompt.querySelector("[data-resume-dismiss]"), "Dismiss action present");
});

test("bindResumePrompt fires onResume / onDismiss and suppresses default behavior", () => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = renderResumePromptFloating({});
  dom.window.document.body.appendChild(host);

  let resumed = 0;
  let dismissed = 0;
  bindResumePrompt(host, {
    onResume: () => (resumed += 1),
    onDismiss: () => (dismissed += 1)
  });
  host.querySelector("[data-resume-action]").click();
  host.querySelector("[data-resume-dismiss]").click();
  assert.equal(resumed, 1);
  assert.equal(dismissed, 1);

  // Safe no-op on a root without a prompt (e.g. when nothing armed)
  bindResumePrompt(dom.window.document.createElement("div"), { onResume: () => {} });
  bindResumePrompt(null, { onResume: () => {} });
});
