import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { attachPager } from "../../navigation/gestureEngine.js";
import {
  renderPhoneShelf,
  bindPhoneShelfEvents,
  defaultPhoneShelfViewAllLabel
} from "../../components/phoneShelf.js";
import { renderPhoneNavBar, bindPhoneNavBarEvents } from "../../components/phoneNavBar.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { formatCatalogRowTitle } from "./homeUtils.js";
import { normalizeHomeRowItem } from "./homeScreen.js";
import { savedLibraryRepository } from "../../../data/repository/savedLibraryRepository.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import {
  libraryRepository,
  LibrarySourceMode
} from "../../../data/repository/libraryRepository.js";

// Phone render path for js/ui/screens/home/homeScreen.js (ticket 01-01, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; homeScreen.js's own `render()` only has a guard clause that dispatches
// here when `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()` add a
// `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders. Every function below takes the `HomeScreen` singleton itself (`screen`, i.e. its
// own `this`) so it can call the screen's already-existing async mutation methods
// (`togglePosterLibrary`/`togglePosterWatched`/`openPosterListPicker`/
// `removeContinueWatchingItem`/`openContinueWatchingFromItem`) directly, rather than
// duplicating any of that logic here — see the file's own header comment on those methods for
// what each one does. `screen.rows`/`screen.heroCandidates`/`screen.continueWatchingDisplay`/
// `screen.sidebarProfile`/`screen.catalogSeeAllMap` are populated by the screen's existing
// `mount()` data-fetching flow, independent of layoutMode — this module only reads them, it
// does not fetch anything itself.

const HERO_AUTO_ADVANCE_MS = 8000;
const CONTINUE_WATCHING_REMOVE_MS = 350;

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

function isSeriesType(type) {
  return ["series", "tv", "anime"].includes(String(type || "").toLowerCase());
}

function typeLabel(item) {
  if (item?.type === "collection_folder") {
    return "";
  }
  return isSeriesType(item?.type) ? t("type_series", {}, "Series") : t("type_movie", {}, "Movie");
}

