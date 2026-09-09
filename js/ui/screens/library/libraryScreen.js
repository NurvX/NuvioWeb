import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { I18n } from "../../../i18n/index.js";
import { LibraryController, LIBRARY_VIEW_MODE } from "./libraryController.js";
import {
  createPosterOptionsState,
  getPosterOptions,
  activatePosterOption,
  getPosterListPickerOptions
} from "../../components/posterOptionsMenu.js";
import { getSidebarProfileState } from "../../components/sidebarNavigation.js";
import { renderPhoneShelf, defaultPhoneShelfViewAllLabel } from "../../components/phoneShelf.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import {
  shouldWindow,
  computeWindow,
  renderWindowedGrid,
  measureGrid
} from "../../components/virtualPosterGrid.js";
import { renderPhoneNavBar, bindPhoneNavBarEvents } from "../../components/phoneNavBar.js";
import { renderSkeletonShelf } from "../../components/phoneSkeleton.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
import {
  libraryRepository,
  LibrarySourceMode
} from "../../../data/repository/libraryRepository.js";
import { LibraryPreferencesStore } from "../../../data/local/libraryPreferencesStore.js";

const REMOVE_ANIMATION_MS = 350;

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

function checkmarkIconMarkup() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>`;
}

function backIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>`;
}

function playIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
}

function gridLayoutIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>`;
}

function shelfLayoutIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 5h16v3H4zM4 11h16v3H4zM4 17h16v3H4z"/></svg>`;
}

function clearIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 10.6 6.7 5.3 5.3 6.7l5.3 5.3-5.3 5.3 1.4 1.4 5.3-5.3 5.3 5.3 1.4-1.4-5.3-5.3 5.3-5.3-1.4-1.4z"/></svg>`;
}

function searchIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/></svg>`;
}

// ---------------------------------------------------------------------------
// Screen-singleton state
// ---------------------------------------------------------------------------

function ensurePhoneLibraryState(screen) {
  if (screen.phoneLibraryStateController === screen.controller) {
    return;
  }
  screen.phoneLibraryStateController = screen.controller;
  screen.phoneLibraryLayoutMode = LibraryPreferencesStore.getPhoneLayoutMode();
  screen.phoneLibraryCloudSearchQuery = "";
}

function setPhoneLibraryLayoutMode(screen, mode) {
  const normalized = mode === "vertical" ? "vertical" : "horizontal";
  if (screen.phoneLibraryLayoutMode === normalized) {
    return;
  }
  screen.phoneLibraryLayoutMode = normalized;
  LibraryPreferencesStore.setPhoneLayoutMode(normalized);
}

// ---------------------------------------------------------------------------
// Saved-mode: item shaping, grouping, navigation
// ---------------------------------------------------------------------------

function itemKey(item) {
  return `${item.type || "movie"}:${item.id}`;
}

function detailNavParams(item) {
  return {
    itemId: item.id,
    itemType: item.type || "movie",
    fallbackTitle: item.name || item.id || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || "",
    addonBaseUrl: item.addonBaseUrl || ""
  };
}

function navigateToSavedItem(item) {
  if (!item?.id) {
    return;
  }
  Router.navigate("detail", detailNavParams(item));
}

function savedPosterItem(screen, item) {
  const state = screen.controller.getState();
  return {
    id: itemKey(item),
    posterUrl: item.poster || "",
    title: item.name || item.id || "Untitled",
    watched: state.watchedTitleIds?.has?.(String(item.id)) || false
  };
}

function findSavedItem(screen, key) {
  const state = screen.controller.getState();
  return state.visibleItems.find((entry) => itemKey(entry) === key) || null;
}

function groupItemsByType(items = []) {
  const order = [];
  const byType = new Map();
  items.forEach((item) => {
    const type = String(item.type || "movie").trim() || "movie";
    if (!byType.has(type)) {
      byType.set(type, []);
      order.push(type);
    }
    byType.get(type).push(item);
  });
  return order.map((type) => ({ type, items: byType.get(type) }));
}

function typeShelfTitle(state, type) {
  const tab = state.availableTypeTabs.find((entry) => entry.key === String(type).toLowerCase());
  return tab ? tab.label.replace(/\s+\(\d+\)$/, "") : type;
}

// ---------------------------------------------------------------------------
// Saved-mode: poster long-press menu
// ---------------------------------------------------------------------------

function collapseCardAndReload(screen, cardElement) {
  const posterNode = cardElement?.closest(".phone-poster") || null;
  if (!posterNode) {
    return screen.controller.reload({ preserveOverlay: true });
  }
  posterNode.classList.add("phone-poster-removing");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      screen.controller.reload({ preserveOverlay: true }).finally(resolve);
    }, REMOVE_ANIMATION_MS);
  });
}

async function refreshAfterWatchedToggle(screen) {
  await screen.controller.reload({ preserveOverlay: true });
}

function openLibraryListPickerSheet(screen, cardElement, listPickerState) {
  const options = getPosterListPickerOptions(listPickerState);
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.selected ? checkmarkIconMarkup() : "",
      onSelect: () =>
        void handleLibraryListPickerOption(screen, cardElement, listPickerState, option.action)
    }))
  });
}

async function handleLibraryListPickerOption(screen, cardElement, listPickerState, action) {
  const normalizedAction = String(action || "");
  if (normalizedAction.startsWith("toggleLibraryList:")) {
    const key = normalizedAction.slice("toggleLibraryList:".length);
    const nextSelected = !listPickerState.membership?.[key];
    listPickerState.membership =
      listPickerState.sourceMode === LibrarySourceMode.SIMKL
        ? Object.fromEntries(
            listPickerState.tabs.map((tab) => [tab.key, nextSelected && tab.key === key])
          )
        : { ...(listPickerState.membership || {}), [key]: nextSelected };
    listPickerState.destructiveRemovalRequired = false;
    openLibraryListPickerSheet(screen, cardElement, listPickerState);
    return;
  }
  if (
    normalizedAction === "saveLibraryLists" ||
    normalizedAction === "confirmDestructiveSimklRemoval"
  ) {
    try {
      await libraryRepository.applyMembershipChanges(
        listPickerState.item,
        { desiredMembership: listPickerState.membership || {} },
        { destructiveRemovalConfirmed: normalizedAction === "confirmDestructiveSimklRemoval" }
      );
      closeActiveBottomSheet();
      await collapseCardAndReload(screen, cardElement);
    } catch (error) {
      console.warn("libraryScreen: failed to save list membership", error);
      listPickerState.destructiveRemovalRequired =
        error?.code === "SIMKL_DESTRUCTIVE_REMOVAL_REQUIRED";
      openLibraryListPickerSheet(screen, cardElement, listPickerState);
    }
  }
}

async function handleLibraryZoomAction(screen, cardElement, item, optionsState, action) {
  if (action === "details") {
    navigateToSavedItem(item);
    return;
  }
  const result = await activatePosterOption(optionsState, action);
  if (result?.type === "listPicker") {
    openLibraryListPickerSheet(screen, cardElement, result.state);
    return;
  }
  if (result?.type !== "updated") {
    return;
  }
  if (action === "toggleLibrary" && optionsState.sourceMode === LibrarySourceMode.LOCAL) {
    await collapseCardAndReload(screen, cardElement);
    return;
  }
  await refreshAfterWatchedToggle(screen);
}

async function openSavedItemZoomMenu(screen, cardElement, item) {
  const optionsState = await createPosterOptionsState({
    id: item.id,
    type: item.type || "movie",
    title: item.name || item.id || "Untitled",
    poster: item.poster || "",
    background: item.background || "",
    addonBaseUrl: item.addonBaseUrl || ""
  });
  if (!optionsState) {
    return;
  }
  const options = getPosterOptions(optionsState);
  const actions = options.map((option) => ({
    id: option.action,
    label: option.label,
    destructive:
      option.action === "toggleLibrary" && optionsState.sourceMode === LibrarySourceMode.LOCAL,
    onSelect: () =>
      void handleLibraryZoomAction(screen, cardElement, item, optionsState, option.action)
  }));
  openPosterZoomOverlay({
    posterElement: cardElement,
    posterUrl: item.poster || "",
    title: item.name || item.id || "Untitled",
    subtitle: "",
    aspect: "portrait",
    actions
  });
}

// ---------------------------------------------------------------------------
// Saved mode markup
// ---------------------------------------------------------------------------

function renderFilterChip({ kind, label, value }) {
  return `
    <button type="button" class="phone-library-filter-chip focusable" data-action="phoneLibraryFilter" data-filter-kind="${escapeHtml(kind)}">
      <span class="phone-library-filter-chip-label">${escapeHtml(label)}</span>
      <span class="phone-library-filter-chip-value">${escapeHtml(value)}</span>
      <svg class="phone-library-filter-chip-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>
    </button>
  `;
}

function renderSavedFilterRow(screen) {
  const state = screen.controller.getState();
  const chips = [
    state.sourceMode === "trakt"
      ? renderFilterChip({
          kind: "list",
          label: t("library_filter_list", {}, "List"),
          value: screen.controller.getSelectedListLabel()
        })
      : "",
    renderFilterChip({
      kind: "type",
      label: t("library_filter_type", {}, "Type"),
      value: screen.controller.getSelectedTypeLabel()
    }),
    renderFilterChip({
      kind: "sort",
      label: t("library_filter_sort", {}, "Sort"),
      value: screen.controller.getSelectedSortLabel()
    }),
    state.availableGenres.length
      ? renderFilterChip({
          kind: "genre",
          label: t("library_filter_genre", {}, "Genre"),
          value: screen.controller.getSelectedGenreLabel()
        })
      : "",
    state.availableYears.length
      ? renderFilterChip({
          kind: "year",
          label: t("library_filter_year", {}, "Year"),
          value: screen.controller.getSelectedYearLabel()
        })
      : ""
  ]
    .filter(Boolean)
    .join("");
  return `<div class="phone-library-filter-row">${chips}</div>`;
}

function renderSavedShelves(screen, items) {
  const state = screen.controller.getState();
  const groups = groupItemsByType(items);
  return `
    <div class="phone-library-shelves">
      ${groups
        .map((group) => {
          const showViewAll = groups.length > 1;
          return renderPhoneShelf({
            id: `saved_${group.type}`,
            title: typeShelfTitle(state, group.type),
            items: group.items.map((item) => savedPosterItem(screen, item)),
            variant: "portrait",
            viewAllLabel: showViewAll ? defaultPhoneShelfViewAllLabel() : ""
          });
        })
        .join("")}
    </div>
  `;
}

function renderSavedGrid(items, screen) {
  return `
    <div class="phone-library-grid" data-phone-library-grid>
      ${items.map((item) => renderPosterCard(savedPosterItem(screen, item))).join("")}
    </div>
  `;
}

function renderSavedEmptyState(screen) {
  return `
    <div class="phone-library-empty-state">
      <h3 class="phone-library-empty-title">${escapeHtml(screen.controller.getEmptyStateTitle())}</h3>
      <p class="phone-library-empty-message">${escapeHtml(screen.controller.getEmptyStateSubtitle())}</p>
    </div>
  `;
}

function renderSavedBody(screen) {
  const state = screen.controller.getState();
  if (state.isLoading || state.isSyncing) {
    return `${renderSkeletonShelf({ count: 4 })}${renderSkeletonShelf({ count: 4 })}`;
  }
  if (!state.visibleItems.length) {
    return renderSavedEmptyState(screen);
  }
  return screen.phoneLibraryLayoutMode === "vertical"
    ? renderSavedGrid(state.visibleItems, screen)
    : renderSavedShelves(screen, state.visibleItems);
}

function renderSavedMode(screen) {
  return `
    ${renderSavedFilterRow(screen)}
    <div class="phone-library-body" data-phone-library-body>
      ${renderSavedBody(screen)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Cloud mode
// ---------------------------------------------------------------------------

function cloudTypeLabel(type) {
  const labels = {
    Torrent: ["cloud_library_type_torrents", "Torrents"],
    Usenet: ["cloud_library_type_usenet", "Usenet"],
    WebDownload: ["cloud_library_type_web", "Web"],
    File: ["cloud_library_type_files", "Files"]
  };
  const [key, fallback] = labels[type] || ["cloud_library_type_files", String(type || "")];
  return t(key, {}, fallback);
}

function formatCloudSize(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  if (!(bytes > 0)) return "";
  if (bytes >= 1000000000) return `${(bytes / 1000000000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1000000)} MB`;
}

function matchesLocalCloudQuery(item, query) {
  if (!query) {
    return true;
  }
  const normalized = query.toLowerCase();
  return (
    String(item.name || "")
      .toLowerCase()
      .includes(normalized) ||
    (item.files || []).some((file) =>
      String(file.name || "")
        .toLowerCase()
        .includes(normalized)
    )
  );
}

function filteredCloudItems(screen) {
  const state = screen.controller.getState();
  const query = String(screen.phoneLibraryCloudSearchQuery || "").trim();
  return state.visibleCloudItems.filter((item) => matchesLocalCloudQuery(item, query));
}

function renderCloudFilterRow(screen) {
  const state = screen.controller.getState();
  if (!state.availableCloudProviders.length && !state.availableCloudTypes.length) {
    return "";
  }
  const providerLabel =
    state.availableCloudProviders.find((option) => option.key === state.selectedCloudProviderId)
      ?.label || t("cloud_library_provider_all", {}, "All");
  const typeLabel =
    state.availableCloudTypes.find((option) => option.key === state.selectedCloudType)?.label ||
    t("cloud_library_type_all", {}, "All");
  return `
    <div class="phone-library-filter-row">
      ${renderFilterChip({
        kind: "cloud_provider",
        label: t("cloud_library_select_provider", {}, "Provider"),
        value: providerLabel
      })}
      ${renderFilterChip({
        kind: "cloud_type",
        label: t("cloud_library_select_type", {}, "Type"),
        value: typeLabel
      })}
    </div>
  `;
}

function renderCloudSearchBar(screen) {
  const query = screen.phoneLibraryCloudSearchQuery || "";
  return `
    <div class="phone-library-cloud-search-wrap${query.trim() ? " has-value" : ""}" data-phone-library-cloud-search-wrap>
      <span class="phone-library-cloud-search-icon">${searchIconMarkup()}</span>
      <input
        type="text"
        class="phone-library-cloud-search-input"
        data-phone-library-cloud-search-input
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="${escapeHtml(t("cloud_library_search_placeholder", {}, "Search files"))}"
        value="${escapeHtml(query)}"
      />
      <button type="button" class="phone-library-cloud-clear-btn focusable" data-action="phoneLibraryCloudSearchClear" aria-label="${escapeHtml(t("action_clear", {}, "Clear"))}">
        ${clearIconMarkup()}
      </button>
    </div>
  `;
}

function renderCloudRow(item, resolving) {
  const files = item.__playableFiles || [];
  const fileLabel =
    files.length === 0
      ? t("cloud_library_no_playable_files", {}, "No playable files")
      : files.length === 1
        ? t("cloud_library_one_playable_file", {}, "1 playable file")
        : t(
            "cloud_library_playable_file_count",
            { count: files.length },
            `${files.length} playable files`
          );
  const metadata = [item.providerName, cloudTypeLabel(item.type), formatCloudSize(item.sizeBytes)]
    .filter(Boolean)
    .join(" • ");
  const statusLabel = resolving
    ? t("cloud_library_opening", {}, "Opening…")
    : item.status || fileLabel;
  const hasProgress = Number.isFinite(item.progressFraction);
  return `
    <button type="button" class="phone-library-cloud-row focusable${files.length ? " playable" : ""}"
            data-action="phoneLibraryOpenCloudItem"
            data-cloud-item-key="${escapeHtml(item.stableKey)}">
      <div class="phone-library-cloud-row-main">
        <div class="phone-library-cloud-row-name">${escapeHtml(item.name)}</div>
        ${metadata ? `<div class="phone-library-cloud-row-subtitle">${escapeHtml(metadata)}</div>` : ""}
        <div class="phone-library-cloud-row-status">${escapeHtml(statusLabel)}</div>
        ${
          hasProgress
            ? `<span class="phone-library-cloud-progress-track"><span class="phone-library-cloud-progress-fill" style="width:${(Math.max(0, Math.min(1, item.progressFraction)) * 100).toFixed(2)}%"></span></span>`
            : ""
        }
      </div>
      ${files.length ? `<span class="phone-library-cloud-play" aria-hidden="true">${playIconMarkup()}</span>` : ""}
    </button>
  `;
}

function renderCloudList(screen) {
  const state = screen.controller.getState();
  const items = filteredCloudItems(screen);
  if (state.cloudLibrary.isRefreshing && !state.cloudLibrary.items.length) {
    return `<div class="phone-library-shelves">${renderSkeletonShelf({ count: 4 })}</div>`;
  }
  let emptyTitle = "";
  let emptyMessage = "";
  if (!state.cloudLibrary.isEnabled) {
    emptyTitle = t("cloud_library_disabled_title", {}, "Cloud library is off");
    emptyMessage = t(
      "cloud_library_disabled_message",
      {},
      "Turn on Cloud library in Connected Services settings."
    );
  } else if (!(state.cloudLibrary.providers || []).length) {
    emptyTitle = t("cloud_library_connect_title", {}, "No cloud account connected");
    emptyMessage = t(
      "cloud_library_connect_message",
      {},
      "Connect an account in Settings to browse cloud files."
    );
  } else if (!items.length) {
    emptyTitle = t("cloud_library_empty_title", {}, "Nothing here yet");
    emptyMessage = t(
      "cloud_library_empty_message",
      {},
      "No playable cloud files match the current filters."
    );
  }
  if (emptyTitle) {
    return `<div class="phone-library-empty-state"><h3 class="phone-library-empty-title">${escapeHtml(emptyTitle)}</h3><p class="phone-library-empty-message">${escapeHtml(emptyMessage)}</p></div>`;
  }
  return `
    <div class="phone-library-cloud-list" data-phone-library-cloud-list>
      ${items
        .map((item) => {
          const resolvingKey = String(state.resolvingCloudFileKey || "");
          const resolving = resolvingKey.startsWith(item.stableKey);
          return renderCloudRow(
            { ...item, __playableFiles: screen.controller.playableFilesForCloudItem(item) },
            resolving
          );
        })
        .join("")}
    </div>
  `;
}

function renderCloudFilePickerView(screen) {
  const state = screen.controller.getState();
  const item = state.cloudFilePickerItem;
  if (!item) {
    return "";
  }
  const files = screen.controller.playableFilesForCloudItem(item);
  return `
    <div class="phone-library-filepicker" data-phone-library-filepicker>
      <div class="phone-library-filepicker-header">
        <button type="button" class="phone-library-filepicker-back focusable" data-action="phoneLibraryCloudFilePickerBack" aria-label="${escapeHtml(t("action_back", {}, "Back"))}">
          ${backIconMarkup()}
        </button>
        <div class="phone-library-filepicker-title">${escapeHtml(item.name)}</div>
      </div>
      <div class="phone-library-filepicker-list">
        ${files
          .map((file) => {
            const key = `${item.stableKey}:${file.stableKey}`;
            const resolving = state.resolvingCloudFileKey === key;
            return `
              <button type="button" class="phone-library-filepicker-row focusable"
                      data-action="phoneLibraryPlayCloudFile"
                      data-cloud-item-key="${escapeHtml(item.stableKey)}"
                      data-cloud-file-key="${escapeHtml(file.stableKey)}"
                      ${resolving ? "disabled" : ""}>
                <span class="phone-library-filepicker-row-name">${escapeHtml(file.name)}</span>
                <span class="phone-library-filepicker-row-size">${escapeHtml(
                  resolving
                    ? t("cloud_library_opening", {}, "Opening…")
                    : formatCloudSize(file.sizeBytes)
                )}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderCloudMode(screen) {
  const state = screen.controller.getState();
  if (state.cloudFilePickerItem) {
    return renderCloudFilePickerView(screen);
  }
  return `
    ${renderCloudFilterRow(screen)}
    ${renderCloudSearchBar(screen)}
    <div class="phone-library-body" data-phone-library-body>
      ${renderCloudList(screen)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Header + render
// ---------------------------------------------------------------------------

function renderHeader(screen) {
  const state = screen.controller.getState();
  const isSaved = state.viewMode === LIBRARY_VIEW_MODE.SAVED;
  const layoutToggleMarkup = isSaved
    ? `
      <button type="button" class="phone-library-layout-toggle focusable" data-action="phoneLibraryToggleLayout" aria-label="${escapeHtml(t("action_toggle_layout", {}, "Toggle layout"))}">
        ${screen.phoneLibraryLayoutMode === "vertical" ? gridLayoutIconMarkup() : shelfLayoutIconMarkup()}
      </button>
    `
    : "";
  return `
    <header class="phone-library-header" data-phone-library-header>
      <div class="phone-library-header-top">
        <h1 class="phone-library-title">${escapeHtml(t("library_title", {}, "Library"))}</h1>
        ${layoutToggleMarkup}
      </div>
      <div class="phone-library-tabs">
        <button type="button" class="phone-library-tab focusable${isSaved ? " selected" : ""}" data-action="phoneLibrarySelectViewMode" data-view-mode="saved">
          ${escapeHtml(t("library_source_saved", {}, "Saved"))}
        </button>
        <button type="button" class="phone-library-tab focusable${!isSaved ? " selected" : ""}" data-action="phoneLibrarySelectViewMode" data-view-mode="cloud">
          ${escapeHtml(t("library_source_cloud", {}, "Cloud"))}
        </button>
      </div>
    </header>
  `;
}

function renderLibraryScreenPhone(screen) {
  ensurePhoneLibraryState(screen);
  const state = screen.controller.getState();
  const isSaved = state.viewMode === LIBRARY_VIEW_MODE.SAVED;
  return `
    <div class="phone-library-scroll" data-phone-library-scroll>
      ${renderHeader(screen)}
      <div class="phone-library-content">
        ${isSaved ? renderSavedMode(screen) : renderCloudMode(screen)}
      </div>
    </div>
    ${renderPhoneNavBar({ selectedRoute: "library", profileState: screen.sidebarProfile })}
  `;
}

// ---------------------------------------------------------------------------
// Filter chip bottom sheets
// ---------------------------------------------------------------------------

function openSavedFilterSheet(screen, kind) {
  const controller = screen.controller;
  const options = controller.getPickerOptions(kind);
  if (!options.length) {
    return;
  }
  const state = controller.getState();
  const currentValue =
    kind === "list"
      ? state.selectedListKey
      : kind === "type"
        ? state.selectedTypeKey
        : kind === "genre"
          ? state.selectedGenre || "__all__"
          : kind === "year"
            ? state.selectedYear || "__all__"
            : state.selectedSortKey;
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.value === currentValue ? checkmarkIconMarkup() : "",
      onSelect: () => {
        if (kind === "list") controller.selectList(option.value);
        else if (kind === "type") controller.selectType(option.value);
        else if (kind === "sort") controller.selectSort(option.value);
        else if (kind === "genre")
          controller.selectGenre(option.value === "__all__" ? null : option.value);
        else if (kind === "year")
          controller.selectYear(option.value === "__all__" ? null : option.value);
      }
    }))
  });
}

function openCloudFilterSheet(screen, kind) {
  const controller = screen.controller;
  const options = controller.getPickerOptions(kind);
  if (!options.length) {
    return;
  }
  const state = controller.getState();
  const currentValue =
    kind === "cloud_provider"
      ? state.selectedCloudProviderId || "__all__"
      : state.selectedCloudType || "__all__";
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.value === currentValue ? checkmarkIconMarkup() : "",
      onSelect: () => {
        if (kind === "cloud_provider") {
          controller.selectCloudProvider(option.value === "__all__" ? null : option.value);
        } else {
          controller.selectCloudType(option.value === "__all__" ? null : option.value);
        }
      }
    }))
  });
}

// ---------------------------------------------------------------------------
// Tap dispatch
// ---------------------------------------------------------------------------

async function playFoundCloudFile(screen, itemKeyValue, fileKeyValue) {
  const item = screen.controller.cloudItemByKey(itemKeyValue);
  const file = item?.files?.find((entry) => entry.stableKey === fileKeyValue);
  if (item && file) {
    await screen.playCloudFile(item, file);
  }
}

function handlePhonePointerActivate(screen, target) {
  const action = String(target?.dataset?.action || "");
  if (!action) {
    return false;
  }

  if (action === "phoneLibrarySelectViewMode") {
    void screen.controller.selectViewMode(String(target.dataset.viewMode || "saved"));
    return true;
  }
  if (action === "phoneLibraryToggleLayout") {
    setPhoneLibraryLayoutMode(
      screen,
      screen.phoneLibraryLayoutMode === "vertical" ? "horizontal" : "vertical"
    );
    screen.requestRender();
    return true;
  }
  if (action === "phoneLibraryFilter") {
    const kind = String(target.dataset.filterKind || "");
    if (kind === "cloud_provider" || kind === "cloud_type") {
      openCloudFilterSheet(screen, kind);
    } else {
      openSavedFilterSheet(screen, kind);
    }
    return true;
  }
  if (action === "phoneLibraryCloudSearchClear") {
    screen.phoneLibraryCloudSearchQuery = "";
    const input = screen.container?.querySelector("[data-phone-library-cloud-search-input]");
    if (input) input.value = "";
    refreshPhoneLibraryCloudBody(screen);
    return true;
  }
  if (action === "phoneLibraryOpenCloudItem") {
    const key = String(target.dataset.cloudItemKey || "");
    const item = screen.controller.cloudItemByKey(key);
    if (!item) return false;
    const files = screen.controller.playableFilesForCloudItem(item);
    if (!files.length) {
      screen.controller.setTransientMessage(
        t("cloud_library_no_playable_files", {}, "No playable files")
      );
    } else if (files.length === 1) {
      void screen.playCloudFile(item, files[0]);
    } else {
      screen.controller.openCloudFilePicker(item);
    }
    return true;
  }
  if (action === "phoneLibraryPlayCloudFile") {
    void playFoundCloudFile(
      screen,
      String(target.dataset.cloudItemKey || ""),
      String(target.dataset.cloudFileKey || "")
    );
    return true;
  }
  if (action === "phoneLibraryCloudFilePickerBack") {
    screen.controller.closeCloudFilePicker();
    return true;
  }
  if (action === "openDetail") {
    const item = findSavedItem(screen, String(target.dataset.id || ""));
    if (!item) return false;
    navigateToSavedItem(item);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mount / patch / cleanup
// ---------------------------------------------------------------------------

function refreshPhoneLibraryCloudBody(screen) {
  const bodyNode = screen.container?.querySelector("[data-phone-library-body]");
  if (bodyNode) {
    bodyNode.innerHTML = renderCloudList(screen);
  }
  const wrap = screen.container?.querySelector("[data-phone-library-cloud-search-wrap]");
  wrap?.classList.toggle(
    "has-value",
    String(screen.phoneLibraryCloudSearchQuery || "").trim().length > 0
  );
}

function bindGridLongPress(screen, root) {
  screen._phoneLibraryGridDetach?.();
  screen._phoneLibraryGridDetach = bindPosterCardEvents(root, {
    onLongPress: (key, cardElement) => {
      const item = findSavedItem(screen, key);
      if (item) {
        void openSavedItemZoomMenu(screen, cardElement, item);
      }
    }
  });
  return screen._phoneLibraryGridDetach;
}

// Windowing for the saved vertical grid only (shelves and cloud rows keep
// full render). Mirrors the catalog see-all wiring over the shared core.
function applyLibraryGridWindow(screen, container) {
  const grid = container.querySelector("[data-phone-library-grid]");
  const scroller = container.querySelector("[data-phone-library-scroll]");
  const state = screen.controller?.getState?.();
  const items =
    state?.viewMode === LIBRARY_VIEW_MODE.SAVED && screen.phoneLibraryLayoutMode === "vertical"
      ? state.visibleItems || []
      : [];
  if (!grid || !scroller || !shouldWindow(items.length)) {
    screen._phoneLibraryWindow = null;
    return false;
  }
  const geometry = measureGrid(grid);
  const range = computeWindow({
    itemCount: items.length,
    columns: geometry.columns,
    rowHeight: geometry.rowHeight,
    rowGap: geometry.rowGap,
    scrollTop: scroller.scrollTop || 0,
    viewportHeight: scroller.clientHeight || 600
  });
  const key = `${items.length}:${range.startIndex}:${range.endIndex}`;
  if (screen._phoneLibraryWindow === key) {
    return true;
  }
  screen._phoneLibraryWindow = key;
  renderWindowedGrid(grid, {
    items,
    renderCard: (item) => renderPosterCard(savedPosterItem(screen, item)),
    range,
    scroller
  });
  bindGridLongPress(screen, container.querySelector(".phone-library-content"));
  return true;
}

function mountPhoneInteractivity(screen, container) {
  teardownPhoneInteractivity(screen);

  const state = screen.controller.getState();
  const isSaved = state.viewMode === LIBRARY_VIEW_MODE.SAVED;

  if (isSaved) {
    bindGridLongPress(screen, container.querySelector(".phone-library-content"));
  } else {
    screen._phoneLibraryGridDetach = null;
  }

  screen._phoneLibraryWindow = null;
  const scroller = container.querySelector("[data-phone-library-scroll]");
  applyLibraryGridWindow(screen, container);
  const handleGridScroll = () => {
    applyLibraryGridWindow(screen, container);
  };
  scroller?.addEventListener("scroll", handleGridScroll, { passive: true });

  let geometryTimer = 0;
  const remeasure = () => {
    globalThis.clearTimeout?.(geometryTimer);
    geometryTimer = globalThis.setTimeout?.(() => {
      screen._phoneLibraryWindow = null;
      applyLibraryGridWindow(screen, container);
    }, 250);
  };
  const grid = container.querySelector("[data-phone-library-grid]");
  grid?.addEventListener("load", remeasure, { capture: true, passive: true });
  globalThis.addEventListener?.("resize", remeasure);

  const searchInput = container.querySelector("[data-phone-library-cloud-search-input]");
  const handleSearchInput = () => {
    if (!searchInput) return;
    screen.phoneLibraryCloudSearchQuery = searchInput.value;
    refreshPhoneLibraryCloudBody(screen);
  };
  searchInput?.addEventListener("input", handleSearchInput);

  const detachNavBar = bindPhoneNavBarEvents(container, {
    currentRoute: "library",
    scrollRoot: scroller
  });

  const teardown = () => {
    scroller?.removeEventListener("scroll", handleGridScroll);
    grid?.removeEventListener("load", remeasure, { capture: true });
    globalThis.removeEventListener?.("resize", remeasure);
    globalThis.clearTimeout?.(geometryTimer);
    screen._phoneLibraryGridDetach?.();
    screen._phoneLibraryGridDetach = null;
    screen._phoneLibraryWindow = null;
    searchInput?.removeEventListener("input", handleSearchInput);
    detachNavBar();
  };

  screen._phoneLibraryTeardown = teardown;
  return teardown;
}

function teardownPhoneInteractivity(screen) {
  screen._phoneLibraryTeardown?.();
  screen._phoneLibraryTeardown = null;
}

// ---------------------------------------------------------------------------
// Screen object
// ---------------------------------------------------------------------------

export const LibraryScreen = {
  cancelScheduledRender() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
  },

  requestRender() {
    if (!this.container || Router.getCurrent() !== "library") {
      return;
    }
    if (this.renderFrame) {
      return;
    }
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      if (!this.container || Router.getCurrent() !== "library") {
        return;
      }
      this.render();
    });
  },

  handleControllerChange() {
    this.requestRender();
  },

  async mount() {
    this.container = document.getElementById("library");
    ScreenUtils.show(this.container);
    const controller = new LibraryController((state, change) =>
      this.handleControllerChange(state, change)
    );
    this.controller = controller;
    this.sidebarProfile = await getSidebarProfileState();

    this.render();
    await controller.init();
    if (this.controller !== controller || Router.getCurrent() !== "library") {
      return;
    }
    controller.closePicker();
  },

  render() {
    if (!this.container) {
      return;
    }
    this.cancelScheduledRender();
    this.container.innerHTML = renderLibraryScreenPhone(this);
    mountPhoneInteractivity(this, this.container);
  },

  onPointerActivate(target) {
    return handlePhonePointerActivate(this, target);
  },

  consumeBackRequest() {
    return false;
  },

  async playCloudFile(item, file) {
    const result = await this.controller.resolveCloudPlayback(item, file);
    if (!result?.url) return;
    const filename = result.filename || file.name || item.name;
    const streamId = `${item.stableKey}:${file.stableKey}`;
    const stream = {
      id: streamId,
      url: result.url,
      name: filename,
      title: filename,
      description: item.name,
      addonName: item.providerName,
      behaviorHints: {
        filename,
        videoSize: result.videoSizeBytes || file.sizeBytes || null
      }
    };
    Router.navigate("player", {
      streamUrl: result.url,
      itemId: item.stableKey,
      itemType: "cloud",
      videoId: streamId,
      playerTitle: filename,
      playerSubtitle: item.name,
      streamCandidates: [stream],
      preferredStreamId: streamId
    });
  },

  cleanup() {
    teardownPhoneInteractivity(this);
    this.cancelScheduledRender();
    this.controller?.dispose?.();
    this.controller = null;
    ScreenUtils.hide(this.container);
  }
};
