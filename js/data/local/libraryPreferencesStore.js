import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const KEY = "libraryPreferences";

function normalizeProfileId(profileId = null) {
  return String(profileId ?? ProfileManager.getActiveProfileId() ?? "1").trim() || "1";
}

function normalizeState(value = {}) {
  const lastSelectedListKey = String(value?.lastSelectedListKey || "").trim();
  const phoneLayoutMode = String(value?.phoneLayoutMode || "").trim();
  return {
    lastSelectedListKey: lastSelectedListKey || null,
    // Phone-only (mobile-parity ticket 03-02): whether the Saved-mode phone library grid
    // renders as per-type horizontal shelves ("horizontal") or a single scrolling poster
    // grid ("vertical"). Unrelated to any TV layout preference.
    phoneLayoutMode: phoneLayoutMode === "vertical" ? "vertical" : "horizontal"
  };
}

function readAll() {
  const value = LocalStore.get(KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const LibraryPreferencesStore = {
  getLastSelectedListKey(profileId = null) {
    return normalizeState(readAll()[normalizeProfileId(profileId)]).lastSelectedListKey;
  },

  setLastSelectedListKey(listKey, profileId = null) {
    const normalizedListKey = String(listKey || "").trim();
    if (!normalizedListKey) {
      return;
    }
    const normalizedProfileId = normalizeProfileId(profileId);
    const all = readAll();
    all[normalizedProfileId] = normalizeState({
      ...all[normalizedProfileId],
      lastSelectedListKey: normalizedListKey
    });
    LocalStore.set(KEY, all);
  },

  getPhoneLayoutMode(profileId = null) {
    return normalizeState(readAll()[normalizeProfileId(profileId)]).phoneLayoutMode;
  },

  setPhoneLayoutMode(mode, profileId = null) {
    const normalizedProfileId = normalizeProfileId(profileId);
    const all = readAll();
    all[normalizedProfileId] = normalizeState({
      ...all[normalizedProfileId],
      phoneLayoutMode: mode === "vertical" ? "vertical" : "horizontal"
    });
    LocalStore.set(KEY, all);
  }
};