function extractYear(releaseInfo) {
  const match = String(releaseInfo || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function buildHeroMetaLine(item) {
  const parts = [
    typeLabel(item),
    Array.isArray(item?.genres) ? item.genres[0] : "",
    extractYear(item?.releaseInfo),
    item?.imdbRating ? `★ ${item.imdbRating}` : ""
  ].filter(Boolean);
  return parts.join("  •  ");
}

/** Navigation params for `Router.navigate("detail", ...)`, matching the exact shape the TV
 * poster-hold-menu and continue-watching flows already use (see ticket 01-01's research
 * notes) — reused as-is so Detail receives the fields it already expects. */
function detailNavParams(item) {
  return {
    itemId: item.id,
    itemType: item.type || "movie",
    fallbackTitle: item.name || item.title || item.id || "Untitled",
    fallbackPoster: item.poster || "",
    fallbackBackground: item.background || item.backdrop || "",
    addonBaseUrl: item.addonBaseUrl || "",
    addonId: item.addonId || "",
    addonName: item.addonName || "",
    catalogType: item.catalogType || item.type || "movie"
  };
}

function navigateToItem(screen, item) {
  if (!item?.id) {
    return;
  }
  if (item.type === "collection_folder") {
    Router.navigate("folderDetail", {
      collectionId: item.collectionId,
      folderId: item.folderId,
      collectionTitle: item.collectionTitle || ""
    });
    return;
  }
  if (item.heroSource === "continueWatching") {
    screen.openContinueWatchingFromItem(item);
    return;
  }
  Router.navigate("detail", detailNavParams(item));
}

// ---------------------------------------------------------------------------------------
// Hero pager
// ---------------------------------------------------------------------------------------

function renderHeroSlide(item, index) {
  const backdrop = item.background || item.backdrop || item.landscapePoster || item.poster || "";
  const heroTitle = item.heroTitle || item.name || item.title || "";
  const metaLine = buildHeroMetaLine(item);
  return `
    <div class="phone-hero-slide${index === 0 ? " active" : ""}" data-hero-slide="${index}">
      ${
        backdrop
          ? `<img class="phone-hero-bg" src="${escapeHtml(backdrop)}" alt="" loading="${index === 0 ? "eager" : "lazy"}" />`
          : `<div class="phone-hero-bg phone-hero-bg-empty" aria-hidden="true"></div>`
      }
      <div class="phone-hero-scrim" aria-hidden="true"></div>
      <div class="phone-hero-content">
        ${
          item.logo
            ? `<img class="phone-hero-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(heroTitle)}" />`
            : `<h1 class="phone-hero-title">${escapeHtml(heroTitle)}</h1>`
        }
        ${metaLine ? `<div class="phone-hero-meta">${escapeHtml(metaLine)}</div>` : ""}
        <button type="button" class="phone-hero-cta" data-hero-cta="${index}">
          ${escapeHtml(t("common.viewDetails", {}, "View Details"))}
        </button>
      </div>
    </div>
  `;
}

function renderHeroPager(heroItems) {
  if (!heroItems.length) {
    return "";
  }
  const slidesMarkup = heroItems.map((item, index) => renderHeroSlide(item, index)).join("");
  const dotsMarkup =
    heroItems.length > 1
      ? `
        <div class="phone-hero-dots" data-hero-dots>
          ${heroItems
            .map(
              (_, index) => `
            <button type="button"
                    class="phone-hero-dot${index === 0 ? " active" : ""}"
                    data-hero-dot="${index}"
                    aria-label="${escapeHtml(t("common.viewDetails", {}, "View Details"))} ${index + 1}"
            ></button>
          `
            )
            .join("")}
        </div>
      `
      : "";
  return `
    <section class="phone-hero" data-phone-hero>
      ${slidesMarkup}
      ${dotsMarkup}
    </section>
  `;
}

function setActiveHeroIndex(container, index) {
  const hero = container.querySelector("[data-phone-hero]");
  if (!hero) {
    return;
  }
  hero.querySelectorAll("[data-hero-slide]").forEach((slide) => {
    slide.classList.toggle("active", Number(slide.dataset.heroSlide) === index);
  });
  hero.querySelectorAll("[data-hero-dot]").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.heroDot) === index);
  });
}

function bindHeroPager(screen, container, heroItems) {
  const hero = container.querySelector("[data-phone-hero]");
  if (!hero || heroItems.length < 2) {
    return () => {};
  }

  const detachPager = attachPager(hero, {
    itemWidth: hero.offsetWidth || window.innerWidth || 1,
    autoAdvanceMs: HERO_AUTO_ADVANCE_MS,
    getItemCount: () => heroItems.length,
    onIndexChange: (index) => setActiveHeroIndex(container, index)
  });

  const dotButtons = Array.from(hero.querySelectorAll("[data-hero-dot]"));
  dotButtons.forEach((dot) => {
    dot.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveHeroIndex(container, Number(dot.dataset.heroDot || 0));
    };
  });

  const ctaButtons = Array.from(hero.querySelectorAll("[data-hero-cta]"));
  ctaButtons.forEach((cta) => {
    cta.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(cta.dataset.heroCta || 0);
      navigateToItem(screen, heroItems[index]);
    };
  });

  return () => {
    detachPager();
    dotButtons.forEach((dot) => {
      dot.onclick = null;
    });
    ctaButtons.forEach((cta) => {
      cta.onclick = null;
    });
  };
}

// ---------------------------------------------------------------------------------------
// Continue Watching + catalog/collection shelves
// ---------------------------------------------------------------------------------------

