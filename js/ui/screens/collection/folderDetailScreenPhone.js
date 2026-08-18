import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { buildFolderSourceRows } from "./folderDetailScreen.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import {
  renderPhoneShelf,
  bindPhoneShelfEvents,
  defaultPhoneShelfViewAllLabel
} from "../../components/phoneShelf.js";
import { renderSkeletonPosterCard, renderSkeletonShelf } from "../../components/phoneSkeleton.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
import { isTitleItemWatched } from "../../components/watchedTitleBadge.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import {
  libraryRepository,
  LibrarySourceMode
} from "../../../data/repository/libraryRepository.js";
import {
  createPosterOptionsState,
  getPosterOptions,
  activatePosterOption,
  getPosterListPickerOptions
} from "../../components/posterOptionsMenu.js";

// Phone render path for js/ui/screens/collection/folderDetailScreen.js (ticket 03-04, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; folderDetailScreen.js's own `render()` only has a guard clause that
// dispatches here (after its existing `useHomeFollowLayout` guard) when
// `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()` add a
// `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders.
//
// Scope note (mirrors this same screen's earlier touch-tap-activation effort, and the epic
// spec's Out of Scope section): `useHomeFollowLayout` folders are excluded entirely — that
// mode delegates to `HomeScreen`'s transform-positioned swipeable-row system, which touch
// support is out of scope for this whole epic. `folderDetailScreen.js`'s `render()` checks
// `useHomeFollowLayout` before ever reaching the phone-viewport dispatch, so this module is
// never invoked for that mode; only `TABBED_GRID` and the plain row-track layout get a phone
// build.
//
// `buildFolderSourceRows(screen.tabs)` is the one pure helper this module needs from the TV
// screen file — it already exists there (used by `renderFollowLayout()` too), so it was
// exported rather than duplicated here. Everything else this module needs
// (`screen.tabs`/`screen.sourceTabs`/`screen.selectedTabIndex`/`screen.folder`/
// `screen.collection`/`screen.watchedTitleIds`/`screen.layoutPrefs`) is already populated by
// the screen's existing `mount()`/`loadTab()` data flow — this module only reads it and calls
// `screen.loadTab(index, { append: true })` (the TV screen's own existing async method,
// unchanged) directly for TABBED_GRID's infinite scroll, exactly mirroring the coordination
// the TV D-pad-scroll pagination path already does (see `folderDetailScreen.js`'s `onKeyDown`,
// the "All tab loads every source tab" branch) — no fetch/pagination logic is reimplemented
// here.
//
// Row-track mode's shelves reuse `Router.navigate("catalogSeeAll", ...)` for "view all" with
// the exact same param shape `homeScreenPhone.js`'s own catalog rows already build
// (`addonBaseUrl`/`addonId`/`addonName`/`catalogId`/`catalogName`/`type`/`initialItems`) — see
// ticket 03-03. For TMDB/Trakt-sourced folder rows (no real `addonBaseUrl`),
// `catalogSeeAllScreen.js`'s own `loadNextPage()` already degrades gracefully (it only
// disables further pagination when `addonBaseUrl`/`catalogId`/`type` are missing — see its
// early-return guard), so "view all" still shows whatever was already loaded even though it
// cannot fetch further pages for those providers.

const SCROLL_LOAD_THRESHOLD_PX = 640;
const GRID_INITIAL_SKELETON_COUNT = 9;
const ROW_SKELETON_COUNT = 6;

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

function backIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>`;
}

function checkmarkIconMarkup() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>`;
}

// ---------------------------------------------------------------------------------------
// Item shaping, navigation
// ---------------------------------------------------------------------------------------

function toPosterItem(screen, item) {
  return {
    id: String(item.id || ""),
    posterUrl: item.poster || "",
    title: item.name || "Untitled",
    subtitle:
      screen.layoutPrefs?.posterLabelsEnabled !== false ? String(item.releaseInfo || "") : "",
    watched: isTitleItemWatched(item, screen.watchedTitleIds)
  };
}

function detailNavParams(item, sourceMeta = {}) {
  return {
    itemId: item.id,
    itemType: item.type || item.catalogType || sourceMeta.type || "movie",
    fallbackTitle: item.name || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || item.backdrop || item.poster || "",
    addonBaseUrl: item.addonBaseUrl || sourceMeta.addonBaseUrl || "",
    addonId: item.addonId || sourceMeta.addonId || "",
    addonName: item.addonName || sourceMeta.addonName || "",
    catalogType: item.catalogType || item.type || sourceMeta.type || "movie"
  };
}

