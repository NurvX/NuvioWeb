// Per-profile Home scroll persistence (parity #58 "scroll restores per profile").
// NuvioMobile remembers where the Home list is per profile (`LazyListState`/remembered list
// state); the web equivalent stores the phone Home scroll container's `scrollTop` under a
// key scoped by profile id, so switching profiles returns each profile to its own place.
// Pure LocalStore passthrough — all behavior is testable with a jsdom localStorage.

import { LocalStore } from "./localStore.js";

const PHONE_HOME_SCROLL_PREFIX = "phoneHomeScroll";

export function phoneHomeScrollKey(profileId) {
  return `${PHONE_HOME_SCROLL_PREFIX}:${String(profileId || "1")}`;
}

/** The saved scrollTop (px) for `profileId`, or null when that profile has no saved Home
 * position yet. */
export function getPhoneHomeScrollForProfile(profileId) {
  const value = LocalStore.get(phoneHomeScrollKey(profileId), null);
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

/** Persists `scrollTop` (px) for `profileId`. Non-finite/negative values are ignored so an
 * in-progress teardown can't poison a profile's position. */
export function savePhoneHomeScrollForProfile(profileId, scrollTop) {
  const numeric = Number(scrollTop);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return;
  }
  LocalStore.set(phoneHomeScrollKey(profileId), numeric);
}

/** Drops the saved Home position for `profileId`. */
export function clearPhoneHomeScrollForProfile(profileId) {
  LocalStore.remove(phoneHomeScrollKey(profileId));
}