function continueWatchingShelfItem(item) {
  const image = item.thumbnail || item.backdrop || item.poster || item.landscapePoster || "";
  const subtitle = item.episodeCode
    ? [item.episodeCode, item.episodeTitle].filter(Boolean).join(" • ")
    : item.episodeTitle || "";
  return {
    id: item.contentId,
    posterUrl: image,
    title: item.title || item.name || "",
    subtitle,
    progress: Number.isFinite(item.progressFraction) ? item.progressFraction : null
  };
}

// Collection-folder items (rowKind "collection", or individually flagged via
// isCollectionFolderItem — see normalizeCollectionFolderItem in homeScreen.js) carry a
// custom-authored banner cover, not real artwork — a LANDSCAPE tileShape must render at a
// 16:9 aspect with no cropping (`fit: "fill"`), matching what the TV/desktop
// `.home-collection-card.is-collection-landscape` styling already does in css/components.css.
// Cropping a LANDSCAPE banner into the default portrait card (the old behavior) chopped off
// whatever logo/text sits near its edges.
function catalogShelfItem(item) {
  const isLandscapeCollectionFolder =
    item.type === "collection_folder" && item.tileShape === "LANDSCAPE";
  return {
    id: item.id,
    posterUrl: item.poster || item.landscapePoster || "",
    title: item.name || item.title || "",
    subtitle: "",
    ...(isLandscapeCollectionFolder ? { aspect: "landscape", fit: "fill" } : {})
  };
}

/** Builds the phone-shaped shelf list from `screen.rows`, mirroring the exact seeAllId/
 * viewAll param shape `homeScreen.js`'s own TV rendering already builds for
 * `catalogSeeAllMap` (see ticket 01-01's research notes) — collection rows never get a "view
 * all" pill on TV either, so this doesn't invent one for them. */
function buildCatalogRows(screen) {
  const rows = Array.isArray(screen.rows) ? screen.rows : [];
  return rows
    .map((row) => {
      const isCollectionRow = row?.rowKind === "collection";
      const rawItems = Array.isArray(row?.result?.data?.items) ? row.result.data.items : [];
      if (row?.result?.status === "loading" || !rawItems.length) {
        return null;
      }
      const items = rawItems
        .map((item) => normalizeHomeRowItem(row, item))
        .filter((item) => item?.id);
      if (!items.length) {
        return null;
      }
      const title = isCollectionRow
        ? String(row.collectionTitle || row.collection?.title || "Collection")
        : formatCatalogRowTitle(row.catalogName, row.type);
      const viewAll = isCollectionRow
        ? null
        : {
            addonBaseUrl: row.addonBaseUrl || "",
            addonId: row.addonId || "",
            addonName: row.addonName || "",
            catalogId: row.catalogId || "",
            catalogName: row.catalogName || "",
            type: row.type || "movie",
            initialItems: rawItems
          };
      return {
        id: String(
          row.homeCatalogKey ||
            `${row.addonId || "addon"}_${row.catalogId || "catalog"}_${row.type || "movie"}`
        ),
        title,
        items,
        viewAll
      };
    })
    .filter(Boolean);
}

function renderCatalogShelves(catalogRows) {
  return catalogRows
    .map((row) =>
      renderPhoneShelf({
        id: row.id,
        title: row.title,
        items: row.items.map(catalogShelfItem),
        variant: "portrait",
        viewAllLabel: row.viewAll ? defaultPhoneShelfViewAllLabel() : ""
      })
    )
    .join("");
}

// ---------------------------------------------------------------------------------------
// Poster long-press -> zoom overlay
// ---------------------------------------------------------------------------------------

