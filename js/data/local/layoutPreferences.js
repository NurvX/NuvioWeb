import { createProfileScopedStore } from "./profileScopedStore.js";
import { LocalStore } from "../../core/storage/localStore.js";

const KEY = "layoutPreferences";

const DEFAULTS = {
  hasChosenLayout: false,
  homeLayout: "modern",
  heroSectionEnabled: true,
  heroCatalogKeys: [],
  posterLabelsEnabled: true,
  catalogAddonNameEnabled: true,
  catalogTypeSuffixEnabled: true,
  fastHorizontalNavigationEnabled: false,
  preferExternalMetaAddonDetail: true,
  showUnairedNextUp: true,
  nextUpFromFurthestEpisode: true,
  continueWatchingSortMode: "default"
};

function normalizeContinueWatchingSortMode(value) {
  const normalized = String(value || "default")
    .trim()
    .toLowerCase();
  if (
    normalized === "split_upcoming" ||
    normalized === "split-upcoming" ||
    normalized === "splitupcoming"
  ) {
    return "split_upcoming";
  }
  return normalized === "streaming_style" ||
    normalized === "streaming-style" ||
    normalized === "streamingstyle"
    ? "streaming_style"
    : "default";
}

function normalizeLayoutPreferences(value = {}) {
  const merged = {
    ...DEFAULTS,
    ...(value || {})
  };

  return {
    ...merged,
    hasChosenLayout:
      typeof value?.hasChosenLayout === "boolean"
        ? value.hasChosenLayout
        : Object.keys(value || {}).length > 0,
    heroCatalogKeys: [
      ...new Set(
        (Array.isArray(merged.heroCatalogKeys) ? merged.heroCatalogKeys : [])
          .map(String)
          .filter(Boolean)
      )
    ],
    fastHorizontalNavigationEnabled: Boolean(
      value?.fastHorizontalNavigationEnabled ??
      LocalStore.get("fastHorizontalNavigationEnabled", false)
    ),
    preferExternalMetaAddonDetail: merged.preferExternalMetaAddonDetail !== false,
    showUnairedNextUp: merged.showUnairedNextUp !== false,
    nextUpFromFurthestEpisode: merged.nextUpFromFurthestEpisode !== false,
    continueWatchingSortMode: normalizeContinueWatchingSortMode(merged.continueWatchingSortMode)
  };
}

const store = createProfileScopedStore({
  key: KEY,
  normalize: normalizeLayoutPreferences
});

export const LayoutPreferences = {
  getForProfile(profileId) {
    return store.getForProfile(profileId);
  },

  get() {
    return store.get();
  },

  replaceForProfile(profileId, nextValue, options = {}) {
    return store.replaceForProfile(profileId, nextValue, options);
  },

  setForProfile(profileId, partial, options = {}) {
    return store.setForProfile(profileId, partial, options);
  },

  set(partial, options = {}) {
    return store.set(partial, options);
  }
};
