import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { catalogRepository } from "../../../data/repository/catalogRepository.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import { Environment } from "../../../platform/environment.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { buildWatchedTitleIdSet, isTitleItemWatched } from "../../components/watchedTitleBadge.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { I18n } from "../../../i18n/index.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import {
  shouldWindow,
  computeWindow,
  renderWindowedGrid,
  measureGrid
} from "../../components/virtualPosterGrid.js";
import { renderSkeletonPosterCard } from "../../components/phoneSkeleton.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
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

function isBackEvent(event) {
  return Environment.isBackEvent(event);
}

export function extractReleaseYear(item = {}) {
  const candidates = [
    item?.released,
    item?.releaseDate,
    item?.release_date,
    item?.releaseInfo,
    item?.year
  ].filter(Boolean);

  for (const value of candidates) {
    const match = String(value).match(/\b(19|20)\d{2}\b/);
    if (match) {
      return match[0];
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Phone UI constants and helpers
// ---------------------------------------------------------------------------

const SCROLL_LOAD_THRESHOLD_PX = 640;
const DISCOVER_INITIAL_SKELETON_COUNT = 9;

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function backIconMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>`;
}

function checkmarkIconMarkup() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>`;
}

// ---------------------------------------------------------------------------
// Item shaping, navigation, poster card / zoom-overlay lookups
// ---------------------------------------------------------------------------

function itemsById(screen) {
  const map = new Map();
  (Array.isArray(screen.items) ? screen.items : []).forEach((item) => {
    if (item?.id) {
      map.set(String(item.id), item);
    }
  });
  screen._phoneCatalogSeeAllItemsById = map;
  return map;
}

function findItemById(screen, id) {
  return screen._phoneCatalogSeeAllItemsById?.get(String(id || "")) || null;
}

function detailNavParams(item, descriptor) {
  return {
    itemId: item.id,
    itemType: item.type || item.catalogType || descriptor.type || "movie",
    fallbackTitle: item.name || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || item.backdrop || "",
    addonBaseUrl: descriptor.addonBaseUrl || item.addonBaseUrl || "",
    addonId: descriptor.addonId || item.addonId || "",
    addonName: descriptor.addonName || item.addonName || "",
    catalogType: descriptor.type || item.catalogType || "movie"
  };
}

function navigateToItem(item, descriptor) {
  if (!item?.id) {
    return false;
  }
  Router.navigate("detail", detailNavParams(item, descriptor));
  return true;
}

function toPosterItem(screen, item) {
  return {
    id: String(item.id || ""),
    posterUrl: item.poster || "",
    title: item.name || "Untitled",
    subtitle: screen.layoutPrefs?.posterLabelsEnabled !== false ? extractReleaseYear(item) : "",
    watched: isTitleItemWatched(item, screen.watchedTitleIds)
  };
}

// ---------------------------------------------------------------------------
// Poster long-press -> zoom overlay
// ---------------------------------------------------------------------------

function openCatalogListPickerSheet(screen, listPickerState) {
  const options = getPosterListPickerOptions(listPickerState);
  openBottomSheet({
    items: options.map((option) => ({
      title: option.label,
      icon: option.selected ? checkmarkIconMarkup() : "",
      onSelect: () => void handleCatalogListPickerOption(screen, listPickerState, option.action)
    }))
  });
}

async function handleCatalogListPickerOption(screen, listPickerState, action) {
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
    openCatalogListPickerSheet(screen, listPickerState);
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
      console.warn("catalogSeeAllScreen: failed to save list membership", error);
      listPickerState.destructiveRemovalRequired =
        error?.code === "SIMKL_DESTRUCTIVE_REMOVAL_REQUIRED";
      openCatalogListPickerSheet(screen, listPickerState);
    }
  }
}

