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
  renderEmptyStateCard,
  renderOfflineCard,
  bindStateCardEvents,
  resolveStateCopy,
  isNetworkOffline
} = await import("./phoneStateCards.js");

const parseCard = (html) => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild;
};

test("offline reasons carry the offline reason as the behavior surface", () => {
  const noInternet = parseCard(renderOfflineCard({ condition: "no_internet" }));
  assert.equal(noInternet.dataset.stateReason, "offline:no_internet");
  assert.ok(noInternet.querySelector("[data-state-action]"), "offline card is retryable");
  assert.match(noInternet.textContent, /No internet/i);

  const serverCard = parseCard(renderOfflineCard({ condition: "servers_unreachable" }));
  assert.equal(serverCard.dataset.stateReason, "offline:servers_unreachable");
  assert.ok(serverCard.querySelector("[data-state-action]"));
});

test("offline cards escape the retry action label", () => {
  const card = parseCard(renderOfflineCard({ actionLabel: "Retry <now>" }));
  assert.ok(card.querySelector("[data-state-action]"));
  assert.match(card.querySelector("[data-state-action]").textContent, /Retry/);
  assert.equal(card.querySelector("[data-state-action]").querySelector("now"), null);
});

test("renderEmptyStateCard records each reason and toggles retry per reason", () => {
  const retryable = ["error", "connection_issue", "servers_unreachable", "no_internet"];
  const terminal = ["no_results", "empty", "no_addons", "no_catalogs"];

  retryable.forEach((reason) => {
    const card = parseCard(renderEmptyStateCard({ reason }));
    assert.equal(card.dataset.stateReason, reason);
    assert.ok(card.querySelector("[data-state-action]"), `${reason} is retryable`);
  });
  terminal.forEach((reason) => {
    const card = parseCard(renderEmptyStateCard({ reason }));
    assert.equal(card.dataset.stateReason, reason);
    assert.equal(card.querySelector("[data-state-action]"), null, `${reason} is terminal`);
  });
});

test("explicit title/message override built-in reason copy", () => {
  const card = parseCard(
    renderEmptyStateCard({ reason: "empty", title: "Custom", message: "Custom message" })
  );
  assert.match(card.textContent, /Custom/);
  assert.match(card.textContent, /Custom message/);
  assert.equal(card.dataset.stateReason, "empty");
});

test("renderEmptyStateCard escapes title, message, and action label", () => {
  const card = parseCard(
    renderEmptyStateCard({
      reason: "error",
      title: "<b>Oops</b>",
      message: "<i>Try</i> again",
      actionLabel: "<script>Retry</script>"
    })
  );
  assert.equal(card.querySelector(".phone-state-title").querySelector("b"), null);
  assert.equal(card.querySelector(".phone-state-message").querySelector("i"), null);
  assert.equal(card.querySelector("[data-state-action]").querySelector("script"), null);
  assert.equal(card.dataset.stateReason, "error");
});

test("bindStateCardEvents fires onAction for data-state-action clicks", () => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = renderEmptyStateCard({ reason: "error" });

  let fired = 0;
  bindStateCardEvents(host, { onAction: () => (fired += 1) });

  host.querySelector("[data-state-action]").click();
  assert.equal(fired, 1);

  // Second click fires again (repeatable retries).
  host.querySelector("[data-state-action]").click();
  assert.equal(fired, 2);
});

test("bindStateCardEvents is a safe no-op without a handler or buttons", () => {
  const host = dom.window.document.createElement("div");
  host.innerHTML = renderEmptyStateCard({ reason: "no_results" });
  assert.doesNotThrow(() => bindStateCardEvents(host, {}));
  assert.doesNotThrow(() => bindStateCardEvents(null, { onAction: () => {} }));
  assert.doesNotThrow(() => bindStateCardEvents(host, { onAction: () => {} }));
});

test("resolveStateCopy never returns an empty/undefined fallback copy", () => {
  const unknownCopy = resolveStateCopy("some_future_reason");
  assert.ok(unknownCopy.title);
  assert.ok(unknownCopy.message);
  assert.equal(resolveStateCopy("empty").title, "No items available");
  assert.equal(resolveStateCopy("no_results").message, "Try searching with different keywords");
});

test("isNetworkOffline reflects navigator.onLine", () => {
  // jsdom has no navigator.onLine (undefined) — treated as online.
  assert.equal(isNetworkOffline(), false);
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  assert.equal(isNetworkOffline(), true);
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  assert.equal(isNetworkOffline(), false);
});