async function buildZoomActions(screen, item, { isContinueWatching = false } = {}) {
  const actions = [
    {
      id: "details",
      label: t("cw_action_go_to_details", {}, "Go to details"),
      onSelect: () => navigateToItem(screen, item)
    }
  ];

  if (item.type === "collection_folder") {
    return actions;
  }

  const [isSaved, isWatched, librarySourceMode] = await Promise.all([
    savedLibraryRepository.isSaved(item.id).catch(() => false),
    watchedItemsRepository.isWatched(item.id).catch(() => false),
    libraryRepository.getSourceMode().catch(() => LibrarySourceMode.LOCAL)
  ]);

  const isRemoteLibrary = librarySourceMode !== LibrarySourceMode.LOCAL;
  actions.push({
    id: "library",
    label: isRemoteLibrary
      ? t("library_manage_lists", {}, "Manage Lists")
      : isSaved
        ? t("hero_remove_from_library", {}, "Remove from library")
        : t("hero_add_to_library", {}, "Add to library"),
    onSelect: () =>
      isRemoteLibrary
        ? screen.openPosterListPicker(item)
        : screen.togglePosterLibrary(item).then(() => screen.requestRender())
  });

  const watchable = isSeriesType(item.type) || String(item.type || "").toLowerCase() === "movie";
  if (watchable) {
    actions.push({
      id: "watched",
      label: isWatched
        ? t("hero_mark_unwatched", {}, "Mark as unwatched")
        : t("hero_mark_watched", {}, "Mark as watched"),
      onSelect: () => screen.togglePosterWatched(item).then(() => screen.requestRender())
    });
  }

  if (isContinueWatching) {
    actions.push({
      id: "remove",
      label: t("cw_action_remove", {}, "Remove"),
      destructive: true,
      onSelect: () => removeContinueWatchingWithAnimation(screen, item)
    });
  }

  return actions;
}

function removeContinueWatchingWithAnimation(screen, item) {
  const card = document.querySelector(
    `.phone-shelf-continuous [data-id="${CSS.escape(String(item.contentId || item.id || ""))}"]`
  );
  const posterNode = card?.closest(".phone-poster") || null;
  if (!posterNode) {
    return screen.removeContinueWatchingItem(item).then(() => screen.requestRender());
  }
  posterNode.classList.add("phone-poster-removing");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      screen
        .removeContinueWatchingItem(item)
        .then(() => screen.requestRender())
        .finally(resolve);
    }, CONTINUE_WATCHING_REMOVE_MS);
  });
}

