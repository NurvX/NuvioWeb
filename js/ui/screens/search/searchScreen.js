import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { catalogRepository } from "../../../data/repository/catalogRepository.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { I18n } from "../../../i18n/index.js";
import { buildWatchedTitleIdSet, isTitleItemWatched } from "../../components/watchedTitleBadge.js";
import { buildSearchTargets } from "./searchCatalogTargets.js";
import { getSidebarProfileState } from "../../components/sidebarNavigation.js";
import { renderPosterCard } from "../../components/posterCard.js";
import { renderPhoneShelf } from "../../components/phoneShelf.js";
import { renderPhoneNavBar, bindPhoneNavBarEvents } from "../../components/phoneNavBar.js";
import { renderSkeletonShelf, renderSkeletonPosterCard } from "../../components/phoneSkeleton.js";
import { openBottomSheet } from "../../components/bottomSheet.js";
import { SearchHistoryStore } from "../../../data/local/searchHistoryStore.js";

const SEARCH_RESULTS_PER_ROW_DEFAULT = 18;
const SEARCH_RESULTS_PER_ROW_CONSTRAINED = 12;
const SEARCH_CATALOG_BATCH_SIZE_CONSTRAINED = 3;
const SEARCH_CATALOG_TIMEOUT_MS_DEFAULT = 3500;
const SEARCH_CATALOG_TIMEOUT_MS_CONSTRAINED = 6500;
const SEARCH_DEBOUNCE_MS = 350;
const DISCOVER_PAGE_SKIP_STEP = 100;
const DISCOVER_SCROLL_LOAD_THRESHOLD_PX = 640;
const DISCOVER_INITIAL_SKELETON_COUNT = 9;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeSelectorValue(value = "") {
  const raw = String(value ?? "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, "\\$&");
}

function toTitleCase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function formatTypeLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "Movie";
  if (normalized === "tv") return "TV";
  return toTitleCase(normalized) || "Movie";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCatalogRowTitle(catalogName, addonName, type, showTypeSuffix = true) {
  const typeLabel = formatTypeLabel(type);
  let base = String(catalogName || "").trim();
  if (!base) return typeLabel;
  const addon = String(addonName || "").trim();
  const cleanedAddon = addon.replace(/\baddon\b/i, "").trim();
  [addon, cleanedAddon, "The Movie Database Addon", "TMDB Addon", "Addon"]
    .filter(Boolean)
    .forEach((term) => {
      const regex = new RegExp(`\\s*-?\\s*${escapeRegExp(term)}\\s*`, "ig");
      base = base.replace(regex, " ");
    });
  base = base.replace(/\s{2,}/g, " ").trim();
  if (!base) return typeLabel;
  if (!showTypeSuffix) return base;
  const endsWithType = new RegExp(`\\b${escapeRegExp(typeLabel)}$`, "i").test(base);
  return endsWithType ? base : `${base} - ${typeLabel}`;
}

function isSearchableCatalogType(type) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "movie" ||
    normalized === "series" ||
    normalized === "tv" ||
    normalized === "anime"
  );
}

function isPerformanceConstrainedRuntime() {
  return Boolean(globalThis.document?.body?.classList?.contains("performance-constrained"));
}

function getSearchResultsPerRow() {
  return isPerformanceConstrainedRuntime()
    ? SEARCH_RESULTS_PER_ROW_CONSTRAINED
    : SEARCH_RESULTS_PER_ROW_DEFAULT;
}

function getSearchCatalogBatchSize() {
  return isPerformanceConstrainedRuntime() ? SEARCH_CATALOG_BATCH_SIZE_CONSTRAINED : 0;
}

function getSearchCatalogTimeoutMs() {
  return isPerformanceConstrainedRuntime()
    ? SEARCH_CATALOG_TIMEOUT_MS_CONSTRAINED
    : SEARCH_CATALOG_TIMEOUT_MS_DEFAULT;
}

