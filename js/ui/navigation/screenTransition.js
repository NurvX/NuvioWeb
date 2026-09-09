// Custom phone screen-transition host (wayfinder #29/#30, spec #34).
// Replaces the native view-transition snapshot path: mount-then-animate with a
// symmetric fade+scale pair on token durations, compositor-only properties so
// gesture handling is untouched. Durations mirror css/base.css motion tokens —
// the stylesheet is the source of truth; this map only drives timeouts.

export const TRANSITION_TOKENS = {
  fast: 150,
  normal: 220,
  sheetEnter: 300,
  sheetExit: 250
};

export const SCREEN_ENTER_CLASS = "phone-screen-enter";
export const SCREEN_EXIT_CLASS = "phone-screen-exit";
export const SCREEN_SNAPSHOT_CLASS = "phone-screen-snapshot";
export const SCREEN_INERT_CLASS = "phone-screen-inert";

// Route names whose screens render into a differently-id'd shell root.
const ROUTE_ROOT_IDS = {
  authQrSignIn: "account",
  authSignIn: "account",
  syncCode: "account"
};

export function resolveDirection(options = {}) {
  return options?.isBackNavigation ? "back" : "forward";
}

export function getTransitionDuration(kind = "screen", leg = "enter") {
  if (kind === "sheet") {
    return leg === "exit" ? TRANSITION_TOKENS.sheetExit : TRANSITION_TOKENS.sheetEnter;
  }
  return TRANSITION_TOKENS.normal;
}

export function shouldInstant(options = {}) {
  return Boolean(options?.reducedMotion);
}

export function buildTransitionPlan({
  direction = "forward",
  kind = "screen",
  reducedMotion = false
} = {}) {
  const resolved = direction === "back" ? "back" : "forward";
  if (reducedMotion) {
    return {
      direction: resolved,
      kind,
      instant: true,
      durationMs: 0,
      enterClass: null,
      exitClass: null
    };
  }
  return {
    direction: resolved,
    kind,
    instant: false,
    durationMs: getTransitionDuration(kind, "enter"),
    enterClass: SCREEN_ENTER_CLASS,
    exitClass: SCREEN_EXIT_CLASS
  };
}

export function resolveRouteRoot(routeName) {
  if (!routeName || typeof document === "undefined") {
    return null;
  }
  const id = ROUTE_ROOT_IDS[routeName] || routeName;
  return document.getElementById(id) || null;
}

export function prefersReducedMotion() {
  try {
    return Boolean(globalThis?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch (_) {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function forceReflow(node) {
  try {
    void node?.offsetWidth;
  } catch (_) {}
}

let transitionGeneration = 0;

function isStale(generation) {
  return generation !== transitionGeneration;
}

export async function playScreenTransition({
  fromRoute = null,
  toRoute = null,
  direction = "forward",
  kind = "screen",
  reducedMotion = prefersReducedMotion(),
  durations = null,
  mountFn = null
} = {}) {
  const generation = ++transitionGeneration;
  const plan = buildTransitionPlan({ direction, kind, reducedMotion });
  const exitMs = Number(durations?.exit ?? getTransitionDuration(kind, "exit"));
  const enterMs = Number(durations?.enter ?? plan.durationMs);

  try {
    if (typeof document !== "undefined" && document?.documentElement) {
      document.documentElement.dataset.navDirection = plan.direction;
    }
  } catch (_) {}

  if (plan.instant) {
    await mountFn?.();
    return { direction: plan.direction, instant: true };
  }

  // Snapshot the outgoing root so it stays visible (inert) while the incoming
  // screen mounts underneath. The clone carries no listeners.
  let snapshot = null;
  try {
    const outgoing = resolveRouteRoot(fromRoute);
    if (outgoing && typeof outgoing.cloneNode === "function") {
      snapshot = outgoing.cloneNode(true);
      snapshot.classList.add(SCREEN_SNAPSHOT_CLASS, plan.exitClass, SCREEN_INERT_CLASS);
      snapshot.removeAttribute("id");
      document.body.appendChild(snapshot);
    }
  } catch (_) {
    snapshot = null;
  }

  await mountFn?.();
  if (isStale(generation)) {
    try {
      snapshot?.remove();
    } catch (_) {}
    return { direction: plan.direction, instant: false, stale: true };
  }

  try {
    const incoming = resolveRouteRoot(toRoute);
    if (incoming) {
      forceReflow(incoming);
      incoming.classList.add(plan.enterClass);
    }
  } catch (_) {}

  await wait(Math.max(exitMs, enterMs));
  try {
    snapshot?.remove();
  } catch (_) {}
  if (isStale(generation)) {
    return { direction: plan.direction, instant: false, stale: true };
  }

  try {
    const incoming = resolveRouteRoot(toRoute);
    incoming?.classList?.remove(plan.enterClass);
  } catch (_) {}
  return { direction: plan.direction, instant: false };
}
