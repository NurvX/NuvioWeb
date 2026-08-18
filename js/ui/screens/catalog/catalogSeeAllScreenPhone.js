import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { extractReleaseYear } from "./catalogSeeAllScreen.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import { renderSkeletonPosterCard } from "../../components/phoneSkeleton.js";
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

// Phone render path for js/ui/screens/catalog/catalogSeeAllScreen.js (ticket 03-03, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; catalogSeeAllScreen.js's own `render()` only has a guard clause that
// dispatches here when `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()` add
// a `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders.
//
// Pagination reuses `screen.loadNextPage(...)` — the TV screen's own existing async method —
// completely unchanged: our own scroll-near-bottom listener just calls
// `screen.loadNextPage({ preserveViewport: true })`, exactly the same call TV's own D-pad/scroll
// auto-load paths already make. That method itself calls `screen.render()` at a couple of points
// (to show a loading state, then again once new items land) which, in phone mode, re-dispatches
// back into this module's own `renderCatalogSeeAllScreenPhone`/`mountCatalogSeeAllScreenPhone` —
// a full markup rebuild, same as every other phone module. Because that rebuild can be triggered
// mid-scroll (by `loadNextPage` itself, not by anything this module calls directly), this module
// persists the scroll container's `scrollTop` on `screen._phoneCatalogSeeAllScrollTop` on every
// scroll event and re-applies it immediately after every mount, so an infinite-scroll page load
// never visibly resets the user's scroll position.
//
// The floating header sits outside the scroll container (`position: absolute` within the
// screen's own `position: relative` root, not `position: fixed` against the viewport — see
// css/phone.css) so the grid can scroll underneath its transparent-to-opaque gradient. Its
// height is measured after every mount and applied as the grid wrap's `padding-top` so the
// first row of posters starts just below the header on initial paint.
//
// Long-press opens the same `posterZoomOverlay.js` ticket 01-01 introduced, with an actions list
// built from `posterOptionsMenu.js`'s exported, screen-agnostic helpers
// (`createPosterOptionsState`/`getPosterOptions`/`activatePosterOption`/
// `getPosterListPickerOptions`) — the exact same functions `catalogSeeAllScreen.js`'s own TV
// long-press menu (`openPosterOptionsMenu`, via `PosterOptionsDialogController`) already calls,
// rendered through the zoom overlay (and, for the rare multi-Trakt/Simkl-list case, a
// `bottomSheet.js` checklist) instead of `NuvioDialog`, the same substitution
// `libraryScreenPhone.js` makes for its own poster long-press menu. `extractReleaseYear` is the
// one pure helper this module needs from the TV screen file, so it was exported there rather
// than duplicated here (see this ticket's diff to catalogSeeAllScreen.js).

const SCROLL_LOAD_THRESHOLD_PX = 640;
const DISCOVER_INITIAL_SKELETON_COUNT = 9;

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
// Item shaping, navigation, poster card / zoom-overlay lookups
// ---------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------
// Poster long-press -> zoom overlay (reuses posterOptionsMenu.js's own business logic, see
// file header comment).
// ---------------------------------------------------------------------------------------

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
      console.warn("catalogSeeAllScreenPhone: failed to save list membership", error);
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

// ---------------------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------------------

function renderHeader(descriptor, title, subtitle) {
  return `
    <header class="phone-catalog-seeall-header" data-phone-catalog-seeall-header>
      <button
        type="button"
        class="phone-catalog-seeall-back focusable"
        data-action="phoneCatalogSeeAllBack"
        aria-label="${escapeHtml(t("common.back", {}, "Back"))}"
      >
        ${backIconMarkup()}
      </button>
      <div class="phone-catalog-seeall-header-text">
        <h1 class="phone-catalog-seeall-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="phone-catalog-seeall-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
    </header>
  `;
}

function renderSkeletonGrid() {
  const cards = Array.from({ length: DISCOVER_INITIAL_SKELETON_COUNT })
    .map(() => renderSkeletonPosterCard({ aspect: "portrait" }))
    .join("");
  return `<div class="phone-catalog-seeall-grid">${cards}</div>`;
}

function renderEmptyState() {
  return `
    <div class="phone-catalog-seeall-empty-state">
      <h3 class="phone-catalog-seeall-empty-title">${escapeHtml(t("catalog_see_all_empty_title", {}, "No items available"))}</h3>
    </div>
  `;
}

