// Phone stream screen pure UI math — ported from NuvioMobile's StreamsScreen.kt
// (parity #54). No DOM here: every function is a deterministic transformation of plain
// values so the behavior tests can assert the native resume/gating contract without a
// browser. `streamScreen.jsx`'s phone components consume these for the resume banner
// (percent-or-clock), the actions sheet model, and the granular empty-state reasons.

/**
 * Which resume position the stream screen should offer — the web port of
 * `resolveStreamResumeState`. A percent (progress fraction) wins over a clock position;
 * "start from beginning" or a finished/cold progress entry yields neither.
 *
 * @param {object} input
 * @param {{positionMs?: number, progressPercent?: number|null, durationMs?: number|null, isResumable?: boolean}|null} input.progress
 *   the watch-progress entry (route-carried or repository lookup)
 * @param {number|null} input.initialPositionMs fallback position when no entry exists
 * @param {number|null} input.initialProgressFraction fallback 0..1 fraction
 * @param {boolean} input.startFromBeginning explicit "start over" route flag
 * @returns {{positionMs: number|null, progressFraction: number|null}}
 */
export function resolveStreamResumeState({
  progress = null,
  initialPositionMs = null,
  initialProgressFraction = null,
  startFromBeginning = false
} = {}) {
  if (startFromBeginning || progress?.isResumable === false) {
    return { positionMs: null, progressFraction: null };
  }
  const rawFraction = progress ? progress.progressPercent : initialProgressFraction;
  const fraction =
    rawFraction != null && Number.isFinite(Number(rawFraction))
      ? Number(rawFraction) / (progress ? 100 : 1)
      : null;
  const clampedFraction =
    fraction != null && fraction > 0 ? Math.min(1, Math.max(0, fraction)) : null;
  if (clampedFraction != null) {
    return { positionMs: null, progressFraction: clampedFraction };
  }
  const candidate =
    progress?.positionMs != null ? Number(progress.positionMs) : Number(initialPositionMs);
  const positionMs = Number.isFinite(candidate) && candidate > 0 ? candidate : null;
  return { positionMs, progressFraction: null };
}

/** `Long.toPlaybackClock` — ms as `h:mm:ss` (hours only when present) or `m:ss`. */
export function toPlaybackClock(positionMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(positionMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * The resume banner value — percent when a fraction is known, else the playback clock, else
 * null (no banner). Mirrors `ResumeBanner`'s percent-vs-clock selection; the screen composes
 * the localized "Resume from …" label around this.
 *
 * @returns {{kind: "percent", percent: number}|{kind: "clock", clock: string}|null}
 */
export function formatResumeBannerValue({ positionMs = null, progressFraction = null } = {}) {
  if (progressFraction != null && progressFraction > 0) {
    return { kind: "percent", percent: Math.round(progressFraction * 100) };
  }
  if (positionMs != null && positionMs > 0) {
    return { kind: "clock", clock: toPlaybackClock(positionMs) };
  }
  return null;
}

// The granular empty reasons — same set as native `StreamsEmptyStateReason`, mapped onto
// the #52 shared state-card contract (`data-state-reason`): the first two and the last are
// terminal (no retry), fetch failure is retryable.
export const STREAM_EMPTY_REASONS = {
  NO_ADDONS: "no_addons",
  NO_COMPATIBLE_ADDONS: "no_compatible_addons",
  FETCH_FAILED: "error",
  NO_STREAMS: "no_results"
};

/**
 * Decides which empty/failure state the stream list should render, in the #52
 * `data-state-reason` vocabulary. `null` means "not an empty state" — a spinner is showing
 * (initial load, or a filter still has pending source loads).
 *
 * @param {object} input
 * @param {boolean} input.hasError the screen's load failed (screen.error present)
 * @param {boolean} input.loading initial load in flight
 * @param {number} input.installedAddonCount cached installed addons
 * @param {number} input.sourceChipCount addons that support this title
 * @param {boolean} input.hasPendingSourceLoads more sources still loading
 * @returns {string|null} STREAM_EMPTY_REASONS value or null
 */
export function resolveStreamEmptyReason({
  hasError = false,
  loading = false,
  installedAddonCount = 0,
  sourceChipCount = 0,
  hasPendingSourceLoads = false
} = {}) {
  if (hasError) {
    return STREAM_EMPTY_REASONS.FETCH_FAILED;
  }
  if (loading) {
    return null;
  }
  if (installedAddonCount <= 0) {
    return STREAM_EMPTY_REASONS.NO_ADDONS;
  }
  if (sourceChipCount <= 0) {
    return STREAM_EMPTY_REASONS.NO_COMPATIBLE_ADDONS;
  }
  if (hasPendingSourceLoads) {
    return null;
  }
  return STREAM_EMPTY_REASONS.NO_STREAMS;
}

/**
 * The per-stream actions sheet model — title/subtitle header plus row action keys, mirroring
 * `StreamActionsSheet` (header with the stream label + subtitle, then the copy/open/download
 * rows). The screen maps each key onto its own localized row title and handler so this
 * module stays DOM-free and locale-free.
 *
 * @param {object} stream the stream row (getStreamHeadline/getStreamSubtitle output)
 * @param {string} stream.headline
 * @param {string} [stream.subtitle]
 * @returns {{title: string, subtitle: string, actions: string[]}}
 *   actions, in native order: copy → open_external → open_internal → download
 */
export function buildStreamActionSheetModel(stream = {}) {
  const title = String(stream.headline || "").trim() || "Unknown source";
  const subtitle = String(stream.subtitle || "").trim();
  return {
    title,
    subtitle,
    actions: ["copy", "open_external", "open_internal", "download"]
  };
}

/**
 * Narrows the merged source list to a single provider ("all" keeps everything) — the web
 * counterpart of the native provider filter row, which filters the merged scraped sources by
 * addon/provider name. Pure so the narrowing contract is testable without a screen.
 *
 * @param {Array<object>} streams merged sources, most-recently-sorted
 * @param {string} filter provider name, or "all"
 * @returns {Array<object>} a new array (never the input reference)
 */
export function filterStreamsByProvider(streams = [], filter = "all") {
  const list = Array.isArray(streams) ? streams : [];
  const target = String(filter || "all").trim();
  if (!target || target === "all") {
    return list.slice();
  }
  return list.filter((stream) => String(stream?.addonName || "") === target);
}

/**
 * Whether the player may be entered — the web port of the native `canPlay` gate. Play is only
 * live once at least one source exists; while sources are still loading the gate is
 * "not yet" (busy, not blocked), and with none at all it is blocked so the screen never leads
 * into a dead player.
 *
 * @param {object} input
 * @param {number} input.streamCount sources currently visible for the active filter
 * @param {boolean} input.hasPendingSourceLoads more sources still resolving
 * @returns {{canPlay: boolean, blockedReason: "loading"|"no_source"|null}}
 */
export function resolveStreamPlaybackAvailability({
  streamCount = 0,
  hasPendingSourceLoads = false
} = {}) {
  if (Number(streamCount) > 0) {
    return { canPlay: true, blockedReason: null };
  }
  if (hasPendingSourceLoads) {
    return { canPlay: false, blockedReason: "loading" };
  }
  return { canPlay: false, blockedReason: "no_source" };
}