function openZoomForItem(screen, cardElement, item, { isContinueWatching = false } = {}) {
  if (!item?.id) {
    return;
  }
  const title = item.title || item.name || "";
  const subtitle = isContinueWatching
    ? [item.episodeCode, item.episodeTitle].filter(Boolean).join(" • ")
    : buildHeroMetaLine(item);
  const posterUrl = isContinueWatching
    ? item.thumbnail || item.backdrop || item.poster || ""
    : item.poster || item.landscapePoster || "";

  void buildZoomActions(screen, item, { isContinueWatching }).then((actions) => {
    openPosterZoomOverlay({
      posterElement: cardElement,
      posterUrl,
      title,
      subtitle,
      aspect: isContinueWatching ? "landscape" : "portrait",
      actions
    });
  });
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone home screen markup. Reads `screen.heroCandidates`,
 * `screen.continueWatchingDisplay`, `screen.rows` and `screen.sidebarProfile` directly — all
 * populated by `homeScreen.js`'s existing `mount()` data flow, unrelated to layoutMode. */
export function renderHomeScreenPhone(screen) {
  const heroItems = Array.isArray(screen.heroCandidates) ? screen.heroCandidates : [];
  const continueWatchingItems = Array.isArray(screen.continueWatchingDisplay)
    ? screen.continueWatchingDisplay
    : [];
  const catalogRows = buildCatalogRows(screen);

  const continueWatchingMarkup = continueWatchingItems.length
    ? renderPhoneShelf({
        id: "continue_watching",
        title: t("home.continueWatching", {}, "Continue Watching"),
        items: continueWatchingItems.map(continueWatchingShelfItem),
        variant: "continueWatching"
      })
    : "";

  return `
    <div class="phone-home-scroll" data-phone-home-scroll>
      ${renderHeroPager(heroItems)}
      <div class="phone-home-shelves">
        ${continueWatchingMarkup}
        ${renderCatalogShelves(catalogRows)}
      </div>
    </div>
    ${renderPhoneNavBar({ selectedRoute: "home", profileState: screen.sidebarProfile })}
  `;
}

/** Wires the phone home screen's interactivity after `renderHomeScreenPhone`'s markup has
 * been inserted into `container`. Returns a teardown function; also stores it on
 * `screen._phoneHomeTeardown` so `cleanupHomeScreenPhone(screen)` can call it without the
 * caller needing to keep the reference itself. */
export function mountHomeScreenPhone(screen, container) {
  cleanupHomeScreenPhone(screen);

  const heroItems = Array.isArray(screen.heroCandidates) ? screen.heroCandidates : [];
  const continueWatchingItems = Array.isArray(screen.continueWatchingDisplay)
    ? screen.continueWatchingDisplay
    : [];
  const catalogRows = buildCatalogRows(screen);

  const detachHeroPager = bindHeroPager(screen, container, heroItems);

  const detachContinueWatchingShelf = bindPhoneShelfEvents(
    container.querySelector('[data-shelf-id="continue_watching"]'),
    {
      onLongPress: (id, cardElement) => {
        const item = continueWatchingItems.find((entry) => String(entry.contentId) === String(id));
        if (item) {
          openZoomForItem(screen, cardElement, item, { isContinueWatching: true });
        }
      }
    }
  );

  const detachCatalogShelves = catalogRows.map((row) =>
    bindPhoneShelfEvents(container.querySelector(`[data-shelf-id="${row.id}"]`), {
      onViewAll: row.viewAll ? () => Router.navigate("catalogSeeAll", row.viewAll) : undefined,
      onLongPress: (id, cardElement) => {
        const item = row.items.find((entry) => String(entry.id) === String(id));
        if (item) {
          openZoomForItem(screen, cardElement, item, { isContinueWatching: false });
        }
      }
    })
  );

  const detachNavBar = bindPhoneNavBarEvents(container, {
    currentRoute: "home",
    scrollRoot: container.querySelector("[data-phone-home-scroll]")
  });

  const teardown = () => {
    detachHeroPager();
    detachContinueWatchingShelf();
    detachCatalogShelves.forEach((detach) => detach());
    detachNavBar();
  };

  screen._phoneHomeTeardown = teardown;
  return teardown;
}

/** Handles a tap on any `.focusable[data-action]` target inside the phone home screen,
 * dispatched via the shared `onPointerActivate` contract (`posterCard.js` markup, see the
 * file header comment there) — called from `homeScreen.js`'s own `onPointerActivate(target)`,
 * which delegates here only when `Platform.isPhoneViewport()` is true. Returns whether the
 * tap was handled. */
export function handlePhoneHomePointerActivate(screen, target) {
  const card = target?.closest?.(".phone-poster-card[data-id]");
  if (!card) {
    return false;
  }
  const id = String(card.dataset.id || "");
  if (!id) {
    return false;
  }
  const continueWatchingItems = Array.isArray(screen.continueWatchingDisplay)
    ? screen.continueWatchingDisplay
    : [];
  const continueWatchingItem = continueWatchingItems.find(
    (entry) => String(entry.contentId) === id
  );
  if (continueWatchingItem) {
    navigateToItem(screen, continueWatchingItem);
    return true;
  }
  const catalogRows = buildCatalogRows(screen);
  for (const row of catalogRows) {
    const item = row.items.find((entry) => String(entry.id) === id);
    if (item) {
      navigateToItem(screen, item);
      return true;
    }
  }
  return false;
}

/** Tears down whatever `mountHomeScreenPhone` last wired up, if anything. Safe to call when
 * nothing is mounted (e.g. the screen has never rendered in phone mode). */
export function cleanupHomeScreenPhone(screen) {
  screen._phoneHomeTeardown?.();
  screen._phoneHomeTeardown = null;
}