function renderBody(screen) {
  const items = Array.isArray(screen.items) ? screen.items : [];
  if (!items.length && screen.loading) {
    return renderSkeletonGrid();
  }
  if (!items.length) {
    return renderEmptyState();
  }
  itemsById(screen);
  return `
    <div class="phone-catalog-seeall-grid" data-phone-catalog-seeall-grid>
      ${items.map((item) => renderPosterCard(toPosterItem(screen, item))).join("")}
    </div>
    ${
      screen.loading
        ? `
      <div class="phone-catalog-seeall-loading-footer">
        ${renderLoadingIndicator()}
        <span>${escapeHtml(t("discover_loading", {}, "Loading..."))}</span>
      </div>
    `
        : ""
    }
  `;
}

/** Returns the full phone catalog "see all" screen markup. Reads `screen.params`/`screen.items`/
 * `screen.loading`/`screen.hasMore`/`screen.layoutPrefs`/`screen.watchedTitleIds` directly — all
 * populated by `catalogSeeAllScreen.js`'s existing `mount()`/`loadNextPage()` data flow, unrelated
 * to the TV-only `.seeall-*` DOM this module never touches. */
export function renderCatalogSeeAllScreenPhone(screen) {
  const descriptor = screen.params || {};
  const title = descriptor.catalogName || "Catalog";
  const subtitle =
    screen.layoutPrefs?.catalogAddonNameEnabled !== false && descriptor.addonName
      ? t("catalog_see_all_from", [descriptor.addonName], `from ${descriptor.addonName}`)
      : "";
  return `
    <div class="phone-catalog-seeall-root" data-phone-catalog-seeall-root>
      ${renderHeader(descriptor, title, subtitle)}
      <div class="phone-catalog-seeall-scroll" data-phone-catalog-seeall-scroll>
        <div class="phone-catalog-seeall-grid-wrap" data-phone-catalog-seeall-grid-wrap>
          ${renderBody(screen)}
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Tap dispatch (shared onPointerActivate contract)
// ---------------------------------------------------------------------------------------

export function handleCatalogSeeAllPhonePointerActivate(screen, target) {
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

// ---------------------------------------------------------------------------------------
// Mount / measure / scroll-preserve / cleanup
// ---------------------------------------------------------------------------------------

function applyHeaderPadding(container) {
  const header = container.querySelector("[data-phone-catalog-seeall-header]");
  const gridWrap = container.querySelector("[data-phone-catalog-seeall-grid-wrap]");
  if (!header || !gridWrap) {
    return;
  }
  gridWrap.style.paddingTop = `${header.offsetHeight}px`;
}

function bindGridLongPress(screen, container) {
  return bindPosterCardEvents(container.querySelector("[data-phone-catalog-seeall-grid]"), {
    onLongPress: (id, cardElement) => {
      const item = findItemById(screen, id);
      if (item) {
        void openCatalogItemZoomMenu(screen, cardElement, item);
      }
    }
  });
}

/** Wires the phone catalog "see all" screen's interactivity after
 * `renderCatalogSeeAllScreenPhone`'s markup has been inserted into `container`. Returns a
 * teardown function; also stores it on `screen._phoneCatalogSeeAllTeardown` so
 * `cleanupCatalogSeeAllScreenPhone(screen)` can call it without the caller needing to keep the
 * reference itself. */
export function mountCatalogSeeAllScreenPhone(screen, container) {
  cleanupCatalogSeeAllScreenPhone(screen);

  applyHeaderPadding(container);

  const scroller = container.querySelector("[data-phone-catalog-seeall-scroll]");
  if (scroller && Number.isFinite(screen._phoneCatalogSeeAllScrollTop)) {
    scroller.scrollTop = screen._phoneCatalogSeeAllScrollTop;
  }
  const handleScroll = () => {
    if (!scroller) {
      return;
    }
    screen._phoneCatalogSeeAllScrollTop = scroller.scrollTop;
    if (screen.loading || !screen.hasMore) {
      return;
    }
    const remaining = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    if (remaining <= SCROLL_LOAD_THRESHOLD_PX) {
      void screen.loadNextPage({ preserveViewport: true });
    }
  };
  scroller?.addEventListener("scroll", handleScroll, { passive: true });

  const detachLongPress = bindGridLongPress(screen, container);

  const teardown = () => {
    scroller?.removeEventListener("scroll", handleScroll);
    detachLongPress();
  };
  screen._phoneCatalogSeeAllTeardown = teardown;
  return teardown;
}

/** Tears down whatever `mountCatalogSeeAllScreenPhone` last wired up, if anything. Safe to call
 * when nothing is mounted. Deliberately does not touch `screen._phoneCatalogSeeAllScrollTop` —
 * that value needs to survive across the repeated mount/teardown cycles `loadNextPage`'s own
 * `render()` calls trigger mid-scroll. */
export function cleanupCatalogSeeAllScreenPhone(screen) {
  screen._phoneCatalogSeeAllTeardown?.();
  screen._phoneCatalogSeeAllTeardown = null;
}
