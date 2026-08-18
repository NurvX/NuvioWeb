import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/"
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.CustomEvent = dom.window.CustomEvent;

function createFakeMediaQueryList(query, initialMatches) {
  const listeners = new Set();
  return {
    media: query,
    matches: initialMatches,
    addEventListener(type, listener) {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "change") listeners.delete(listener);
    },
    dispatch(nextMatches) {
      this.matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

const { Platform } = await import("./index.js");

test("isPhoneViewport reflects matchMedia on the browser platform", () => {
  assert.equal(Platform.getName(), "browser");

  const fakeList = createFakeMediaQueryList("(max-width: 600px)", true);
  const originalMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (query) => {
    assert.equal(query, "(max-width: 600px)");
    return fakeList;
  };

  try {
    assert.equal(Platform.isPhoneViewport(), true);
    fakeList.matches = false;
    assert.equal(Platform.isPhoneViewport(), false);
  } finally {
    globalThis.matchMedia = originalMatchMedia;
  }
});

test("isPhoneViewport is false off the browser platform even if matchMedia would match", () => {
  const fakeList = createFakeMediaQueryList("(max-width: 600px)", true);
  const originalMatchMedia = globalThis.matchMedia;
  const originalIsBrowser = Platform.isBrowser;
  globalThis.matchMedia = () => fakeList;
  Platform.isBrowser = () => false;

  try {
    assert.equal(Platform.isPhoneViewport(), false);
  } finally {
    globalThis.matchMedia = originalMatchMedia;
    Platform.isBrowser = originalIsBrowser;
  }
});

test("watchPhoneViewport fires the callback on change and unsubscribes cleanly", () => {
  const fakeList = createFakeMediaQueryList("(max-width: 600px)", false);
  const originalMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => fakeList;

  try {
    const seen = [];
    const unsubscribe = Platform.watchPhoneViewport((isPhone) => seen.push(isPhone));
    assert.equal(fakeList.listenerCount(), 1);

    fakeList.dispatch(true);
    assert.deepEqual(seen, [true]);

    fakeList.dispatch(false);
    assert.deepEqual(seen, [true, false]);

    unsubscribe();
    assert.equal(fakeList.listenerCount(), 0);

    fakeList.dispatch(true);
    assert.deepEqual(seen, [true, false], "no further calls after unsubscribe");
  } finally {
    globalThis.matchMedia = originalMatchMedia;
  }
});

test("watchPhoneViewport off the browser platform registers no listener and returns a no-op", () => {
  const fakeList = createFakeMediaQueryList("(max-width: 600px)", false);
  const originalMatchMedia = globalThis.matchMedia;
  const originalIsBrowser = Platform.isBrowser;
  globalThis.matchMedia = () => fakeList;
  Platform.isBrowser = () => false;

  try {
    const unsubscribe = Platform.watchPhoneViewport(() => {
      throw new Error("callback should never fire off the browser platform");
    });
    assert.equal(fakeList.listenerCount(), 0);
    assert.doesNotThrow(() => unsubscribe());
  } finally {
    globalThis.matchMedia = originalMatchMedia;
    Platform.isBrowser = originalIsBrowser;
  }
});
