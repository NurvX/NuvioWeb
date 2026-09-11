// Shared phone offline/empty state cards, ported from NuvioMobile's NuvioNetworkOfflineCard
// (NetworkOfflineCard.kt) and HomeEmptyStateCard (HomeStateCards.kt) — see parity ticket #52.
// One card primitive for every phone screen's failure/empty path so no screen blank-screens
// on slow addons, offline, or empty lists.
//
// Behavior contract (tests assert these, never class-name strings):
// - The card's root carries `data-state-reason` = the reason the screen is in this state
//   ("offline", "servers_unreachable", "connection_issue", "no_addons", "no_catalogs",
//   "no_results", "empty", "error").
// - Retryable reasons render a `data-state-action` button (default label "Retry") that
//   screens wire through `bindStateCardEvents`; "no_results"/"empty"/"no_addons"/
//   "no_catalogs" are terminal and get no button unless the caller passes `actionLabel`.
// - Built-in copy per reason mirrors NuvioMobile's titleForEmptyState/messageForEmptyState
//   (NetworkStatusRepository.kt); explicit `title`/`message` override it.

const REASON_COPY = {
  no_internet: {
    title: "No internet connection",
    message: "Check your connection and try again."
  },
  servers_unreachable: {
    title: "Cannot reach servers",
    message: "Servers are unreachable right now. Try again in a moment."
  },
  connection_issue: {
    title: "Connection issue",
    message: "Something went wrong connecting. Please check your connection."
  },
  no_addons: {
    title: "No addons installed",
    message: "Install an addon to start browsing."
  },
  no_catalogs: {
    title: "Nothing to browse",
    message: "No catalogs are available for this selection."
  },
  no_results: {
    title: "No Results",
    message: "Try searching with different keywords"
  },
  empty: {
    title: "No items available",
    message: ""
  },
  error: {
    title: "Something went wrong",
    message: "Try again in a moment."
  }
};

// Reasons that always get a Retry action (when the screen passes `onRetry`-able wiring).
const RETRYABLE_REASONS = new Set([
  "no_internet",
  "servers_unreachable",
  "connection_issue",
  "error"
]);

/** True when the browser reports no network (mirrors NuvioMobile's NoInternet condition). */
export function isNetworkOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Built-in title/message for a reason, mirroring NuvioMobile's empty-state copy. */
export function resolveStateCopy(reason) {
  return REASON_COPY[reason] || REASON_COPY.connection_issue;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns the shared empty/failure card markup. `reason` selects built-in copy and the
 * retryable contract; explicit `title`/`message` override the copy; `actionLabel` forces a
 * `data-state-action` button on non-retryable reasons (e.g. a "Connect" nudge). The root's
 * `data-state-reason` attribute is the behavior-test surface.
 */
export function renderEmptyStateCard({
  reason = "empty",
  condition = "",
  title = "",
  message = "",
  actionLabel = ""
} = {}) {
  const stateReason = condition ? `offline:${condition}` : reason;
  const copy = resolveStateCopy(reason);
  const shownTitle = String(title || copy.title || "");
  const shownMessage = String(message || copy.message || "");
  const retryable = RETRYABLE_REASONS.has(reason);
  const shownAction = String(actionLabel || (retryable ? "Retry" : ""));

  return `
    <div class="phone-state-card" data-state-reason="${escapeHtml(stateReason)}">
      <h3 class="phone-state-title">${escapeHtml(shownTitle)}</h3>
      ${shownMessage ? `<p class="phone-state-message">${escapeHtml(shownMessage)}</p>` : ""}
      ${shownAction ? `<button type="button" class="phone-state-action" data-state-action>${escapeHtml(shownAction)}</button>` : ""}
    </div>
  `;
}

/**
 * The offline-variant card (NuvioNetworkOfflineCard): title/message driven by the network
 * `condition` ("no_internet", "servers_unreachable", "connection_issue"), Retry button wired
 * by the calling screen.
 */
export function renderOfflineCard({ condition = "no_internet", actionLabel = "" } = {}) {
  // Pass `reason` (for copy/retry contract) AND `condition` (for the `offline:` marker).
  return renderEmptyStateCard({ reason: condition, condition, actionLabel });
}

/**
 * Wires `data-state-action` clicks inside `root` to `onAction` — the behavior seam screens
 * use to run their own retry/reload. Safe to call repeatedly (bindings are re-established
 * on each card render, matching the render-then-bind pattern bottomSheet consumers use).
 */
export function bindStateCardEvents(root, { onAction } = {}) {
  if (!root || typeof onAction !== "function") {
    return;
  }
  root.querySelectorAll("[data-state-action]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      onAction(event);
    };
  });
}
