import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/"
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const {
  getPhoneHomeScrollForProfile,
  savePhoneHomeScrollForProfile,
  clearPhoneHomeScrollForProfile,
  phoneHomeScrollKey
} = await import("./phoneHomeScrollStore.js");

test("save then get round-trips a profile's Home scroll offset", () => {
  savePhoneHomeScrollForProfile("1", 480);
  assert.equal(getPhoneHomeScrollForProfile("1"), 480);
});

test("unknown profiles have no saved offset", () => {
  assert.equal(getPhoneHomeScrollForProfile("2"), null);
});

test("scroll offsets are keyed per profile", () => {
  savePhoneHomeScrollForProfile("1", 100);
  savePhoneHomeScrollForProfile("2", 640);
  assert.equal(getPhoneHomeScrollForProfile("1"), 100);
  assert.equal(getPhoneHomeScrollForProfile("2"), 640);
});

test("non-finite and negative saves are ignored", () => {
  savePhoneHomeScrollForProfile("3", NaN);
  savePhoneHomeScrollForProfile("3", -50);
  assert.equal(getPhoneHomeScrollForProfile("3"), null);
});

test("clear removes only the given profile's offset", () => {
  savePhoneHomeScrollForProfile("4", 200);
  clearPhoneHomeScrollForProfile("4");
  assert.equal(getPhoneHomeScrollForProfile("4"), null);
});

test("the store key is profiled and namespaced", () => {
  assert.equal(phoneHomeScrollKey("1"), "phoneHomeScroll:1");
  assert.equal(phoneHomeScrollKey(""), "phoneHomeScroll:1", "defaults to profile 1");
});
