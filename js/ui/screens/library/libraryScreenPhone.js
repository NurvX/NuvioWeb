import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { renderPhoneShelf, defaultPhoneShelfViewAllLabel } from "../../components/phoneShelf.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import { renderPhoneNavBar, bindPhoneNavBarEvents } from "../../components/phoneNavBar.js";
import { renderSkeletonShelf } from "../../components/phoneSkeleton.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
import {
  libraryRepository,
  LibrarySourceMode
} from "../../../data/repository/libraryRepository.js";
import { LibraryPreferencesStore } from "../../../data/local/libraryPreferencesStore.js";
import {
  createPosterOptionsState,
  getPosterOptions,
  activatePosterOption,
  getPosterListPickerOptions
} from "../../components/posterOptionsMenu.js";
import { LIBRARY_VIEW_MODE } from "./libraryController.js";

// Phone render path for js/ui/screens/library/libraryScreen.js (ticket 03-02, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; libraryScreen.js's own `render()` only has a guard clause that
// dispatches here when `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()` add
// a `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders.
//
// Unlike Home/Search's phone modules, this one leans almost entirely on `screen.controller`
// (the existing `LibraryController` instance from `libraryController.js`) rather than keeping
// its own parallel state: view-mode switching, Saved-mode section/type/sort/genre/year
// filtering, and Cloud-mode provider/type filtering + file resolution + the multi-file picker
// all call the controller's own existing methods (`selectViewMode`/`selectList`/`selectType`/
// `selectSort`/`selectGenre`/`selectYear`/`selectCloudProvider`/`selectCloudType`/
// `refreshCloudLibrary`/`playableFilesForCloudItem`/`openCloudFilePicker`/
// `closeCloudFilePicker`/`getEmptyStateTitle`/`getEmptyStateSubtitle`) unchanged — none of that
// filtering/data logic is reimplemented here. `screen.playCloudFile(item, file)` (the TV
// screen's own existing async method) is reused verbatim for cloud playback resolution +
// Router navigation to the player, exactly as it is from the TV click dispatcher.
//
// The one deliberately *local*, phone-only piece of state is the Cloud-mode text search query
// (`screen.phoneLibraryCloudSearchQuery`): typing into it patches only the cloud list's own DOM
// node (`refreshPhoneLibraryCloudBody`) rather than going through
// `controller.setCloudSearchQuery()` + the controller's `onChange` -> `screen.requestRender()`
// chain, which would rebuild the whole screen (and steal input focus/caret) on every keystroke
// the same way `searchScreenPhone.js` avoids that for its own typed query. The actual text
// match predicate is a small local mirror of `libraryController.js`'s own `withVisibleCloudItems`
// query filter (a three-line substring check) — not a duplication of any real business logic,
// the same allowance `searchScreenPhone.js`'s file header documents for its Discover mirror.
//
// The Saved-mode poster long-press menu (Go to details / Add-or-remove library / Manage lists /
// Mark watched) is built from `js/ui/components/posterOptionsMenu.js`'s own exported,
// screen-agnostic helpers (`createPosterOptionsState`/`getPosterOptions`/`activatePosterOption`/
// `getPosterListPickerOptions`) — the exact same functions `libraryScreen.js`'s TV
// `openPosterOptionsMenu(node)` already calls via `PosterOptionsDialogController` — rendered
// through `posterZoomOverlay.js` (Saved-mode grid/shelf items) and, for the rare
// multiple-Trakt/Simkl-list case, a `bottomSheet.js` checklist, rather than reimplementing any
// of the actual toggle/list-membership logic. Because every item in this screen's Saved list is
// already a library member, "Remove from library" (Local mode) or unchecking every list
// (Trakt/Simkl) always means the item leaves the current filtered list — so, exactly like
// ticket 01-01's continue-watching removal, a successful removal plays the same
// fade+scale+collapse `.phone-poster-removing` transition on the item's card before the
// underlying `controller.reload()` actually drops it from the DOM.
//
// Layout-mode note (Saved mode's horizontal-shelves vs vertical-grid toggle): tapping a
// per-type shelf's "View All" pill both switches to vertical-grid mode *and* calls
// `controller.selectType(typeKey)` to filter the grid down to that type — reusing the
// controller's existing type filter as the "dedicated grid" the ticket asks for, rather than
// inventing a new route/screen this ticket's scope doesn't cover.

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

