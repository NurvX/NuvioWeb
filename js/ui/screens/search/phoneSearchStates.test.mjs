// Behavior tests for the #55 search + catalog state contracts. Pure seams only — no DOM,
// no screen object: `resolveSearchEmptyReason` (the four native reasons + retry flag) and
// `SEARCH_SUGGESTION_ACTIONS` (rich recent-row affordances), per the parity-test convention
// (behavior, never class names).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveSearchEmptyReason,
  searchStatusIsRetryable,
  isSearchEmptyReasonRetryable,
  SEARCH_SUGGESTION_ACTIONS,
  SEARCH_EMPTY_REASONS
} from "./phoneSearchStates.js";

test("resolveSearchEmptyReason distinguishes all four native reasons", () => {
  assert.equal(resolveSearchEmptyReason({ status: "no_addons" }), SEARCH_EMPTY_REASONS.NO_ADDONS);
  assert.equal(
    resolveSearchEmptyReason({ status: "no_catalogs" }),
    SEARCH_EMPTY_REASONS.NO_CATALOGS
  );
  assert.equal(resolveSearchEmptyReason({ status: "error" }), SEARCH_EMPTY_REASONS.REQUEST_FAILED);
  assert.equal(resolveSearchEmptyReason({ status: "no_results" }), SEARCH_EMPTY_REASONS.NO_RESULTS);
});

test("resolveSearchEmptyReason maps unknown/idle/loading statuses to null", () => {
  assert.equal(resolveSearchEmptyReason({ status: "idle" }), null);
  assert.equal(resolveSearchEmptyReason({ status: "loading" }), null);
  assert.equal(resolveSearchEmptyReason({ status: "results" }), null);
  assert.equal(resolveSearchEmptyReason({ status: "bogus" }), null);
});

test("only REQUEST_FAILED is retryable", () => {
  assert.equal(searchStatusIsRetryable("error"), true);
  assert.equal(searchStatusIsRetryable("no_addons"), false);
  assert.equal(searchStatusIsRetryable("no_catalogs"), false);
  assert.equal(searchStatusIsRetryable("no_results"), false);
  assert.equal(isSearchEmptyReasonRetryable(SEARCH_EMPTY_REASONS.REQUEST_FAILED), true);
  assert.equal(isSearchEmptyReasonRetryable(SEARCH_EMPTY_REASONS.NO_RESULTS), false);
});

test("SEARCH_SUGGESTION_ACTIONS fixes the rich recent-row action set", () => {
  assert.deepEqual([...SEARCH_SUGGESTION_ACTIONS], ["replay", "remove"]);
});

test("SEARCH_EMPTY_REASONS uses the shared data-state-reason vocabulary", () => {
  assert.deepEqual(
    { ...SEARCH_EMPTY_REASONS },
    {
      NO_ADDONS: "no_addons",
      NO_CATALOGS: "no_catalogs",
      REQUEST_FAILED: "error",
      NO_RESULTS: "no_results"
    }
  );
});
