// Phone gesture layer for js/ui/screens/player/playerScreen.js (ticket 04-02, mobile-parity
// epic — see .scratch/mobile-parity/spec.md and
// .scratch/mobile-parity/issues/04-02-player-gestures.md). Everything here is additive and
// gated behind Platform.isPhoneViewport() by the caller (playerScreen.js); this module never
// touches playerScreen.js's existing onKeyDown-based D-pad control logic.
//
// Classification is split, same as gestureEngine.js: plain DOM-free functions (exported and
// unit-tested directly with node:test, no DOM required) decide *what* a gesture means, and a
// single `attachPlayerGestureLayer` wires real Pointer Events to those decisions plus the
// caller-supplied side-effecting callbacks. The player's gesture surface recognizes several
// outcomes from one continuous pointer session (tap, double-tap-seek, hold-to-boost-speed,
// horizontal drag-to-scrub, vertical drag-to-adjust-brightness/volume) so it is implemented as
// one integrated tracker here rather than composing gestureEngine's attachLongPress/attachSwipe
// independently — those are built for single-outcome gestures on separate elements, but the
// player needs several outcomes disambiguated from the same pointer stream on the same surface.

const EDGE_MARGIN_PX = 28;
const DOUBLE_TAP_DELAY_MS = 260;
const HOLD_THRESHOLD_MS = 450;
const DRAG_AXIS_LOCK_PX = 16;

// Seek-rate scaling: "shorter content = more sensitive" is implemented as finer (smaller)
// seconds-per-pixel for shorter durations, so a given drag distance moves a smaller absolute
// amount of a short clip than the same drag would move a long movie — precise control near the
// start of short content, fast bulk scrubbing across long content. The divisor/bounds below are
// a deliberately simple linear model, not tuned against real devices; see 04-02 ticket note on
// manual verification for what "feels right" ended up meaning.
const SEEK_RATE_DURATION_DIVISOR = 240;
const SEEK_RATE_MIN_SEC_PER_PX = 0.05;
const SEEK_RATE_MAX_SEC_PER_PX = 4;

export const PLAYER_GESTURE_HOLD_SPEED = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Splits the gesture surface into left/middle/right thirds by x position — used for the
 * tap-vs-double-tap-seek zone (left seeks back, right seeks forward, middle toggles controls).
 */
export function classifyHorizontalZone(x, width) {
  if (!Number.isFinite(width) || width <= 0) {
    return "middle";
  }
  const ratio = x / width;
  if (ratio < 1 / 3) {
    return "left";
  }
  if (ratio > 2 / 3) {
    return "right";
  }
  return "middle";
}

/**
 * Splits the gesture surface into left/right halves by x position — used for the vertical-drag
 * zone (left half = brightness, right half = volume). A coarser split than the tap thirds
 * because only two vertical-drag behaviors exist, and a third "do nothing" middle band for
 * vertical drags would just make the gesture feel unreliable near the center of the screen.
 */
export function classifyVerticalDragSide(x, width) {
  if (!Number.isFinite(width) || width <= 0) {
    return "right";
  }
  return x < width / 2 ? "left" : "right";
}

/** Whether a pointer-down at `y` is too close to the top/bottom edge to start a gesture — kept
 * clear of OS/browser system gestures (pull-to-refresh, browser-chrome reveal on scroll). */
export function isNearVerticalEdge(y, height, margin = EDGE_MARGIN_PX) {
  if (!Number.isFinite(height) || height <= 0) {
    return false;
  }
  return y <= margin || y >= height - margin;
}

/**
 * Decides whether an in-progress drag should lock to the horizontal (scrub) or vertical
 * (brightness/volume) axis, once movement has exceeded `lockPx` on at least one axis. Returns
 * null while the movement is still within the lock tolerance on both axes (axis not yet
 * decided — the caller should keep waiting, this could still resolve into a tap or hold).
 */
export function resolveDragAxis(dx, dy, lockPx = DRAG_AXIS_LOCK_PX) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < lockPx && absDy < lockPx) {
    return null;
  }
  return absDx >= absDy ? "horizontal" : "vertical";
}

/** Seconds-per-pixel scrub rate for a given content duration — see module header comment. */
export function computeSeekRateSecondsPerPixel(durationSeconds) {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  if (!duration) {
    return SEEK_RATE_MIN_SEC_PER_PX;
  }
  const rate = duration / SEEK_RATE_DURATION_DIVISOR;
  return clamp(rate, SEEK_RATE_MIN_SEC_PER_PX, SEEK_RATE_MAX_SEC_PER_PX);
}