// ---------------------------------------------------------------------------------------
// Screen-singleton state
// ---------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------
// Saved-mode: item shaping, grouping, navigation
// ---------------------------------------------------------------------------------------

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

/** Groups `items` by `type`, preserving each item's relative order and the order types are
 * first encountered in — used by horizontal (shelf) mode to build one `phoneShelf.js` row per
 * type out of the controller's already-filtered/sorted `visibleItems`. */
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

// ---------------------------------------------------------------------------------------
// Saved-mode: poster long-press menu (details / library / watched), reusing
// posterOptionsMenu.js's exported business logic — see file header comment.
// ---------------------------------------------------------------------------------------

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
      console.warn("libraryScreenPhone: failed to save list membership", error);
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
    // Every item shown here is already a library member — toggling it off is always a removal.
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

// ---------------------------------------------------------------------------------------
// Saved mode markup
// ---------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------
// Cloud mode
// ---------------------------------------------------------------------------------------

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

/** Local mirror of `libraryController.js`'s own text-query substring match (see file header
 * comment) — applied on top of `state.visibleCloudItems`, which already reflects the
 * controller's provider/type filters. */
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

// ---------------------------------------------------------------------------------------
// Header + public entry points
// ---------------------------------------------------------------------------------------

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

/** Returns the full phone library screen markup. Reads `screen.controller.getState()` directly
 * — see the file header comment on why this module leans on the controller instead of keeping
 * its own parallel data state. */
export function renderLibraryScreenPhone(screen) {
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

// ---------------------------------------------------------------------------------------
// Filter chip bottom sheets
// ---------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------
// Tap dispatch
// ---------------------------------------------------------------------------------------

async function playFoundCloudFile(screen, itemKeyValue, fileKeyValue) {
  const item = screen.controller.cloudItemByKey(itemKeyValue);
  const file = item?.files?.find((entry) => entry.stableKey === fileKeyValue);
  if (item && file) {
    await screen.playCloudFile(item, file);
  }
}

export function handleLibraryPhonePointerActivate(screen, target) {
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

// ---------------------------------------------------------------------------------------
// Mount / patch / cleanup
// ---------------------------------------------------------------------------------------

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
  return bindPosterCardEvents(root, {
    onLongPress: (key, cardElement) => {
      const item = findSavedItem(screen, key);
      if (item) {
        void openSavedItemZoomMenu(screen, cardElement, item);
      }
    }
  });
}

/** Wires the phone library screen's interactivity after `renderLibraryScreenPhone`'s markup
 * has been inserted into `container`. Returns a teardown function; also stores it on
 * `screen._phoneLibraryTeardown` so `cleanupLibraryScreenPhone(screen)` can call it without the
 * caller needing to keep the reference itself. */
export function mountLibraryScreenPhone(screen, container) {
  cleanupLibraryScreenPhone(screen);

  const state = screen.controller.getState();
  const isSaved = state.viewMode === LIBRARY_VIEW_MODE.SAVED;

  const detachLongPress = isSaved
    ? bindGridLongPress(screen, container.querySelector(".phone-library-content"))
    : () => {};

  const searchInput = container.querySelector("[data-phone-library-cloud-search-input]");
  const handleSearchInput = () => {
    if (!searchInput) return;
    screen.phoneLibraryCloudSearchQuery = searchInput.value;
    refreshPhoneLibraryCloudBody(screen);
  };
  searchInput?.addEventListener("input", handleSearchInput);

  const scroller = container.querySelector("[data-phone-library-scroll]");
  const detachNavBar = bindPhoneNavBarEvents(container, {
    currentRoute: "library",
    scrollRoot: scroller
  });

  const teardown = () => {
    detachLongPress();
    searchInput?.removeEventListener("input", handleSearchInput);
    detachNavBar();
  };

  screen._phoneLibraryTeardown = teardown;
  return teardown;
}

/** Tears down whatever `mountLibraryScreenPhone` last wired up, if anything, and closes any
 * open bottom sheet/zoom overlay. Safe to call when nothing is mounted. */
export function cleanupLibraryScreenPhone(screen) {
  screen._phoneLibraryTeardown?.();
  screen._phoneLibraryTeardown = null;
}
