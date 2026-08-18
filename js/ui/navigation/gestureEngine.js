// Touch-gesture primitives for phone-mode screens — pure Pointer Events, no framework.
// FocusEngine.js only understands a single tap (click) -> onPointerActivate; long-press,
// swipe, and pager interactions are new gesture types phone screens need that FocusEngine's
// contract doesn't cover. See .scratch/mobile-parity/spec.md.
//
// Each attach* function wires real DOM listeners and delegates its classification decision
// to a plain, DOM-free function exported alongside it (also used directly by
// gestureEngine.test.mjs, without needing a DOM or real timers).

const DEFAULT_LONG_PRESS_THRESHOLD_MS = 500;
const DEFAULT_MOVE_TOLERANCE_PX = 10;
const DEFAULT_SWIPE_MIN_DISTANCE_PX = 24;
const DEFAULT_SWIPE_MIN_VELOCITY = 0.15; // px/ms
const DEFAULT_PAGER_DISTANCE_THRESHOLD = 0.3; // fraction of itemWidth
const DEFAULT_PAGER_VELOCITY_THRESHOLD = 0.3; // px/ms

/** Whether a pointer has moved far enough from its start point to no longer count as a tap. */
export function exceedsMoveTolerance(dx, dy, tolerance = DEFAULT_MOVE_TOLERANCE_PX) {
  return Math.hypot(dx, dy) > tolerance;
}

/**
 * Given the end-of-gesture state a long-press tracker collected, decides whether a "clean
 * tap" occurred — i.e. whether `onTap` should fire. A long-press that already fired, a
 * gesture that moved past tolerance, or one ended by pointercancel are all not clean taps.
 */
export function resolveTapOutcome({
  longPressFired = false,
  movedTooFar = false,
  cancelled = false
} = {}) {
  return !longPressFired && !movedTooFar && !cancelled;
}

/**
 * Attaches a long-press/tap recognizer to `el`. A press held for `threshold` ms without
 * moving past `moveTolerance` fires `onLongPress` and marks the element so FocusEngine's
 * pointer-click dispatch (js/ui/navigation/focusEngine.js) skips the trailing
 * `onPointerActivate` call the browser's own click event would otherwise still fire. A press
 * released before the threshold, without exceeding the tolerance, fires `onTap`. Returns a
 * teardown function.
 */
export function attachLongPress(
  el,
  {
    onLongPress,
    onTap,
    threshold = DEFAULT_LONG_PRESS_THRESHOLD_MS,
    moveTolerance = DEFAULT_MOVE_TOLERANCE_PX
  } = {}
) {
  if (!el) {
    return () => {};
  }

  let timer = null;
  let tracking = false;
  let longPressFired = false;
  let movedTooFar = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const resetState = () => {
    tracking = false;
    longPressFired = false;
    movedTooFar = false;
    clearTimer();
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    tracking = true;
    longPressFired = false;
    movedTooFar = false;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      timer = null;
      if (!tracking || movedTooFar) {
        return;
      }
      longPressFired = true;
      el.dataset.suppressNextTap = "1";
      onLongPress?.(event);
    }, threshold);
  };

  const onPointerMove = (event) => {
    if (!tracking || longPressFired || movedTooFar) {
      return;
    }
    if (exceedsMoveTolerance(event.clientX - startX, event.clientY - startY, moveTolerance)) {
      movedTooFar = true;
      clearTimer();
    }
  };

  const onPointerUp = (event) => {
    const isCleanTap =
      tracking && resolveTapOutcome({ longPressFired, movedTooFar, cancelled: false });
    resetState();
    if (isCleanTap) {
      onTap?.(event);
    }
  };

  const onPointerCancel = () => {
    resetState();
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  return () => {
    resetState();
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
  };
}

/**
 * Classifies a completed drag: does it count as a swipe, and in which direction, given the
 * total displacement and elapsed time. Distance-based (moved far enough) or velocity-based
 * (moved fast enough, even if short) either qualify — matching how a flick gesture reads as
 * a swipe on real touch devices even without much total travel.
 */
export function classifySwipe({
  dx = 0,
  dy = 0,
  elapsedMs = 1,
  axis = "x",
  minDistance = DEFAULT_SWIPE_MIN_DISTANCE_PX,
  minVelocity = DEFAULT_SWIPE_MIN_VELOCITY
} = {}) {
  const primary = axis === "y" ? dy : dx;
  const distance = Math.abs(primary);
  const safeElapsed = Math.max(1, elapsedMs);
  const velocity = distance / safeElapsed;
  if (distance < minDistance && velocity < minVelocity) {
    return { direction: null, distance, velocity };
  }
  const direction = axis === "y" ? (primary < 0 ? "up" : "down") : primary < 0 ? "left" : "right";
  return { direction, distance, velocity };
}

/**
 * Attaches drag tracking to `el` along a single axis. Reports live movement via
 * `onSwipeMove({dx, dy})` and the classified result via `onSwipeEnd({direction, distance,
 * velocity, cancelled})`. If `onDismiss` is supplied and the classified direction matches
 * `dismissDirection`, `onDismiss` fires too. `dismissDirection` defaults to "down" for a
 * vertical axis (the bottom sheet's drag-away-to-dismiss direction — the only dismiss use
 * case this effort has so far); there's no default for the horizontal axis since no current
 * consumer dismisses on a swipe — pass `dismissDirection` explicitly if a future horizontal
 * consumer needs one, rather than relying on a guessed convention. Returns a teardown
 * function.
 */