function navigateToItem(item, sourceMeta = {}) {
  if (!item?.id) {
    return false;
  }
  Router.navigate("detail", detailNavParams(item, sourceMeta));
  return true;
}

function viewAllParamsForRow(row) {
  return {
    addonBaseUrl: row.addonBaseUrl || "",
    addonId: row.addonId || "",
    addonName: row.addonName || "",
    catalogId: row.catalogId || "",
    catalogName: row.catalogName || "",
    type: row.type || "movie",
    initialItems: Array.isArray(row.result?.data?.items) ? row.result.data.items : []
  };
}

/** Rebuilds the id -> {item, sourceMeta} lookup used for tap/long-press dispatch, matching
 * whatever `renderFolderDetailScreenPhone` just rendered for the current view mode. Stored on
 * `screen._phoneFolderItemsById` so `handleFolderDetailPhonePointerActivate` and the long-press
 * handlers below don't need to re-derive it. */
function buildItemsMap(screen) {
  const map = new Map();
  if (screen.viewMode === "TABBED_GRID") {
    const tab = screen.getSelectedTab?.() || null;
    const sourceMeta = tab?.source || {};
    (tab?.items || []).forEach((item) => {
      if (item?.id) {
        map.set(String(item.id), { item, sourceMeta });
      }
    });
  } else {
    (screen.tabs || [])
      .filter((tab) => !tab.isAllTab)
      .forEach((tab) => {
        const sourceMeta = tab.source || {};
        (tab.items || []).forEach((item) => {
          if (item?.id) {
            map.set(String(item.id), { item, sourceMeta });
          }
        });
      });
  }
  screen._phoneFolderItemsById = map;
  return map;
}

function findEntryById(screen, id) {
  return screen._phoneFolderItemsById?.get(String(id || "")) || null;
}

// ---------------------------------------------------------------------------------------
// Poster long-press -> zoom overlay (reuses posterOptionsMenu.js's own business logic, same
// substitution catalogSeeAllScreenPhone.js/libraryScreenPhone.js already make for NuvioDialog).
// ---------------------------------------------------------------------------------------

function openFolderListPickerSheet(screen, listPickerState) {
  const options = getPosterListPickerOptions(listPickerState);
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.selected ? checkmarkIconMarkup() : "",
      onSelect: () => void handleFolderListPickerOption(screen, listPickerState, option.action)
    }))
  });
}

async function handleFolderListPickerOption(screen, listPickerState, action) {
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
    openFolderListPickerSheet(screen, listPickerState);
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
    } catch (error) {
      console.warn("folderDetailScreenPhone: failed to save list membership", error);
      listPickerState.destructiveRemovalRequired =
        error?.code === "SIMKL_DESTRUCTIVE_REMOVAL_REQUIRED";
      openFolderListPickerSheet(screen, listPickerState);
    }
  }
}

async function handleFolderZoomAction(screen, item, sourceMeta, optionsState, action) {
  if (action === "details") {
    navigateToItem(item, sourceMeta);
    return;
  }
  const result = await activatePosterOption(optionsState, action);
  if (result?.type === "listPicker") {
    openFolderListPickerSheet(screen, result.state);
    return;
  }
  if (result?.type !== "updated") {
    return;
  }
  if (action === "toggleWatched") {
    const itemId = String(item.id || "").trim();
    const watchedTitleIds = new Set(screen.watchedTitleIds || []);
    if (result.state.isWatched) {
      watchedTitleIds.add(itemId);
    } else {
      watchedTitleIds.delete(itemId);
    }
    screen.watchedTitleIds = watchedTitleIds;
  }
  screen.render();
}

async function openFolderItemZoomMenu(screen, cardElement, item, sourceMeta) {
  const optionsState = await createPosterOptionsState({
    id: item.id,
    type: item.type || item.catalogType || sourceMeta.type || "movie",
    title: item.name || "Untitled",
    poster: item.poster || "",
    background: item.background || item.backdrop || "",
    addonBaseUrl: item.addonBaseUrl || sourceMeta.addonBaseUrl || ""
  });
  if (!optionsState) {
    return;
  }
  const options = getPosterOptions(optionsState);
  const actions = options.map((option) => ({
    id: option.action,
    label: option.label,
    onSelect: () =>
      void handleFolderZoomAction(screen, item, sourceMeta, optionsState, option.action)
  }));
  openPosterZoomOverlay({
    posterElement: cardElement,
    posterUrl: item.poster || "",
    title: item.name || "Untitled",
    subtitle: String(item.releaseInfo || ""),
    aspect: "portrait",
    actions
  });
}