/** The live scrub-preview position for a horizontal drag, clamped to the content's duration. */
export function computeSeekPreviewSeconds({ baseSeconds = 0, dx = 0, durationSeconds = 0 } = {}) {
  const rate = computeSeekRateSecondsPerPixel(durationSeconds);
  const base = Number.isFinite(baseSeconds) ? baseSeconds : 0;
  const next = base + Number(dx || 0) * rate;
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return clamp(next, 0, durationSeconds);
  }
  return Math.max(0, next);
}

/**
 * The live value (0..1) for a vertical drag (brightness or volume), where dragging up
 * increases the value and dragging down decreases it, scaled so a full-height drag spans the
 * whole 0..1 range.
 */
export function computeVerticalDragValue({ startValue = 0, dy = 0, viewportHeight = 0 } = {}) {
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 1;
  const delta = -(Number(dy || 0) / height);
  const start = Number.isFinite(startValue) ? startValue : 0;
  return clamp(start + delta, 0, 1);
}

/**
 * Given the previous tap's timestamp/zone and a new tap, decides whether the new tap completes
 * a double-tap (same zone, within `delayMs`) or should instead be held pending as the first tap
 * of a possible double-tap. This is the pure decision only — the setTimeout-based "wait to see
 * if a second tap arrives" bookkeeping lives in `attachPlayerGestureLayer` below, since that's
 * inherently a stateful/timer concern.
 */
export function isDoubleTap(
  { lastTapAt = 0, lastTapZone = null, now = 0, zone = "middle" } = {},
  delayMs = DOUBLE_TAP_DELAY_MS
) {
  return Boolean(lastTapAt) && lastTapZone === zone && now - lastTapAt <= delayMs;
}

/**
 * Wires the full phone player gesture surface to `el` (the player UI root): single tap
 * (delayed to disambiguate from a double-tap), double-tap left/right-third seek, press-and-hold
 * speed boost, horizontal drag-to-scrub, and vertical drag-to-adjust brightness (left half) /
 * volume (right half). All classification decisions delegate to the pure functions above.
 * Returns a teardown function.
 *
 * `getContext()` is called at the start of each gesture (pointerdown) and must return
 * `{ width, height, currentSeconds, durationSeconds, brightness, volume, scrubEnabled }` — a
 * fresh read each time since player state changes continuously during playback.
 * `shouldIgnoreTarget(target)` lets the caller exclude pointerdowns that land on existing
 * interactive chrome (control buttons, dialogs, the progress bar) so this layer only handles
 * gestures on the bare video surface, alongside — not instead of — the desktop-oriented click
 * delegation `onPointerActivate` already provides.
 */