async function handleCatalogZoomAction(screen, item, descriptor, optionsState, action) {
  if (action === "details") {
    navigateToItem(item, descriptor);
    return;
  }
  const result = await activatePosterOption(optionsState, action);
  if (result?.type === "listPicker") {
    openCatalogListPickerSheet(screen, result.state);
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

async function openCatalogItemZoomMenu(screen, cardElement, item) {
  const descriptor = screen.params || {};
  const optionsState = await createPosterOptionsState({
    id: item.id,
    type: item.type || item.catalogType || descriptor.type || "movie",
    title: item.name || "Untitled",
    poster: item.poster || "",
    background: item.background || item.backdrop || "",
    addonBaseUrl: descriptor.addonBaseUrl || item.addonBaseUrl || ""
  });
  if (!optionsState) {
    return;
  }
  const options = getPosterOptions(optionsState);
  const actions = options.map((option) => ({
    id: option.action,
    label: option.label,
    onSelect: () =>
      void handleCatalogZoomAction(screen, item, descriptor, optionsState, option.action)
  }));
  openPosterZoomOverlay({
    posterElement: cardElement,
    posterUrl: item.poster || "",
    title: item.name || "Untitled",
    subtitle: extractReleaseYear(item),
    aspect: "portrait",
    actions
  });
}

// ---------------------------------------------------------------------------
// JSX components
// ---------------------------------------------------------------------------

function Header({ descriptor: _descriptor, title, subtitle }) {
  return (
    <header class="phone-catalog-seeall-header" data-phone-catalog-seeall-header>
      <button
        type="button"
        class="phone-catalog-seeall-back focusable"
        data-action="phoneCatalogSeeAllBack"
        aria-label={t("common.back", {}, "Back")}
      >
        <span dangerouslySetInnerHTML={{ __html: backIconMarkup() }} />
      </button>
      <div class="phone-catalog-seeall-header-text">
        <h1 class="phone-catalog-seeall-title">{title}</h1>
        {subtitle ? <div class="phone-catalog-seeall-subtitle">{subtitle}</div> : null}
      </div>
    </header>
  );
}

function SkeletonGrid() {
  const cardsHtml = Array.from({ length: DISCOVER_INITIAL_SKELETON_COUNT })
    .map(() => renderSkeletonPosterCard({ aspect: "portrait" }))
    .join("");
  return <div class="phone-catalog-seeall-grid" dangerouslySetInnerHTML={{ __html: cardsHtml }} />;
}

function EmptyState() {
  return (
    <div class="phone-catalog-seeall-empty-state">
      <h3 class="phone-catalog-seeall-empty-title">
        {t("catalog_see_all_empty_title", {}, "No items available")}
      </h3>
    </div>
  );
}

function Body({ screen }) {
  const items = Array.isArray(screen.items) ? screen.items : [];
  if (!items.length && screen.loading) {
    return <SkeletonGrid />;
  }
  if (!items.length) {
    return <EmptyState />;
  }
  itemsById(screen);
  const gridHtml = items.map((item) => renderPosterCard(toPosterItem(screen, item))).join("");
  return (
    <>
      <div
        class="phone-catalog-seeall-grid"
        data-phone-catalog-seeall-grid
        dangerouslySetInnerHTML={{ __html: gridHtml }}
      />
      {screen.loading ? (
        <div class="phone-catalog-seeall-loading-footer">
          <span dangerouslySetInnerHTML={{ __html: renderLoadingIndicator() }} />
          <span>{t("discover_loading", {}, "Loading...")}</span>
        </div>
      ) : null}
    </>
  );
}

function CatalogSeeAllScreenPhone({ screen }) {
  const descriptor = screen.params || {};
  const title = descriptor.catalogName || "Catalog";
  const subtitle =
    screen.layoutPrefs?.catalogAddonNameEnabled !== false && descriptor.addonName
      ? t("catalog_see_all_from", [descriptor.addonName], `from ${descriptor.addonName}`)
      : "";
  return (
    <div class="phone-catalog-seeall-root" data-phone-catalog-seeall-root>
      <Header descriptor={descriptor} title={title} subtitle={subtitle} />
      <div class="phone-catalog-seeall-scroll" data-phone-catalog-seeall-scroll>
        <div class="phone-catalog-seeall-grid-wrap" data-phone-catalog-seeall-grid-wrap>
          <Body screen={screen} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tap dispatch (shared onPointerActivate contract)
// ---------------------------------------------------------------------------

function handlePointerActivate(screen, target) {
  const action = String(target?.dataset?.action || "");
  if (!action) {
    return false;
  }
  if (action === "phoneCatalogSeeAllBack") {
    Router.back();
    return true;
  }
  if (action === "openDetail") {
    const item = findItemById(screen, target.dataset.id);
    if (!item) {
      return false;
    }
    return navigateToItem(item, screen.params || {});
  }
  return false;
}

// ---------------------------------------------------------------------------
// Post-mount measure / scroll-preserve / long-press wiring / cleanup
// ---------------------------------------------------------------------------

function applyHeaderPadding(container) {
  const header = container.querySelector("[data-phone-catalog-seeall-header]");
  const gridWrap = container.querySelector("[data-phone-catalog-seeall-grid-wrap]");
  if (!header || !gridWrap) {
    return;
  }
  gridWrap.style.paddingTop = `${header.offsetHeight}px`;
}

function bindGridLongPress(screen, container) {
  screen._phoneCatalogSeeAllGridDetach?.();
  screen._phoneCatalogSeeAllGridDetach = bindPosterCardEvents(
    container.querySelector("[data-phone-catalog-seeall-grid]"),
    {
      onLongPress: (id, cardElement) => {
        const item = findItemById(screen, id);
        if (item) {
          void openCatalogItemZoomMenu(screen, cardElement, item);
        }
      }
    }
  );
  return screen._phoneCatalogSeeAllGridDetach;
}

// Windowing: when the list outgrows the threshold, only the visible row
// window stays mounted. Scroll position, paging, and bindings are preserved
// because spacers keep full-list scroll height and the window re-applies
// from the last known scrollTop after every render.
function gridWindowGeometry(container) {
  const grid = container.querySelector("[data-phone-catalog-seeall-grid]");
  const scroller = container.querySelector("[data-phone-catalog-seeall-scroll]");
  if (!grid || !scroller) {
    return null;
  }
  return { grid, scroller, ...measureGrid(grid) };
}

function applyGridWindow(screen, container, scrollTop) {
  const items = Array.isArray(screen.items) ? screen.items : [];
  const geometry = gridWindowGeometry(container);
  if (!geometry || !shouldWindow(items.length)) {
    screen._phoneCatalogSeeAllWindow = null;
    return false;
  }
  screen._phoneCatalogSeeAllGridGeometry = geometry;
  const range = computeWindow({
    itemCount: items.length,
    columns: geometry.columns,
    rowHeight: geometry.rowHeight,
    rowGap: geometry.rowGap,
    scrollTop,
    viewportHeight: geometry.scroller.clientHeight || 600
  });
  const key = `${range.startIndex}:${range.endIndex}`;
  if (screen._phoneCatalogSeeAllWindow === key) {
    return true;
  }
  screen._phoneCatalogSeeAllWindow = key;
  renderWindowedGrid(geometry.grid, {
    items,
    renderCard: (item) => renderPosterCard(toPosterItem(screen, item)),
    window
  });
  bindGridLongPress(screen, container);
  return true;
}

function mountPhoneInteractivity(screen, container) {
  cleanupPhoneInteractivity(screen);

  applyHeaderPadding(container);

  const scroller = container.querySelector("[data-phone-catalog-seeall-scroll]");
  if (scroller && Number.isFinite(screen._phoneCatalogSeeAllScrollTop)) {
    scroller.scrollTop = screen._phoneCatalogSeeAllScrollTop;
  }
  screen._phoneCatalogSeeAllWindow = null;
  const windowed = applyGridWindow(screen, container, scroller?.scrollTop || 0);
  if (!windowed) {
    bindGridLongPress(screen, container);
  }
  const handleScroll = () => {
    if (!scroller) {
      return;
    }
    screen._phoneCatalogSeeAllScrollTop = scroller.scrollTop;
    applyGridWindow(screen, container, scroller.scrollTop);
    if (screen.loading || !screen.hasMore) {
      return;
    }
    const remaining = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    if (remaining <= SCROLL_LOAD_THRESHOLD_PX) {
      void screen.loadNextPage({ preserveViewport: true });
    }
  };
  scroller?.addEventListener("scroll", handleScroll, { passive: true });

  // Card heights settle as lazy images load (and on rotation): re-measure
  // debounced and re-apply the window at the current scrollTop.
  let geometryTimer = 0;
  const remeasure = () => {
    globalThis.clearTimeout?.(geometryTimer);
    geometryTimer = globalThis.setTimeout?.(() => {
      const next = gridWindowGeometry(container);
      if (!next) {
        return;
      }
      const prev = screen._phoneCatalogSeeAllGridGeometry || {};
      screen._phoneCatalogSeeAllGridGeometry = next;
      if (Math.abs((next.rowHeight || 0) - (prev.rowHeight || 0)) > 4) {
        screen._phoneCatalogSeeAllWindow = null;
        applyGridWindow(screen, container, scroller?.scrollTop || 0);
      }
    }, 250);
  };
  const grid = container.querySelector("[data-phone-catalog-seeall-grid]");
  grid?.addEventListener("load", remeasure, { capture: true, passive: true });
  globalThis.addEventListener?.("resize", remeasure);

  const teardown = () => {
    scroller?.removeEventListener("scroll", handleScroll);
    grid?.removeEventListener("load", remeasure, { capture: true });
    globalThis.removeEventListener?.("resize", remeasure);
    globalThis.clearTimeout?.(geometryTimer);
    screen._phoneCatalogSeeAllGridDetach?.();
    screen._phoneCatalogSeeAllGridDetach = null;
    screen._phoneCatalogSeeAllWindow = null;
  };
  screen._phoneCatalogSeeAllTeardown = teardown;
  return teardown;
}

function cleanupPhoneInteractivity(screen) {
  screen._phoneCatalogSeeAllTeardown?.();
  screen._phoneCatalogSeeAllTeardown = null;
}

// ---------------------------------------------------------------------------
// Screen singleton
// ---------------------------------------------------------------------------

export const CatalogSeeAllScreen = {
  getRouteStateKey(params = {}) {
    const addonBaseUrl = String(params?.addonBaseUrl || "").trim();
    const catalogId = String(params?.catalogId || "").trim();
    const type = String(params?.type || "movie").trim() || "movie";
    if (!addonBaseUrl || !catalogId) {
      return null;
    }
    return `catalogSeeAll:${addonBaseUrl}:${catalogId}:${type}`;
  },

  captureRouteState() {
    this.captureViewState();
    return {
      params: this.params ? { ...this.params } : {},
      items: Array.isArray(this.items) ? [...this.items] : [],
      nextSkip: Number(this.nextSkip || 0),
      hasMore: Boolean(this.hasMore),
      lastFocusedKey: this.lastFocusedKey ? String(this.lastFocusedKey) : null,
      savedScrollTop: Number(this.savedScrollTop || 0)
    };
  },

  hydrateFromRouteState(restoredState = null, params = {}) {
    const snapshot = restoredState && typeof restoredState === "object" ? restoredState : null;
    if (!snapshot?.params) {
      return false;
    }
    const currentKey = this.getRouteStateKey(params);
    const snapshotKey = this.getRouteStateKey(snapshot.params);
    if (!currentKey || !snapshotKey || currentKey !== snapshotKey) {
      return false;
    }
    this.params = params || {};
    this.items = Array.isArray(snapshot.items) ? [...snapshot.items] : [];
    this.nextSkip = Number(snapshot.nextSkip || 0);
    this.hasMore = Boolean(snapshot.hasMore);
    this.lastFocusedKey = snapshot.lastFocusedKey ? String(snapshot.lastFocusedKey) : null;
    this.savedScrollTop = Number(snapshot.savedScrollTop || 0);
    this.pendingRestoreFocus = true;
    this.preserveViewportOnNextRender = false;
    return true;
  },

  async refreshWatchedTitleIds() {
    const watchedItems = await watchedItemsRepository.getAll(5000).catch(() => []);
    this.watchedTitleIds = buildWatchedTitleIdSet(watchedItems);
  },

  async mount(params = {}, navigationContext = {}) {
    this.container = document.getElementById("catalogSeeAll");
    ScreenUtils.show(this.container);
    this.params = params || {};
    this.items = Array.isArray(params?.initialItems) ? [...params.initialItems] : [];
    this.nextSkip = this.items.length ? 100 : 0;
    this.layoutPrefs = LayoutPreferences.get();
    this.loading = false;
    this.hasMore = true;
    this.lastFocusedKey = this.items[0]?.id ? `item:${this.items[0].id}` : null;
    this.pendingRestoreFocus = false;
    this.preserveViewportOnNextRender = false;
    this.savedScrollTop = 0;
    this.loadToken = (this.loadToken || 0) + 1;
    await this.refreshWatchedTitleIds();

    if (
      navigationContext?.isBackNavigation &&
      this.hydrateFromRouteState(navigationContext?.restoredState || null, params)
    ) {
      this.loading = false;
      this.render();
      return;
    }

    this.render();
    if (!this.items.length) {
      await this.loadNextPage();
    }
  },

  async loadNextPage({ preserveViewport = false } = {}) {
    if (this.loading || !this.hasMore) {
      return;
    }
    const descriptor = this.params || {};
    if (!descriptor.addonBaseUrl || !descriptor.catalogId || !descriptor.type) {
      this.hasMore = false;
      this.render();
      return;
    }
    this.loading = true;
    this.captureViewState();
    this.pendingRestoreFocus = true;
    this.preserveViewportOnNextRender = Boolean(preserveViewport);
    if (!preserveViewport) {
      this.render();
    }
    const token = this.loadToken;
    const skip = Math.max(0, Number(this.nextSkip || 0));
    const result = await catalogRepository.getCatalog({
      addonBaseUrl: descriptor.addonBaseUrl,
      addonId: descriptor.addonId,
      addonName: descriptor.addonName,
      catalogId: descriptor.catalogId,
      catalogName: descriptor.catalogName,
      type: descriptor.type,
      skip,
      supportsSkip: true
    });
    if (token !== this.loadToken) {
      return;
    }
    if (result.status !== "success") {
      this.loading = false;
      this.hasMore = false;
      this.preserveViewportOnNextRender = false;
      this.render();
      return;
    }
    const incoming = Array.isArray(result?.data?.items) ? result.data.items : [];
    let addedCount = 0;
    if (incoming.length) {
      const seen = new Set(this.items.map((item) => item.id));
      incoming.forEach((item) => {
        if (!item?.id || seen.has(item.id)) {
          return;
        }
        seen.add(item.id);
        this.items.push(item);
        addedCount += 1;
      });
      this.nextSkip = skip + 100;
    }
    this.hasMore = incoming.length > 0;
    this.loading = false;
    this.pendingRestoreFocus = true;
    this.preserveViewportOnNextRender = Boolean(preserveViewport && addedCount > 0);
    this.render();
  },

  captureViewState() {
    const shell = this.container?.querySelector(".seeall-shell");
    if (shell) {
      this.savedScrollTop = shell.scrollTop;
    }
    const focused = this.container?.querySelector(".seeall-card.focused");
    if (focused?.dataset?.focusKey) {
      this.lastFocusedKey = focused.dataset.focusKey;
    }
  },

  render() {
    if (!this.container) {
      return;
    }
    if (this._unmountPhone) {
      this._unmountPhone();
    }
    this._unmountPhone = mountPreact(h(CatalogSeeAllScreenPhone, { screen: this }), this.container);
    mountPhoneInteractivity(this, this.container);
  },

  async onKeyDown(event) {
    if (isBackEvent(event)) {
      event?.preventDefault?.();
      Router.back();
    }
  },

  onPointerActivate(target) {
    return handlePointerActivate(this, target);
  },

  consumeBackRequest() {
    return false;
  },

  cleanup() {
    cleanupPhoneInteractivity(this);
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    this.loadToken = (this.loadToken || 0) + 1;
    ScreenUtils.hide(this.container);
  }
};