function onGridLongPress(screen) {
  return (id, cardElement) => {
    const entry = findEntryById(screen, id);
    if (entry) {
      void openFolderItemZoomMenu(screen, cardElement, entry.item, entry.sourceMeta);
    }
  };
}

// ---------------------------------------------------------------------------------------
// Header + collapsible cover hero
// ---------------------------------------------------------------------------------------

function renderHero(coverImageUrl) {
  return `
    <div class="phone-folder-hero" data-phone-folder-hero>
      <div class="phone-folder-hero-bg" data-phone-folder-hero-bg style="background-image:url('${escapeHtml(
        coverImageUrl
      ).replace(/'/g, "%27")}')"></div>
      <div class="phone-folder-hero-scrim" aria-hidden="true"></div>
    </div>
  `;
}

function renderHeader(folder, collectionTitle) {
  return `
    <header class="phone-folder-header" data-phone-folder-header>
      <button
        type="button"
        class="phone-folder-back focusable"
        data-action="phoneFolderBack"
        aria-label="${escapeHtml(t("common.back", {}, "Back"))}"
      >
        ${backIconMarkup()}
      </button>
      <div class="phone-folder-header-text">
        ${collectionTitle ? `<div class="phone-folder-eyebrow">${escapeHtml(collectionTitle)}</div>` : ""}
        <h1 class="phone-folder-title">${escapeHtml(folder?.title || "Folder")}</h1>
      </div>
    </header>
  `;
}

// ---------------------------------------------------------------------------------------
// TABBED_GRID body
// ---------------------------------------------------------------------------------------

function renderTabRow(screen) {
  const tabs = Array.isArray(screen.tabs) ? screen.tabs : [];
  if (tabs.length <= 1) {
    return "";
  }
  const chips = tabs
    .map(
      (tab, index) => `
      <button type="button"
              class="phone-folder-tab focusable${index === screen.selectedTabIndex ? " selected" : ""}"
              data-action="selectFolderTab"
              data-tab-index="${index}">${escapeHtml(tab.label || "Tab")}</button>
    `
    )
    .join("");
  return `<div class="phone-folder-tabs" data-phone-folder-tabs>${chips}</div>`;
}

function renderGridSkeleton() {
  const cards = Array.from({ length: GRID_INITIAL_SKELETON_COUNT })
    .map(() => renderSkeletonPosterCard({ aspect: "portrait" }))
    .join("");
  return `<div class="phone-folder-grid">${cards}</div>`;
}

function renderGridEmptyState(message) {
  return `
    <div class="phone-folder-empty-state">
      <h3 class="phone-folder-empty-title">${escapeHtml(message)}</h3>
    </div>
  `;
}

function renderTabbedGridBody(screen) {
  const tabRow = renderTabRow(screen);
  const selectedTab = screen.getSelectedTab?.() || null;
  const items = Array.isArray(selectedTab?.items) ? selectedTab.items : [];
  let bodyMarkup;
  if (!items.length && selectedTab?.loading) {
    bodyMarkup = renderGridSkeleton();
  } else if (!items.length) {
    bodyMarkup = renderGridEmptyState(
      selectedTab?.error || t("catalog_see_all_empty_title", {}, "No items available")
    );
  } else {
    bodyMarkup = `
      <div class="phone-folder-grid" data-phone-folder-grid>
        ${items.map((item) => renderPosterCard(toPosterItem(screen, item))).join("")}
      </div>
      ${
        selectedTab?.loading
          ? `
        <div class="phone-folder-loading-footer">
          ${renderLoadingIndicator()}
          <span>${escapeHtml(t("discover_loading", {}, "Loading..."))}</span>
        </div>
      `
          : ""
      }
    `;
  }
  return `${tabRow}${bodyMarkup}`;
}

// ---------------------------------------------------------------------------------------
// Row-track body
// ---------------------------------------------------------------------------------------

function buildRowTitle(row) {
  const mediaTypeLabel = row.type === "series" ? "Series" : "Movie";
  return row.catalogName !== mediaTypeLabel
    ? `${row.catalogName} - ${mediaTypeLabel}`
    : row.catalogName;
}

