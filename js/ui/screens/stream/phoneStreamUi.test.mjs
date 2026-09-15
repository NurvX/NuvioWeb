// Behavior tests for the #54 phone stream UI math (StreamsScreen.kt port). Pure functions —
// no DOM here: these assert the native resume / gating / empty-reason / sheet contracts
// directly, per the parity-test convention (behavior, never class names).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveStreamResumeState,
  toPlaybackClock,
  formatResumeBannerValue,
  STREAM_EMPTY_REASONS,
  resolveStreamEmptyReason,
  buildStreamActionSheetModel,
  filterStreamsByProvider,
  resolveStreamPlaybackAvailability
} from "./phoneStreamUi.js";

test("resolveStreamResumeState prefers a percent over a clock position", () => {
  const state = resolveStreamResumeState({
    progress: {
      positionMs: 90_000,
      progressPercent: 42,
      durationMs: 100_000,
      isResumable: true
    }
  });
  assert.deepEqual(state, { positionMs: null, progressFraction: 0.42 });
});

test("resolveStreamResumeState falls back to the clock position when no fraction is known", () => {
  assert.deepEqual(resolveStreamResumeState({ progress: { positionMs: 65_000 } }), {
    positionMs: 65_000,
    progressFraction: null
  });
  assert.deepEqual(resolveStreamResumeState({ initialPositionMs: 125_000 }), {
    positionMs: 125_000,
    progressFraction: null
  });
});

test("resolveStreamResumeState yields nothing for start-from-beginning or finished progress", () => {
  assert.deepEqual(
    resolveStreamResumeState({ startFromBeginning: true, initialPositionMs: 90_000 }),
    { positionMs: null, progressFraction: null }
  );
  assert.deepEqual(
    resolveStreamResumeState({ progress: { positionMs: 90_000, isResumable: false } }),
    { positionMs: null, progressFraction: null }
  );
  assert.deepEqual(resolveStreamResumeState({ initialPositionMs: 0 }), {
    positionMs: null,
    progressFraction: null
  });
});

test("toPlaybackClock formats h:mm:ss only when hours are present", () => {
  assert.equal(toPlaybackClock(0), "0:00");
  assert.equal(toPlaybackClock(65_000), "1:05");
  assert.equal(toPlaybackClock(3_661_000), "1:01:01");
  assert.equal(toPlaybackClock(-5), "0:00");
});

test("formatResumeBannerValue picks percent over clock, and is null with nothing", () => {
  assert.deepEqual(formatResumeBannerValue({ progressFraction: 0.4, positionMs: 90_000 }), {
    kind: "percent",
    percent: 40
  });
  assert.deepEqual(formatResumeBannerValue({ positionMs: 3_600_000 }), {
    kind: "clock",
    clock: "1:00:00"
  });
  assert.equal(formatResumeBannerValue({}), null);
});

test("resolveStreamEmptyReason maps the native empty-state set onto the shared vocabulary", () => {
  assert.equal(
    resolveStreamEmptyReason({ hasError: true, installedAddonCount: 2, sourceChipCount: 1 }),
    STREAM_EMPTY_REASONS.FETCH_FAILED
  );
  assert.equal(resolveStreamEmptyReason({ loading: true }), null);
  assert.equal(
    resolveStreamEmptyReason({ installedAddonCount: 0 }),
    STREAM_EMPTY_REASONS.NO_ADDONS
  );
  assert.equal(
    resolveStreamEmptyReason({ installedAddonCount: 2, sourceChipCount: 0 }),
    STREAM_EMPTY_REASONS.NO_COMPATIBLE_ADDONS
  );
  assert.equal(
    resolveStreamEmptyReason({
      installedAddonCount: 2,
      sourceChipCount: 1,
      hasPendingSourceLoads: true
    }),
    null
  );
  assert.equal(
    resolveStreamEmptyReason({ installedAddonCount: 2, sourceChipCount: 1 }),
    STREAM_EMPTY_REASONS.NO_STREAMS
  );
});

test("buildStreamActionSheetModel keeps the native header and row order", () => {
  const model = buildStreamActionSheetModel({ headline: "Torrentio 1080p", subtitle: "4.4 GB" });
  assert.equal(model.title, "Torrentio 1080p");
  assert.equal(model.subtitle, "4.4 GB");
  assert.deepEqual(model.actions, ["copy", "open_external", "open_internal", "download"]);

  const blank = buildStreamActionSheetModel({});
  assert.equal(blank.title, "Unknown source");
  assert.equal(blank.subtitle, "");
});

test('filterStreamsByProvider narrows by provider name; "all" keeps everything', () => {
  const streams = [
    { id: "a", addonName: "Torrentio" },
    { id: "b", addonName: "MediaFusion" },
    { id: "c", addonName: "Torrentio" }
  ];
  assert.deepEqual(
    filterStreamsByProvider(streams, "all").map((s) => s.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    filterStreamsByProvider(streams, "Torrentio").map((s) => s.id),
    ["a", "c"]
  );
  assert.deepEqual(filterStreamsByProvider(streams, "Nope"), []);

  // Always a new array — never the input reference.
  const narrowed = filterStreamsByProvider(streams, "Torrentio");
  assert.notEqual(narrowed, streams);
  assert.deepEqual(
    filterStreamsByProvider(streams).map((s) => s.id),
    ["a", "b", "c"]
  );
});

test("resolveStreamPlaybackAvailability gates play on sources and pending loads", () => {
  assert.deepEqual(resolveStreamPlaybackAvailability({ streamCount: 3 }), {
    canPlay: true,
    blockedReason: null
  });
  assert.deepEqual(
    resolveStreamPlaybackAvailability({ streamCount: 0, hasPendingSourceLoads: true }),
    { canPlay: false, blockedReason: "loading" }
  );
  assert.deepEqual(resolveStreamPlaybackAvailability({ streamCount: 0 }), {
    canPlay: false,
    blockedReason: "no_source"
  });
});