export function attachPlayerGestureLayer(
  el,
  {
    getContext,
    shouldIgnoreTarget,
    onSingleTap,
    onSeekTap,
    onHoldStart,
    onHoldEnd,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    onBrightnessMove,
    onVolumeMove,
    onDragEnd,
    onFeedback,
    edgeMargin = EDGE_MARGIN_PX,
    doubleTapDelayMs = DOUBLE_TAP_DELAY_MS,
    holdThresholdMs = HOLD_THRESHOLD_MS,
    dragAxisLockPx = DRAG_AXIS_LOCK_PX
  } = {}
) {
  if (!el) {
    return () => {};
  }

  const resolveContext = () => (typeof getContext === "function" ? getContext() || {} : {});
  const now = (event) => (typeof event?.timeStamp === "number" ? event.timeStamp : Date.now());

  let tracking = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let mode = null; // null | "hold" | "scrub" | "brightness" | "volume"
  let context = {};
  let holdTimer = null;
  let pendingTap = null; // { zone, timer }

  const clearHoldTimer = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const clearPendingTap = () => {
    if (pendingTap?.timer) {
      clearTimeout(pendingTap.timer);
    }
    pendingTap = null;
  };

  const resetTracking = () => {
    tracking = false;
    pointerId = null;
    mode = null;
    clearHoldTimer();
  };

  const fireFeedback = (payload) => {
    onFeedback?.(payload);
  };

  const handleResolvedTap = (zone, event) => {
    const tapTime = now(event);
    if (
      isDoubleTap(
        { lastTapAt: pendingTap?.at, lastTapZone: pendingTap?.zone, now: tapTime, zone },
        doubleTapDelayMs
      )
    ) {
      clearPendingTap();
      if (zone === "left") {
        onSeekTap?.(-1, event);
      } else if (zone === "right") {
        onSeekTap?.(1, event);
      } else {
        onSingleTap?.(event);
      }
      return;
    }
    clearPendingTap();
    pendingTap = {
      zone,
      at: tapTime,
      timer: setTimeout(() => {
        pendingTap = null;
        onSingleTap?.(event);
      }, doubleTapDelayMs)
    };
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (typeof shouldIgnoreTarget === "function" && shouldIgnoreTarget(event.target)) {
      return;
    }
    const rect = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (isNearVerticalEdge(y, rect.height, edgeMargin)) {
      return;
    }

    context = { ...resolveContext(), width: rect.width, height: rect.height };
    tracking = true;
    pointerId = event.pointerId;
    startX = x;
    startY = y;
    mode = null;

    clearHoldTimer();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!tracking || mode !== null) {
        return;
      }
      mode = "hold";
      onHoldStart?.(context, event);
    }, holdThresholdMs);
  };

  const onPointerMove = (event) => {
    if (!tracking || event.pointerId !== pointerId) {
      return;
    }
    const rect = el.getBoundingClientRect?.() || { left: 0, top: 0 };
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - startX;
    const dy = y - startY;

    if (mode === "hold") {
      // A hold that starts moving significantly stops being a "held in place" boost.
      if (resolveDragAxis(dx, dy, dragAxisLockPx * 2)) {
        onHoldEnd?.(context, event);
        mode = "drag-from-hold";
      }
      return;
    }
    if (mode === "drag-from-hold") {
      return;
    }

    if (mode === null) {
      const axis = resolveDragAxis(dx, dy, dragAxisLockPx);
      if (!axis) {
        return;
      }
      clearHoldTimer();
      if (axis === "horizontal") {
        if (context.scrubEnabled === false) {
          mode = "drag-ignored";
          return;
        }
        mode = "scrub";
        onScrubStart?.(context, event);
      } else {
        const side = classifyVerticalDragSide(startX, context.width);
        mode = side === "left" ? "brightness" : "volume";
      }
    }

    if (mode === "scrub") {
      const previewSeconds = computeSeekPreviewSeconds({
        baseSeconds: context.currentSeconds,
        dx,
        durationSeconds: context.durationSeconds
      });
      const limitHit =
        previewSeconds <= 0 ||
        (Number(context.durationSeconds) > 0 && previewSeconds >= context.durationSeconds);
      onScrubMove?.({ previewSeconds, dx }, event);
      fireFeedback({ type: "scrub", value: previewSeconds, limitHit });
    } else if (mode === "brightness") {
      const value = computeVerticalDragValue({
        startValue: context.brightness,
        dy,
        viewportHeight: context.height
      });
      onBrightnessMove?.(value, event);
      fireFeedback({ type: "brightness", value, limitHit: value <= 0 || value >= 1 });
    } else if (mode === "volume") {
      const value = computeVerticalDragValue({
        startValue: context.volume,
        dy,
        viewportHeight: context.height
      });
      onVolumeMove?.(value, event);
      fireFeedback({ type: "volume", value, limitHit: value <= 0 || value >= 1 });
    }
  };

  const finish = (event, cancelled) => {
    if (!tracking || event.pointerId !== pointerId) {
      return;
    }
    clearHoldTimer();
    const finishedMode = mode;
    tracking = false;
    mode = null;

    if (finishedMode === "hold") {
      onHoldEnd?.(context, event);
      return;
    }
    if (finishedMode === "scrub") {
      const rect = el.getBoundingClientRect?.() || { left: 0 };
      const dx = event.clientX - rect.left - startX;
      const previewSeconds = computeSeekPreviewSeconds({
        baseSeconds: context.currentSeconds,
        dx,
        durationSeconds: context.durationSeconds
      });
      onScrubEnd?.({ previewSeconds, committed: !cancelled }, event);
      onDragEnd?.("scrub", event);
      return;
    }
    if (finishedMode === "brightness" || finishedMode === "volume") {
      onDragEnd?.(finishedMode, event);
      return;
    }
    if (finishedMode === "drag-from-hold" || finishedMode === "drag-ignored") {
      return;
    }

    // No drag/hold resolved — this pointer session was a clean tap.
    if (!cancelled) {
      const zone = classifyHorizontalZone(startX, context.width);
      handleResolvedTap(zone, event);
    }
  };

  const onPointerUp = (event) => finish(event, false);
  const onPointerCancel = (event) => finish(event, true);

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  return () => {
    clearPendingTap();
    resetTracking();
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
  };
}