function renderRowTrackBody(screen) {
  const rows = buildFolderSourceRows(screen.tabs || []);
  if (!rows.length) {
    return renderGridEmptyState(t("catalog_see_all_empty_title", {}, "No items available"));
  }
  const shelvesMarkup = rows
    .map((row) => {
      const items = Array.isArray(row.result?.data?.items) ? row.result.data.items : [];
      if (!items.length) {
        return row.result?.status === "loading"
          ? renderSkeletonShelf({ count: ROW_SKELETON_COUNT, aspect: "portrait" })
          : "";
      }
      return renderPhoneShelf({
        id: row.homeCatalogKey,
        title: buildRowTitle(row),
        items: items.map((item) => toPosterItem(screen, item)),
        variant: "portrait",
        viewAllLabel: defaultPhoneShelfViewAllLabel()
      });
    })
    .join("");
  return `<div class="phone-folder-rows" data-phone-folder-rows>${shelvesMarkup}</div>`;
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone folder-detail screen markup for the screen's `TABBED_GRID` /
 * row-track view modes (never called for `useHomeFollowLayout` folders — see the file header
 * comment). Reads `screen.folder`/`screen.collection`/`screen.tabs`/`screen.sourceTabs`/
 * `screen.selectedTabIndex`/`screen.viewMode`/`screen.watchedTitleIds`/`screen.layoutPrefs`
 * directly — all populated by `folderDetailScreen.js`'s existing `mount()`/`loadTab()` data
 * flow. */
export function renderFolderDetailScreenPhone(screen) {
  buildItemsMap(screen);
  const folder = screen.folder || {};
  const collectionTitle = screen.collection?.title || "";
  const heroImage = String(folder.coverImageUrl || folder.heroBackdropUrl || "").trim();
  const body =
    screen.viewMode === "TABBED_GRID" ? renderTabbedGridBody(screen) : renderRowTrackBody(screen);
  return `
    <div class="phone-folder-root" data-phone-folder-root>
      <div class="phone-folder-scroll" data-phone-folder-scroll>
        <div class="phone-folder-content" data-phone-folder-content>
          ${heroImage ? renderHero(heroImage) : ""}
          ${body}
        </div>
      </div>
      ${renderHeader(folder, collectionTitle)}
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Tap dispatch (shared onPointerActivate contract)
// ---------------------------------------------------------------------------------------

export function handleFolderDetailPhonePointerActivate(screen, target) {
  const actionTarget = target?.closest?.("[data-action]");
  const action = String(actionTarget?.dataset?.action || "");
  if (!action) {
    return false;
  }
  if (action === "phoneFolderBack") {
    Router.back();
    return true;
  }
  if (action === "selectFolderTab") {
    const index = Math.max(0, Number(actionTarget.dataset.tabIndex || 0));
    if (index !== screen.selectedTabIndex) {
      screen.selectedTabIndex = index;
      screen._phoneFolderScrollTop = 0;
      screen.render();
    }
    return true;
  }
  if (action === "openDetail") {
    const entry = findEntryById(screen, actionTarget.dataset.id);
    if (!entry) {
      return false;
    }
    return navigateToItem(entry.item, entry.sourceMeta);
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Mount / measure / scroll-preserve / infinite scroll / cleanup
// ---------------------------------------------------------------------------------------

// The header floats (position: absolute) over the top of the scrollable content — when a
// cover-image hero is present it should show through the header's translucent gradient
// exactly like the catalog "see all" screen's own floating header does over its grid, so no
// extra top padding is added in that case (the hero itself is the first thing the header
// overlays). Only the hero-less layout needs `content`'s top pushed clear of the header, the
// same way `catalogSeeAllScreenPhone.js`'s `applyHeaderPadding` always does (it never has a
// hero to overlay).
function applyHeaderPadding(container) {
  const header = container.querySelector("[data-phone-folder-header]");
  const content = container.querySelector("[data-phone-folder-content]");
  const hero = container.querySelector("[data-phone-folder-hero]");
  if (!header || !content) {
    return;
  }
  content.style.paddingTop = hero ? "0" : `${header.offsetHeight}px`;
}

function applyHeroParallax(container, scrollTop) {
  const heroBg = container.querySelector("[data-phone-folder-hero-bg]");
  if (heroBg) {
    heroBg.style.transform = `translate3d(0, ${scrollTop * 0.4}px, 0)`;
  }
}

/** Coordinates TABBED_GRID's infinite-scroll pagination, mirroring the "All tab loads every
 * source tab" branch of `folderDetailScreen.js`'s own D-pad-scroll pagination (see its
 * `onKeyDown`) — this only decides *which* tab index(es) need another page; the actual fetch
 * stays entirely in the TV screen's own `screen.loadTab(index, { append: true })`. */
async function loadMoreForSelectedTab(screen) {
  const selectedTab = screen.getSelectedTab?.();
  if (!selectedTab) {
    return;
  }
  if (selectedTab.isAllTab) {
    const offset = screen.tabs[0]?.isAllTab ? 1 : 0;
    const sourceTabs = screen.tabs.filter((tab) => !tab.isAllTab);
    await Promise.all(
      sourceTabs.map((tab, index) => {
        if (tab.hasMore && !tab.loading) {
          return screen.loadTab(index + offset, { append: true });
        }
        return Promise.resolve();
      })
    );
    return;
  }
  if (selectedTab.hasMore && !selectedTab.loading) {
    await screen.loadTab(screen.selectedTabIndex, { append: true });
  }
}

function bindTabbedGridScroll(screen, scroller) {
  if (!scroller) {
    return () => {};
  }
  const handleScroll = () => {
    screen._phoneFolderScrollTop = scroller.scrollTop;
    applyHeroParallax(scroller, scroller.scrollTop);
    const remaining = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    if (remaining <= SCROLL_LOAD_THRESHOLD_PX) {
      void loadMoreForSelectedTab(screen);
    }
  };
  scroller.addEventListener("scroll", handleScroll, { passive: true });
  return () => scroller.removeEventListener("scroll", handleScroll);
}

function bindPlainScroll(scroller) {
  if (!scroller) {
    return () => {};
  }
  const handleScroll = () => {
    applyHeroParallax(scroller, scroller.scrollTop);
  };
  scroller.addEventListener("scroll", handleScroll, { passive: true });
  return () => scroller.removeEventListener("scroll", handleScroll);
}

function bindRowShelves(screen, container) {
  const detachers = Array.from(container.querySelectorAll("[data-shelf-id]")).map((shelfEl) => {
    const rowKey = String(shelfEl.dataset.shelfId || "");
    return bindPhoneShelfEvents(shelfEl, {
      onViewAll: () => {
        const rows = buildFolderSourceRows(screen.tabs || []);
        const row = rows.find((entry) => String(entry.homeCatalogKey || "") === rowKey);
        if (row) {
          Router.navigate("catalogSeeAll", viewAllParamsForRow(row));
        }
      },
      onLongPress: onGridLongPress(screen)
    });
  });
  return () => detachers.forEach((detach) => detach());
}

/** Wires the phone folder-detail screen's interactivity after
 * `renderFolderDetailScreenPhone`'s markup has been inserted into `container`. Returns a
 * teardown function; also stores it on `screen._phoneFolderTeardown` so
 * `cleanupFolderDetailScreenPhone(screen)` can call it without the caller needing to keep the
 * reference itself. */
export function mountFolderDetailScreenPhone(screen, container) {
  cleanupFolderDetailScreenPhone(screen);

  applyHeaderPadding(container);

  const scroller = container.querySelector("[data-phone-folder-scroll]");
  if (scroller && Number.isFinite(screen._phoneFolderScrollTop)) {
    scroller.scrollTop = screen._phoneFolderScrollTop;
  }
  applyHeroParallax(container, scroller?.scrollTop || 0);

  const detachScroll =
    screen.viewMode === "TABBED_GRID"
      ? bindTabbedGridScroll(screen, scroller)
      : bindPlainScroll(scroller);

  const detachGridLongPress =
    screen.viewMode === "TABBED_GRID"
      ? bindPosterCardEvents(container.querySelector("[data-phone-folder-grid]"), {
          onLongPress: onGridLongPress(screen)
        })
      : () => {};

  const detachRowShelves =
    screen.viewMode === "TABBED_GRID" ? () => {} : bindRowShelves(screen, container);

  const teardown = () => {
    detachScroll();
    detachGridLongPress();
    detachRowShelves();
  };
  screen._phoneFolderTeardown = teardown;
  return teardown;
}

/** Tears down whatever `mountFolderDetailScreenPhone` last wired up, if anything. Safe to call
 * when nothing is mounted. Deliberately does not touch `screen._phoneFolderScrollTop` — that
 * value needs to survive across the repeated mount/teardown cycles `loadTab`'s own `render()`
 * calls trigger mid-scroll (same reasoning as `catalogSeeAllScreenPhone.js`'s own scroll-top
 * persistence). */
export function cleanupFolderDetailScreenPhone(screen) {
  screen._phoneFolderTeardown?.();
  screen._phoneFolderTeardown = null;
}
