// Phone search/catalog state math — the #55 port of the native SearchScreen.kt empty-state
// reasons (`:386-442`: NoActiveAddons / NoSearchCatalogs / RequestFailed(+retry) /
// NoResults) and the rich recent-row action set (`SearchRecentRow`). DOM-free: the screen
// maps these onto the #52 shared state cards; tests assert the decision, not the markup.

/**
 * The four native search empty reasons, keyed onto the #52 `data-state-reason` vocabulary.
 * REQUEST_FAILED maps to "error" (the retryable reason on the shared card).
 */
export const SEARCH_EMPTY_REASONS = {
  NO_ADDONS: "no_addons",
  NO_CATALOGS: "no_catalogs",
  REQUEST_FAILED: "error",
  NO_RESULTS: "no_results"
};

/**
 * Resolves which empty/failure state a search result body should show.
 *
 * @param {object} input
 * @param {string} input.status the screen's `phoneSearchStatus`
 *   ("idle"|"loading"|"offline"|"no_addons"|"no_catalogs"|"error"|"no_results"|"results")
 * @returns {string|null} a SEARCH_EMPTY_REASONS value, or null when a non-empty state
 *   (loading spinner, offline card, or actual results) owns the body.
 */
export function resolveSearchEmptyReason({ status = "idle" } = {}) {
  switch (status) {
    case "no_addons":
      return SEARCH_EMPTY_REASONS.NO_ADDONS;
    case "no_catalogs":
      return SEARCH_EMPTY_REASONS.NO_CATALOGS;
    case "error":
      return SEARCH_EMPTY_REASONS.REQUEST_FAILED;
    case "no_results":
      return SEARCH_EMPTY_REASONS.NO_RESULTS;
    default:
      return null;
  }
}

/**
 * Whether the resolved reason should expose a Retry action — only RequestFailed retries,
 * matching the native contract ("retry only on failure").
 */
export function isSearchEmptyReasonRetryable(reason) {
  return reason === SEARCH_EMPTY_REASONS.REQUEST_FAILED;
}

/**
 * The rich recent-row affordances (`SearchRecentRow`): replay the term, remove it. Exported
 * so the row's action wiring has one testable source of truth.
 */
export const SEARCH_SUGGESTION_ACTIONS = Object.freeze(["replay", "remove"]);

/** Same retry decision, accepting the raw screen status for call-site convenience. */
export function searchStatusIsRetryable(status) {
  return isSearchEmptyReasonRetryable(resolveSearchEmptyReason({ status }));
}