async function withTimeout(promise, ms, fallbackValue, onTimeout = null) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          if (typeof onTimeout === "function") onTimeout();
          resolve(fallbackValue);
        }, ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function checkmarkIconMarkup() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>`;
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// ---------------------------------------------------------------------------
// Phone search state
// ---------------------------------------------------------------------------

function createDiscoverState() {
  return {
    catalogsLoaded: false,
    catalogsLoading: false,
    hasAddons: true,
    catalogs: [],
    typeOptions: [],
    selectedType: "",
    catalogOptions: [],
    selectedCatalogKey: "",
    genreOptions: ["Default"],
    selectedGenre: "Default",
    items: [],
    itemsById: new Map(),
    nextSkip: 0,
    hasMore: true,
    itemsLoading: false,
    itemsError: false,
    version: 0
  };
}

function ensurePhoneSearchState(screen) {
  if (screen.phoneSearchStateToken === screen.loadToken) {
    return;
  }
  clearPhoneSearchDebounce(screen);
  screen.phoneSearchStateToken = screen.loadToken;
  screen.phoneSearchQuery = "";
  screen.phoneSearchStatus = "idle";
  screen.phoneSearchRows = [];
  screen.phoneSearchItemsById = new Map();
  screen.phoneSearchToken = 0;
  screen.phoneRecentTerms = SearchHistoryStore.getRecent();
  screen.phoneDiscover = createDiscoverState();
  screen._phoneSearchFreshMount = true;
}

function clearPhoneSearchDebounce(screen) {
  if (screen.phoneSearchDebounceTimer) {
    clearTimeout(screen.phoneSearchDebounceTimer);
    screen.phoneSearchDebounceTimer = null;
  }
}

function isSessionCurrent(screen, sessionToken) {
  return screen.phoneSearchStateToken === sessionToken;
}

// ---------------------------------------------------------------------------
// Typed-query search
// ---------------------------------------------------------------------------

function detailNavParams(item = {}) {
  return {
    itemId: item.id,
    itemType: item.type || item.__catalogType || "movie",
    fallbackTitle: item.name || item.title || item.id || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || item.backdrop || "",
    addonBaseUrl: item.__addonBaseUrl || item.addonBaseUrl || "",
    addonId: item.__addonId || item.addonId || "",
    addonName: item.__addonName || item.addonName || "",
    catalogType: item.__catalogType || item.catalogType || item.type || "movie"
  };
}

function buildSearchItemsById(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    (row.items || []).forEach((item) => {
      if (!item?.id) return;
      map.set(String(item.id), {
        ...item,
        __addonBaseUrl: row.addonBaseUrl,
        __addonId: row.addonId,
        __addonName: row.addonName,
        __catalogType: row.type
      });
    });
  });
  return map;
}

async function commitPhoneSearch(screen, rawValue, { recordHistory = false } = {}) {
  const sessionToken = screen.phoneSearchStateToken;
  const trimmed = String(rawValue || "").trim();
  screen.phoneSearchQuery = trimmed;

  if (recordHistory && trimmed.length >= 2) {
    screen.phoneRecentTerms = SearchHistoryStore.addTerm(trimmed);
    const input = screen.container?.querySelector("[data-phone-search-input]");
    if (input && input.value !== trimmed) {
      input.value = trimmed;
      syncClearButtonVisibility(screen.container, trimmed);
    }
  }

  if (trimmed.length < 2) {
    screen.phoneSearchStatus = "idle";
    screen.phoneSearchRows = [];
    screen.phoneSearchItemsById = new Map();
    refreshPhoneSearchBody(screen);
    return;
  }

  if (isOffline()) {
    screen.phoneSearchStatus = "offline";
    refreshPhoneSearchBody(screen);
    return;
  }

  screen.phoneSearchStatus = "loading";
  const commitToken = (screen.phoneSearchToken = (screen.phoneSearchToken || 0) + 1);
  refreshPhoneSearchBody(screen);

  const isStale = () =>
    !isSessionCurrent(screen, sessionToken) || screen.phoneSearchToken !== commitToken;

  let addons = [];
  try {
    addons = await addonRepository.getInstalledAddons();
  } catch (err) {
    console.warn("searchScreen: failed to load addons", err);
  }
  if (isStale()) return;

  if (!addons.length) {
    screen.phoneSearchStatus = "no_addons";
    screen.phoneSearchRows = [];
    refreshPhoneSearchBody(screen);
    return;
  }
  if (!buildSearchTargets(addons).length) {
    screen.phoneSearchStatus = "no_catalogs";
    screen.phoneSearchRows = [];
    refreshPhoneSearchBody(screen);
    return;
  }

  let rows = [];
  let failed = false;
  try {
    rows = await screen.searchRows(trimmed);
  } catch (err) {
    console.warn("searchScreen: search failed", err);
    failed = true;
  }
  if (isStale()) return;

  screen.phoneSearchRows = rows;
  screen.phoneSearchItemsById = buildSearchItemsById(rows);
  screen.phoneSearchStatus = failed ? "error" : rows.length ? "results" : "no_results";
  refreshPhoneSearchBody(screen);
}

function scheduleDebouncedPhoneSearch(screen, rawValue) {
  clearPhoneSearchDebounce(screen);
  screen.phoneSearchDebounceTimer = setTimeout(() => {
    screen.phoneSearchDebounceTimer = null;
    void commitPhoneSearch(screen, rawValue, { recordHistory: false });
  }, SEARCH_DEBOUNCE_MS);
}

function clearPhoneSearchQuery(screen) {
  clearPhoneSearchDebounce(screen);
  const input = screen.container?.querySelector("[data-phone-search-input]");
  if (input) {
    input.value = "";
    input.focus?.();
  }
  syncClearButtonVisibility(screen.container, "");
  screen.phoneSearchQuery = "";
  screen.phoneSearchStatus = "idle";
  screen.phoneSearchRows = [];
  screen.phoneSearchItemsById = new Map();
  refreshPhoneSearchBody(screen);
}

function removeRecentTerm(screen, term) {
  screen.phoneRecentTerms = SearchHistoryStore.removeTerm(term);
  const row = screen.container?.querySelector(
    `[data-phone-recent-row][data-term="${escapeSelectorValue(term)}"]`
  );
  row?.remove();
  const list = screen.container?.querySelector("[data-phone-recent-list]");
  if (list && !list.children.length) {
    screen.container?.querySelector("[data-phone-recent-section]")?.remove();
  }
}

// ---------------------------------------------------------------------------
// Empty-query Discover grid
// ---------------------------------------------------------------------------

function isSearchOnlyCatalog(catalog = {}) {
  return (
    Array.isArray(catalog.extra) &&
    catalog.extra.some(
      (extra) =>
        String(extra?.name || "")
          .trim()
          .toLowerCase() === "search" && Boolean(extra?.isRequired)
    )
  );
}

function updateDiscoverGenreOptions(state) {
  const selected = state.catalogOptions.find((entry) => entry.key === state.selectedCatalogKey);
  const genreExtra = (selected?.extra || []).find((extra) => extra?.name === "genre");
  const genres = Array.isArray(genreExtra?.options) ? genreExtra.options.filter(Boolean) : [];
  state.genreOptions = ["Default", ...genres];
  if (!state.genreOptions.includes(state.selectedGenre)) {
    state.selectedGenre = "Default";
  }
}

function updateDiscoverCatalogOptions(state) {
  state.catalogOptions = state.catalogs.filter((entry) => entry.type === state.selectedType);
  if (!state.catalogOptions.some((entry) => entry.key === state.selectedCatalogKey)) {
    state.selectedCatalogKey = state.catalogOptions[0]?.key || "";
  }
  updateDiscoverGenreOptions(state);
}

function getSelectedDiscoverCatalog(state) {
  return state.catalogOptions.find((entry) => entry.key === state.selectedCatalogKey) || null;
}

async function ensureDiscoverCatalogsLoaded(screen, sessionToken) {
  const state = screen.phoneDiscover;
  state.catalogsLoading = true;
  try {
    const addons = await addonRepository.getInstalledAddons();
    if (!isSessionCurrent(screen, sessionToken)) return;
    const catalogs = [];
    (addons || []).forEach((addon) => {
      (addon.catalogs || []).forEach((catalog) => {
        if (isSearchOnlyCatalog(catalog)) return;
        const type = String(catalog.apiType || "").trim();
        if (!type) return;
        catalogs.push({
          key: `${addon.baseUrl}::${type}::${catalog.id}`,
          addonBaseUrl: addon.baseUrl,
          addonId: addon.id,
          addonName: addon.displayName || addon.name,
          catalogId: catalog.id,
          catalogName: catalog.name || catalog.id,
          type,
          extra: Array.isArray(catalog.extra) ? catalog.extra : []
        });
      });
    });
    state.hasAddons = Array.isArray(addons) && addons.length > 0;
    state.catalogs = catalogs;
    state.typeOptions = [...new Set(catalogs.map((entry) => entry.type))];
    state.selectedType = state.typeOptions[0] || "";
    updateDiscoverCatalogOptions(state);
  } catch (err) {
    console.warn("searchScreen: failed to load discover catalogs", err);
    state.hasAddons = false;
  } finally {
    state.catalogsLoading = false;
    state.catalogsLoaded = true;
  }
}

async function loadDiscoverItemsPage(screen, sessionToken, { reset = false } = {}) {
  const state = screen.phoneDiscover;
  if (!reset && (state.itemsLoading || !state.hasMore)) {
    return [];
  }
  const catalog = getSelectedDiscoverCatalog(state);
  if (!catalog) {
    if (reset) {
      state.items = [];
      state.itemsById = new Map();
    }
    state.hasMore = false;
    return [];
  }
  if (reset) {
    state.items = [];
    state.itemsById = new Map();
    state.nextSkip = 0;
    state.hasMore = true;
    state.itemsError = false;
    state.version = (state.version || 0) + 1;
  }
  const loadVersion = state.version;
  const isStale = () => !isSessionCurrent(screen, sessionToken) || state.version !== loadVersion;
  state.itemsLoading = true;
  const extraArgs = {};
  if (state.selectedGenre && state.selectedGenre !== "Default") {
    extraArgs.genre = state.selectedGenre;
  }
  try {
    const result = await catalogRepository.getCatalog({
      addonBaseUrl: catalog.addonBaseUrl,
      addonId: catalog.addonId,
      addonName: catalog.addonName,
      catalogId: catalog.catalogId,
      catalogName: catalog.catalogName,
      type: catalog.type,
      skip: Math.max(0, Number(state.nextSkip || 0)),
      extraArgs,
      supportsSkip: true
    });
    if (isStale()) return [];
    if (result?.status !== "success") {
      state.hasMore = false;
      if (!state.items.length) state.itemsError = true;
      return [];
    }
    const incoming = Array.isArray(result?.data?.items) ? result.data.items : [];
    const added = [];
    incoming.forEach((item) => {
      if (!item?.id || state.itemsById.has(String(item.id))) return;
      const enriched = {
        ...item,
        __addonBaseUrl: catalog.addonBaseUrl,
        __addonId: catalog.addonId,
        __addonName: catalog.addonName,
        __catalogType: catalog.type
      };
      state.items.push(enriched);
      state.itemsById.set(String(item.id), enriched);
      added.push(enriched);
    });
    state.nextSkip = Math.max(0, Number(state.nextSkip || 0)) + DISCOVER_PAGE_SKIP_STEP;
    state.hasMore = incoming.length > 0;
    return added;
  } catch (err) {
    console.warn("searchScreen: failed to load discover items", err);
    if (isStale()) return [];
    state.hasMore = false;
    if (!state.items.length) state.itemsError = true;
    return [];
  } finally {
    if (!isStale()) {
      state.itemsLoading = false;
    }
  }
}

async function ensureDiscoverLoaded(screen) {
  const sessionToken = screen.phoneSearchStateToken;
  const state = screen.phoneDiscover;
  if (!state || state.catalogsLoaded || state.catalogsLoading) {
    return;
  }
  await ensureDiscoverCatalogsLoaded(screen, sessionToken);
  if (!isSessionCurrent(screen, sessionToken)) return;
  if (screen.phoneDiscover.hasAddons && getSelectedDiscoverCatalog(screen.phoneDiscover)) {
    refreshPhoneSearchBody(screen);
    await loadDiscoverItemsPage(screen, sessionToken, { reset: true });
    if (!isSessionCurrent(screen, sessionToken)) return;
  }
  refreshPhoneSearchBody(screen);
}

function getDiscoverFilterOptions(state, kind) {
  if (kind === "type") {
    return state.typeOptions.map((value) => ({ value, label: formatTypeLabel(value) }));
  }
  if (kind === "catalog") {
    return state.catalogOptions.map((entry) => ({
      value: entry.key,
      label: entry.catalogName || "Select"
    }));
  }
  if (kind === "genre") {
    return state.genreOptions.map((value) => ({ value, label: value }));
  }
  return [];
}

function getDiscoverFilterValue(state, kind) {
  if (kind === "type") return state.selectedType;
  if (kind === "catalog") return state.selectedCatalogKey;
  if (kind === "genre") return state.selectedGenre;
  return "";
}

function applyDiscoverFilterChange(screen, kind, value) {
  const sessionToken = screen.phoneSearchStateToken;
  const state = screen.phoneDiscover;
  if (!state || !value) return;

  let changed = true;
  if (kind === "type") {
    if (value === state.selectedType) return;
    state.selectedType = value;
    updateDiscoverCatalogOptions(state);
  } else if (kind === "catalog") {
    if (value === state.selectedCatalogKey) return;
    state.selectedCatalogKey = value;
    updateDiscoverGenreOptions(state);
  } else if (kind === "genre") {
    if (value === state.selectedGenre) return;
    state.selectedGenre = value;
  } else {
    changed = false;
  }
  if (!changed) return;

  state.items = [];
  state.itemsById = new Map();
  state.nextSkip = 0;
  state.hasMore = true;
  state.itemsError = false;
  state.itemsLoading = true;
  refreshPhoneSearchBody(screen);
  void loadDiscoverItemsPage(screen, sessionToken, { reset: true }).then(() => {
    if (isSessionCurrent(screen, sessionToken)) {
      refreshPhoneSearchBody(screen);
    }
  });
}

function openDiscoverFilterSheet(screen, kind) {
  const state = screen.phoneDiscover;
  if (!state) return;
  const options = getDiscoverFilterOptions(state, kind);
  if (!options.length) return;
  const currentValue = getDiscoverFilterValue(state, kind);
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.value === currentValue ? checkmarkIconMarkup() : "",
      onSelect: () => applyDiscoverFilterChange(screen, kind, option.value)
    }))
  });
}

async function handleDiscoverScrollNearBottom(screen) {
  const sessionToken = screen.phoneSearchStateToken;
  const state = screen.phoneDiscover;
  if (!state || state.itemsLoading || !state.hasMore) return;
  const added = await loadDiscoverItemsPage(screen, sessionToken, { reset: false });
  if (!isSessionCurrent(screen, sessionToken) || !added.length) return;
  appendDiscoverGridItems(screen, added);
}

function appendDiscoverGridItems(screen, addedItems) {
  const grid = screen.container?.querySelector("[data-phone-search-discover-grid]");
  if (!grid) return;
  const markup = addedItems.map((item) => renderPosterCard(toPosterItem(screen, item))).join("");
  grid.insertAdjacentHTML("beforeend", markup);
}

// ---------------------------------------------------------------------------
// Tap dispatch
// ---------------------------------------------------------------------------

function findPhoneSearchItem(screen, id) {
  return screen.phoneSearchItemsById?.get(id) || screen.phoneDiscover?.itemsById?.get(id) || null;
}

function handlePhonePointerActivate(screen, target) {
  const action = String(target?.dataset?.action || "");
  if (!action) return false;

  if (action === "phoneSearchClear") {
    clearPhoneSearchQuery(screen);
    return true;
  }
  if (action === "phoneSearchRecentTerm") {
    const term = String(target.dataset.term || "");
    if (!term) return false;
    void commitPhoneSearch(screen, term, { recordHistory: true });
    return true;
  }
  if (action === "phoneSearchRecentRemove") {
    removeRecentTerm(screen, String(target.dataset.term || ""));
    return true;
  }
  if (action === "phoneSearchFilter") {
    openDiscoverFilterSheet(screen, String(target.dataset.filterKind || ""));
    return true;
  }
  if (action === "openDetail") {
    const item = findPhoneSearchItem(screen, String(target.dataset.id || ""));
    if (!item) return false;
    Router.navigate("detail", detailNavParams(item));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

function toPosterItem(screen, item) {
  return {
    id: String(item.id || ""),
    posterUrl: item.poster || item.landscapePoster || "",
    title: item.name || item.title || "",
    watched: isTitleItemWatched(item, screen.watchedTitleIds)
  };
}

function renderEmptyStateCard({ title = "", message = "" } = {}) {
  return `
    <div class="phone-search-empty-state">
      <h3 class="phone-search-empty-title">${escapeHtml(title)}</h3>
      ${message ? `<p class="phone-search-empty-message">${escapeHtml(message)}</p>` : ""}
    </div>
  `;
}

function renderResultsShelves(screen) {
  const rows = Array.isArray(screen.phoneSearchRows) ? screen.phoneSearchRows : [];
  return rows
    .map((row, index) =>
      renderPhoneShelf({
        id: `search_${row.addonId || "addon"}_${row.catalogId || "catalog"}_${index}`,
        title: row.title,
        items: (row.items || []).map((item) => toPosterItem(screen, item))
      })
    )
    .join("");
}

function renderResultsBody(screen) {
  const status = screen.phoneSearchStatus;
  if (status === "loading") {
    return `<div class="phone-search-results-shelves">${renderSkeletonShelf({ count: 4 })}${renderSkeletonShelf({ count: 4 })}${renderSkeletonShelf({ count: 4 })}</div>`;
  }
  if (status === "offline") {
    return renderEmptyStateCard({
      title: t("phone_search_offline_title", {}, "You're offline"),
      message: t("phone_search_offline_message", {}, "Check your connection and try again.")
    });
  }
  if (status === "no_addons") {
    return renderEmptyStateCard({
      title: t("phone_search_no_addons_title", {}, "No addons installed"),
      message: t("phone_search_no_addons_message", {}, "Install an addon to start searching.")
    });
  }
  if (status === "no_catalogs") {
    return renderEmptyStateCard({
      title: t("phone_search_no_catalogs_title", {}, "Search isn't available"),
      message: t(
        "phone_search_no_catalogs_message",
        {},
        "None of your installed addons support search."
      )
    });
  }
  if (status === "error") {
    return renderEmptyStateCard({
      title: t("phone_search_error_title", {}, "Something went wrong"),
      message: t("phone_search_error_message", {}, "Your search couldn't be completed. Try again.")
    });
  }
  if (status === "no_results") {
    return renderEmptyStateCard({
      title: t("search_no_results_title", {}, "No Results"),
      message: t("search_no_results_subtitle", {}, "Try searching with different keywords")
    });
  }
  return `<div class="phone-search-results-shelves">${renderResultsShelves(screen)}</div>`;
}

function renderRecentRow(term) {
  const safeTerm = escapeHtml(term);
  return `
    <div class="phone-search-recent-row focusable" data-phone-recent-row data-action="phoneSearchRecentTerm" data-term="${safeTerm}">
      <svg class="phone-search-recent-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 8v5l3 3M12 3a9 9 0 1 0 9 9"/></svg>
      <span class="phone-search-recent-term">${safeTerm}</span>
      <button
        type="button"
        class="phone-search-recent-remove focusable"
        data-action="phoneSearchRecentRemove"
        data-term="${safeTerm}"
        aria-label="${escapeHtml(t("action_remove", {}, "Remove"))}"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 10.6 6.7 5.3 5.3 6.7l5.3 5.3-5.3 5.3 1.4 1.4 5.3-5.3 5.3 5.3 1.4-1.4-5.3-5.3 5.3-5.3-1.4-1.4z"/></svg>
      </button>
    </div>
  `;
}

function renderRecentSearchesSection(screen) {
  const terms = Array.isArray(screen.phoneRecentTerms) ? screen.phoneRecentTerms : [];
  if (!terms.length) return "";
  return `
    <section class="phone-search-recent" data-phone-recent-section>
      <div class="phone-search-section-header">
        <h2 class="phone-search-section-title">${escapeHtml(t("phone_search_recent_title", {}, "Recent Searches"))}</h2>
      </div>
      <div class="phone-search-recent-list" data-phone-recent-list>
        ${terms.map((term) => renderRecentRow(term)).join("")}
      </div>
    </section>
  `;
}

function renderFilterChip(kind, label, value) {
  return `
    <button type="button" class="phone-search-filter-chip focusable" data-action="phoneSearchFilter" data-filter-kind="${kind}">
      <span class="phone-search-filter-chip-label">${escapeHtml(label)}</span>
      <span class="phone-search-filter-chip-value">${escapeHtml(value)}</span>
      <svg class="phone-search-filter-chip-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>
    </button>
  `;
}

function renderDiscoverFilters(state) {
  if (!state.catalogsLoaded || !state.hasAddons || !state.catalogOptions.length) {
    return "";
  }
  const selectedCatalog = getSelectedDiscoverCatalog(state);
  return `
    <div class="phone-search-filter-row" data-phone-filter-row>
      ${renderFilterChip("type", t("phone_search_filter_type", {}, "Type"), formatTypeLabel(state.selectedType))}
      ${renderFilterChip("catalog", t("phone_search_filter_catalog", {}, "Catalog"), selectedCatalog?.catalogName || t("phone_search_filter_select", {}, "Select"))}
      ${state.genreOptions.length > 1 ? renderFilterChip("genre", t("phone_search_filter_genre", {}, "Genre"), state.selectedGenre || "Default") : ""}
    </div>
  `;
}

function renderDiscoverSkeletonGrid() {
  const cards = Array.from({ length: DISCOVER_INITIAL_SKELETON_COUNT })
    .map(() => renderSkeletonPosterCard({ aspect: "portrait" }))
    .join("");
  return `<div class="phone-search-discover-grid">${cards}</div>`;
}

function renderDiscoverContent(screen, state) {
  if (state.catalogsLoading || !state.catalogsLoaded) {
    return renderDiscoverSkeletonGrid();
  }
  if (!state.hasAddons) {
    return renderEmptyStateCard({
      title: t("phone_search_no_addons_title", {}, "No addons installed"),
      message: t("phone_search_no_addons_message", {}, "Install an addon to start browsing.")
    });
  }
  if (!state.catalogOptions.length) {
    return renderEmptyStateCard({
      title: t("phone_search_no_catalogs_title", {}, "Nothing to browse"),
      message: t(
        "phone_search_no_browse_message",
        {},
        "None of your installed addons support browsing here."
      )
    });
  }
  if (state.itemsLoading && !state.items.length) {
    return renderDiscoverSkeletonGrid();
  }
  if (state.itemsError && !state.items.length) {
    return renderEmptyStateCard({
      title: t("phone_search_error_title", {}, "Something went wrong"),
      message: t("phone_search_error_message", {}, "Try again in a moment.")
    });
  }
  if (!state.items.length) {
    return renderEmptyStateCard({
      title: t("catalog_see_all_empty_title", {}, "No items available")
    });
  }
  return `
    <div class="phone-search-discover-grid" data-phone-search-discover-grid>
      ${state.items.map((item) => renderPosterCard(toPosterItem(screen, item))).join("")}
    </div>
  `;
}

function renderDiscoverSection(screen) {
  const state = screen.phoneDiscover;
  return `
    <section class="phone-search-discover" data-phone-discover-section>
      <div class="phone-search-section-header">
        <h2 class="phone-search-section-title">${escapeHtml(t("phone_search_discover_title", {}, "Discover"))}</h2>
      </div>
      ${renderDiscoverFilters(state)}
      ${renderDiscoverContent(screen, state)}
    </section>
  `;
}

function renderIdleBody(screen) {
  return `
    ${renderRecentSearchesSection(screen)}
    ${renderDiscoverSection(screen)}
  `;
}

function hasActivePhoneQuery(screen) {
  return String(screen.phoneSearchQuery || "").trim().length >= 2;
}

function renderBody(screen) {
  return hasActivePhoneQuery(screen) ? renderResultsBody(screen) : renderIdleBody(screen);
}

function renderSearchScreenPhone(screen) {
  ensurePhoneSearchState(screen);
  const query = screen.phoneSearchQuery || "";
  return `
    <div class="phone-search-scroll" data-phone-search-scroll>
      <header class="phone-search-header" data-phone-search-header>
        <h1 class="phone-search-title" data-phone-search-title>${escapeHtml(t("search_title", {}, "Search"))}</h1>
        <div class="phone-search-input-wrap${query.trim() ? " has-value" : ""}" data-phone-search-input-wrap>
          <svg class="phone-search-input-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/></svg>
          <input
            type="text"
            class="phone-search-input"
            data-phone-search-input
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            placeholder="${escapeHtml(t("search_placeholder", {}, "Search movies & series"))}"
            value="${escapeHtml(query)}"
          />
          <button
            type="button"
            class="phone-search-clear-btn focusable"
            data-action="phoneSearchClear"
            aria-label="${escapeHtml(t("action_clear", {}, "Clear"))}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 10.6 6.7 5.3 5.3 6.7l5.3 5.3-5.3 5.3 1.4 1.4 5.3-5.3 5.3 5.3 1.4-1.4-5.3-5.3 5.3-5.3-1.4-1.4z"/></svg>
          </button>
        </div>
      </header>
      <div class="phone-search-body" data-phone-search-body>
        ${renderBody(screen)}
      </div>
    </div>
    ${renderPhoneNavBar({ selectedRoute: "search", profileState: screen.sidebarProfile })}
  `;
}

// ---------------------------------------------------------------------------
// Mount / patch / cleanup
// ---------------------------------------------------------------------------

function syncClearButtonVisibility(container, value) {
  container
    ?.querySelector("[data-phone-search-input-wrap]")
    ?.classList.toggle("has-value", String(value || "").trim().length > 0);
}

function refreshPhoneSearchBody(screen) {
  const bodyNode = screen.container?.querySelector("[data-phone-search-body]");
  if (!bodyNode) {
    return;
  }
  bodyNode.innerHTML = renderBody(screen);
}

function updateHeaderChrome(screen, container, scrollTop) {
  const titleNode = container.querySelector("[data-phone-search-title]");
  const header = container.querySelector("[data-phone-search-header]");
  if (!titleNode || !header) return;
  const scrolled = scrollTop > 8;
  const label =
    !hasActivePhoneQuery(screen) && scrolled
      ? t("phone_search_discover_title", {}, "Discover")
      : t("search_title", {}, "Search");
  if (titleNode.textContent !== label) {
    titleNode.textContent = label;
  }
  header.classList.toggle("scrolled", scrolled);
}

function handlePhoneSearchScroll(screen, container, scroller) {
  updateHeaderChrome(screen, container, scroller.scrollTop);
  if (hasActivePhoneQuery(screen)) {
    return;
  }
  const remaining = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
  if (remaining <= DISCOVER_SCROLL_LOAD_THRESHOLD_PX) {
    void handleDiscoverScrollNearBottom(screen);
  }
}

function mountPhoneInteractivity(screen, container) {
  teardownPhoneInteractivity(screen);

  const input = container.querySelector("[data-phone-search-input]");
  const handleInput = () => {
    if (!input) return;
    screen.phoneSearchQuery = input.value;
    syncClearButtonVisibility(container, input.value);
    scheduleDebouncedPhoneSearch(screen, input.value);
  };
  const handleKeydown = (event) => {
    if (event.key === "Enter" || Number(event.keyCode) === 13) {
      event.preventDefault?.();
      clearPhoneSearchDebounce(screen);
      void commitPhoneSearch(screen, input?.value || "", { recordHistory: true });
    }
  };
  input?.addEventListener("input", handleInput);
  input?.addEventListener("keydown", handleKeydown);

  const scroller = container.querySelector("[data-phone-search-scroll]");
  const handleScroll = () => {
    if (scroller) handlePhoneSearchScroll(screen, container, scroller);
  };
  scroller?.addEventListener("scroll", handleScroll, { passive: true });
  if (scroller) {
    updateHeaderChrome(screen, container, scroller.scrollTop);
  }

  const detachNavBar = bindPhoneNavBarEvents(container, {
    currentRoute: "search",
    scrollRoot: scroller
  });

  if (screen._phoneSearchFreshMount) {
    screen._phoneSearchFreshMount = false;
    requestAnimationFrame(() => {
      if (screen.container?.contains(input)) {
        input?.focus?.();
      }
    });
  }

  void ensureDiscoverLoaded(screen);

  const teardown = () => {
    input?.removeEventListener("input", handleInput);
    input?.removeEventListener("keydown", handleKeydown);
    scroller?.removeEventListener("scroll", handleScroll);
    detachNavBar();
  };
  screen._phoneSearchTeardown = teardown;
  return teardown;
}

function teardownPhoneInteractivity(screen) {
  clearPhoneSearchDebounce(screen);
  screen._phoneSearchTeardown?.();
  screen._phoneSearchTeardown = null;
}

// ---------------------------------------------------------------------------
// Screen object
// ---------------------------------------------------------------------------

export const SearchScreen = {
  cancelScheduledRender() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
  },

  requestRender() {
    if (!this.container || Router.getCurrent() !== "search") {
      return;
    }
    if (this.renderFrame) {
      return;
    }
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      if (!this.container || Router.getCurrent() !== "search") {
        return;
      }
      this.render();
    });
  },

  async refreshWatchedTitleIds() {
    const watchedItems = await watchedItemsRepository.getAll(5000).catch(() => []);
    this.watchedTitleIds = buildWatchedTitleIdSet(watchedItems);
  },

  async searchRows(query, { token = this.loadToken, onFirstResults = null } = {}) {
    const addons = await addonRepository.getInstalledAddons();
    const searchableCatalogs = buildSearchTargets(addons);
    const { buildSearchScheduleIndices, catalogSupportsExtra } =
      await import("./searchCatalogTargets.js");
    const scheduleIndices = buildSearchScheduleIndices(searchableCatalogs);
    const batchSize = getSearchCatalogBatchSize();
    const itemLimit = getSearchResultsPerRow();
    const responses = new Array(searchableCatalogs.length);
    let nextScheduleIndex = 0;
    let publishedFirstResults = false;
    const runCatalogSearch = async (catalog) => {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      try {
        const result = await withTimeout(
          catalogRepository.getCatalog({
            addonBaseUrl: catalog.addonBaseUrl,
            addonId: catalog.addonId,
            addonName: catalog.addonName,
            catalogId: catalog.catalogId,
            catalogName: catalog.catalogName,
            type: catalog.type,
            skip: 0,
            extraArgs: { search: query },
            supportsSkip: catalog.supportsSkip,
            signal: controller?.signal || null
          }),
          getSearchCatalogTimeoutMs(),
          { status: "error", message: "timeout" },
          () => controller?.abort()
        );
        return { catalog, result };
      } catch (err) {
        console.warn(`fail on search catalog ${catalog.catalogName}:`, err);
        return {
          catalog,
          result: { status: "error", message: "fetch_failed" }
        };
      }
    };

    const buildRows = () =>
      responses
        .filter(({ result } = {}) => result?.status === "success" && result?.data?.items?.length)
        .map(({ catalog, result }) => {
          const items = result?.data?.items || [];
          return {
            title: formatCatalogRowTitle(
              catalog.catalogName,
              catalog.addonName,
              catalog.type,
              this.layoutPrefs?.catalogTypeSuffixEnabled !== false
            ),
            subtitle:
              this.layoutPrefs?.catalogAddonNameEnabled !== false
                ? `from ${catalog.addonName || "Addon"}`
                : "",
            type: catalog.type,
            addonBaseUrl: catalog.addonBaseUrl,
            addonId: catalog.addonId,
            addonName: catalog.addonName,
            catalogId: catalog.catalogId,
            catalogName: catalog.catalogName,
            hasMore: Boolean(items.length > itemLimit || result?.data?.hasMore),
            items: items.slice(0, itemLimit)
          };
        });

    const publishFirstResults = () => {
      if (
        publishedFirstResults ||
        token !== this.loadToken ||
        typeof onFirstResults !== "function"
      ) {
        return;
      }
      const rows = buildRows();
      if (!rows.length) return;
      publishedFirstResults = true;
      onFirstResults(rows);
    };

    const runWorker = async () => {
      while (token === this.loadToken) {
        const index = scheduleIndices[nextScheduleIndex];
        nextScheduleIndex += 1;
        if (typeof index !== "number") return;
        responses[index] = await runCatalogSearch(searchableCatalogs[index]);
        publishFirstResults();
      }
    };
    const workerCount = Math.min(
      batchSize > 0 ? batchSize : searchableCatalogs.length,
      searchableCatalogs.length
    );
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return buildRows();
  },

  async mount() {
    this.container = document.getElementById("search");
    ScreenUtils.show(this.container);
    this.layoutPrefs = LayoutPreferences.get();
    try {
      this.sidebarProfile = await getSidebarProfileState();
    } catch (err) {
      console.warn("debug: fail on load", err);
      this.sidebarProfile = null;
    }
    this.loadToken = (this.loadToken || 0) + 1;
    await this.refreshWatchedTitleIds();
    this.render();
  },

  render() {
    if (!this.container) {
      return;
    }
    this.cancelScheduledRender();
    this.container.innerHTML = renderSearchScreenPhone(this);
    mountPhoneInteractivity(this, this.container);
  },

  onPointerActivate(target) {
    return handlePhonePointerActivate(this, target);
  },

  consumeBackRequest() {
    return false;
  },

  cleanup() {
    teardownPhoneInteractivity(this);
    this.cancelScheduledRender();
    ScreenUtils.hide(this.container);
  }
};