export function attachSwipe(
  el,
  {
    axis = "x",
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
    onDismiss,
    dismissDirection = axis === "y" ? "down" : null,
    minDistance = DEFAULT_SWIPE_MIN_DISTANCE_PX,
    minVelocity = DEFAULT_SWIPE_MIN_VELOCITY
  } = {}
) {
  if (!el) {
    return () => {};
  }

  let tracking = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const now = (event) => (typeof event?.timeStamp === "number" ? event.timeStamp : Date.now());

  const onPointerDown = (event) => {
    tracking = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startTime = now(event);
    onSwipeStart?.(event);
  };

  const onPointerMove = (event) => {
    if (!tracking || event.pointerId !== pointerId) {
      return;
    }
    onSwipeMove?.({ event, dx: event.clientX - startX, dy: event.clientY - startY });
  };

  const finish = (event, cancelled) => {
    if (!tracking || event.pointerId !== pointerId) {
      return;
    }
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const elapsedMs = now(event) - startTime;
    const result = classifySwipe({ dx, dy, elapsedMs, axis, minDistance, minVelocity });
    onSwipeEnd?.({
      event,
      dx,
      dy,
      direction: result.direction,
      distance: result.distance,
      velocity: result.velocity,
      cancelled
    });
    if (
      !cancelled &&
      dismissDirection &&
      result.direction === dismissDirection &&
      typeof onDismiss === "function"
    ) {
      onDismiss(event);
    }
  };

  const onPointerUp = (event) => finish(event, false);
  const onPointerCancel = (event) => finish(event, true);

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  return () => {
    tracking = false;
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
  };
}

function clampIndex(index, itemCount) {
  if (!Number.isFinite(itemCount) || itemCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(itemCount - 1, index));
}

/**
 * Given a completed drag on a paged track, decides which item index it should snap to.
 * Advances one item when the drag crossed `distanceThreshold` of `itemWidth`, or was fast
 * enough to cross `velocityThreshold` regardless of distance (a flick). Clamps at the ends —
 * dragging past the last/first item does not wrap; only `attachPager`'s auto-advance timer
 * wraps around.
 */
export function computeSnapIndex({
  currentIndex = 0,
  itemCount = 0,
  dx = 0,
  itemWidth = 0,
  velocity = 0,
  distanceThreshold = DEFAULT_PAGER_DISTANCE_THRESHOLD,
  velocityThreshold = DEFAULT_PAGER_VELOCITY_THRESHOLD
} = {}) {
  if (!itemWidth || itemCount <= 0) {
    return clampIndex(currentIndex, itemCount);
  }
  const ratio = Math.abs(dx) / itemWidth;
  const shouldAdvance = ratio > distanceThreshold || Math.abs(velocity) > velocityThreshold;
  if (!shouldAdvance) {
    return clampIndex(currentIndex, itemCount);
  }
  const delta = dx < 0 ? 1 : -1;
  return clampIndex(currentIndex + delta, itemCount);
}

/**
 * Wires swipe-to-change paging to `el` (e.g. the Home hero), with an optional auto-advance
 * timer. `getItemCount` is called on demand so the item count can change over the pager's
 * lifetime (e.g. more hero candidates loading in). `onIndexChange(nextIndex)` fires whenever
 * the current page changes, from either a drag or an auto-advance tick. Returns a teardown
 * function.
 */
export function attachPager(
  el,
  { itemWidth = 0, onIndexChange, autoAdvanceMs = 0, getItemCount } = {}
) {
  if (!el) {
    return () => {};
  }

  let currentIndex = 0;
  let autoTimer = null;

  const resolveItemCount = () => {
    const count = typeof getItemCount === "function" ? Number(getItemCount()) : 0;
    return Number.isFinite(count) ? count : 0;
  };

  const clearAutoAdvance = () => {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  };

  const scheduleAutoAdvance = () => {
    clearAutoAdvance();
    const count = resolveItemCount();
    if (!autoAdvanceMs || count <= 1) {
      return;
    }
    autoTimer = setTimeout(() => {
      const nextCount = resolveItemCount();
      if (nextCount <= 0) {
        scheduleAutoAdvance();
        return;
      }
      const nextIndex = (currentIndex + 1) % nextCount;
      if (nextIndex !== currentIndex) {
        currentIndex = nextIndex;
        onIndexChange?.(currentIndex);
      }
      scheduleAutoAdvance();
    }, autoAdvanceMs);
  };

  const detachSwipe = attachSwipe(el, {
    axis: "x",
    onSwipeStart: clearAutoAdvance,
    onSwipeEnd: ({ dx, velocity, cancelled }) => {
      if (!cancelled) {
        const nextIndex = computeSnapIndex({
          currentIndex,
          itemCount: resolveItemCount(),
          dx,
          itemWidth,
          velocity
        });
        if (nextIndex !== currentIndex) {
          currentIndex = nextIndex;
          onIndexChange?.(currentIndex);
        }
      }
      scheduleAutoAdvance();
    }
  });

  scheduleAutoAdvance();

  return () => {
    clearAutoAdvance();
    detachSwipe();
  };
}
