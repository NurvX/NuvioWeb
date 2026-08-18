import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { renderPhoneShelf, bindPhoneShelfEvents } from "../../components/phoneShelf.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { renderSkeletonBlock, renderSkeletonShelf } from "../../components/phoneSkeleton.js";
import {
  isSeriesDetailMeta,
  resolvePlayableDetailType,
  normalizeGenreList,
  resolveImdbRating,
  formatRuntimeMinutes,
  resolveEpisodeRuntimeForSeason,
  hasMdbListRatings,
  normalizePreviewItem,
  extractPreviewYear
} from "./metaDetailsScreen.js";

// Phone render path for js/ui/screens/detail/metaDetailsScreen.js (ticket 02-01, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; metaDetailsScreen.js's own `render()` only has a guard clause that
// dispatches here when `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()`
// add a `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders. Every function below takes the `MetaDetailsScreen` singleton itself (`screen`,
// i.e. its own `this`) so it can call the screen's already-existing mutation/data methods
// directly rather than duplicating any of that logic here:
//   - `screen.playDefaultFromHero(options)` — Play button (handles both movie and series).
//   - `screen.toggleLibraryFromHero()` — library add/remove toggle.
//   - `screen.toggleWatchedFromDetail()` — whole-title watched toggle, extracted (this same
//     ticket) from the TV click dispatcher's inline `toggleWatched` branch into a reusable
//     method both the TV dispatcher and this module now call.
//   - `screen.openEpisodeStreamChooser(videoId)` — tapping an episode card.
//   - `screen.navigateBackFromDetail()` — the floating header's back button.
//   - `screen.getAvailableSeasons()` / `screen.getSelectedSeasonEpisodes()` /
//     `screen.isEpisodeMarkedWatched(episode)` / `screen.getActiveResumeProgress()` /
//     `screen.getSeriesHeroPlayLabel()` / `screen.getMovieHeroPlayLabel()` — existing
//     read-only helpers already used by the TV hero/season/episode rendering.
// `screen.meta`/`screen.episodes`/`screen.selectedSeason`/`screen.castItems`/
// `screen.moreLikeThisItems`/`screen.collectionItems`/`screen.collectionName` are populated by
// the screen's existing `mount()` data-fetching flow, independent of layoutMode — this module
// only reads them, it does not fetch anything itself.
//
// Scope note: the hero intentionally renders a still backdrop image only, with no live
// trailer crossfade. `playTrailer()`'s DOM sync (`syncTrailerDom()`) is hardcoded to look up
// `.container.querySelector(".series-detail-shell")` before it will touch the DOM at all —
// widening that TV-only selector (or duplicating its ~150 lines of playback logic here) is
// out of scope for this ticket's sanctioned metaDetailsScreen.js changes (render/mount/cleanup
// dispatch, the toggleWatched extraction, and read-only exports), so no trailer-play
// affordance is rendered in phone mode rather than shipping a tap target that would silently
// no-op.

const SCROLL_HEADER_OFFSET_PX = 56;

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

function iconBack() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>`;
}

function iconPlay() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
}

function iconMore() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>`;
}

function iconLibrary(isSaved) {
  return isSaved
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12H20M12 4V20"/></svg>`;
}

function iconWatched(isWatched) {
  return isWatched
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Zm0 13c-3.04 0-5.5-2.46-5.5-5.5S8.96 6.5 12 6.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5Zm0-8.8A3.3 3.3 0 0 0 8.7 12a3.3 3.3 0 1 0 6.6 0A3.3 3.3 0 0 0 12 8.7Z"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m2.1 3.51 1.39-1.39 18 18-1.39 1.39-2.94-2.94A10.94 10.94 0 0 1 12 19.5C7 19.5 2.73 16.39 1 12c.8-2.03 2.18-3.79 3.95-5.09L2.1 3.51Zm10.4 10.46L8.58 9.09A4.48 4.48 0 0 0 7.5 12 4.5 4.5 0 0 0 12 16.5c1.13 0 2.16-.4 2.97-1.06l-2.47-2.47ZM12 7.5c2.49 0 4.5 2.01 4.5 4.5 0 .78-.2 1.5-.56 2.13l2.59 2.59A9.77 9.77 0 0 0 21.04 12c-1.51-3.52-5.02-6-9.04-6-1.39 0-2.7.29-3.88 1.02l1.86 1.86c.62-.24 1.3-.38 2.02-.38Z"/></svg>`;
}

/** Returns `{prefix, value}` for the director/writer credit line, mirroring
 * `renderSeriesHeroMarkup`/`renderMovieHeroMarkup`'s own (inline, not extracted) TV logic. */
function creditLine(meta = {}, isSeries = false) {
  if (isSeries) {
    if (Array.isArray(meta.director) && meta.director.length) {
      return {
        prefix: t("detail.creator", {}, "Creator"),
        value: meta.director.slice(0, 2).join(", ")
      };
    }
    if (Array.isArray(meta.writer) && meta.writer.length) {
      return {
        prefix: t("detail.writer", {}, "Writer"),
        value: meta.writer.slice(0, 2).join(", ")
      };
    }
    return { prefix: t("detail.writer", {}, "Writer"), value: meta.director || meta.writer || "" };
  }
  const directorLine = Array.isArray(meta.director)
    ? meta.director.slice(0, 2).join(", ")
    : meta.director || "";
  return { prefix: t("detail.director", {}, "Director"), value: directorLine };
}

// ---------------------------------------------------------------------------------------
// Hero + floating header
// ---------------------------------------------------------------------------------------

function renderHero(screen, meta) {
  const backdrop = meta.background || meta.poster || "";
  const metaParts = [
    normalizeGenreList(meta).slice(0, 2).join(" • "),
    extractPreviewYear(meta.releaseInfo || meta.released || meta.year || "")
  ].filter(Boolean);
  return `
    <section class="phone-detail-hero" data-phone-detail-hero>
      <div class="phone-detail-hero-bg" data-phone-detail-hero-bg${
        backdrop
          ? ` style="background-image:url('${escapeHtml(backdrop).replace(/'/g, "%27")}')"`
          : ""
      }></div>
      <div class="phone-detail-hero-scrim" aria-hidden="true"></div>
      <div class="phone-detail-hero-content">
        ${
          meta.logo
            ? `<img class="phone-detail-hero-logo" src="${escapeHtml(meta.logo)}" alt="${escapeHtml(meta.name || "")}" />`
            : `<h1 class="phone-detail-hero-title">${escapeHtml(meta.name || "Untitled")}</h1>`
        }
        ${metaParts.length ? `<div class="phone-detail-hero-meta">${escapeHtml(metaParts.join("  •  "))}</div>` : ""}
      </div>
    </section>
    <header class="phone-detail-floating-header" data-phone-detail-floating-header>
      <button type="button" class="phone-detail-floating-back" data-phone-action="back" aria-label="${escapeHtml(t("common.back", {}, "Back"))}">
        ${iconBack()}
      </button>
      <div class="phone-detail-floating-title">${escapeHtml(meta.name || "")}</div>
      <button type="button" class="phone-detail-floating-library${screen.isSavedInLibrary ? " active" : ""}" data-phone-action="toggleLibrary" aria-label="${escapeHtml(t("hero_add_to_library", {}, "Add to library"))}">
        ${iconLibrary(screen.isSavedInLibrary)}
      </button>
    </header>
  `;
}

// ---------------------------------------------------------------------------------------
// Play + secondary actions
// ---------------------------------------------------------------------------------------

function renderActions(screen, isSeries, showWatchedButton) {
  const playLabel = isSeries ? screen.getSeriesHeroPlayLabel() : screen.getMovieHeroPlayLabel();
  const expanded = Boolean(screen._phoneDetailActionsExpanded);
  return `
    <div class="phone-detail-actions">
      <button type="button" class="phone-detail-play focusable" data-phone-action="play">
        ${iconPlay()}
        <span>${escapeHtml(playLabel)}</span>
      </button>
      <div class="phone-detail-secondary${expanded ? " expanded" : ""}" data-phone-detail-secondary>
        <button type="button" class="phone-detail-more-toggle" data-phone-action="toggleSecondary" aria-label="${escapeHtml(t("common.more", {}, "More actions"))}">
          ${iconMore()}
        </button>
        <div class="phone-detail-secondary-row">
          <button type="button" class="phone-detail-icon-btn${screen.isSavedInLibrary ? " active" : ""}" data-phone-action="toggleLibrary" aria-label="${escapeHtml(screen.isSavedInLibrary ? t("hero_remove_from_library", {}, "Remove from library") : t("hero_add_to_library", {}, "Add to library"))}">
            ${iconLibrary(screen.isSavedInLibrary)}
          </button>
          ${
            showWatchedButton
              ? `<button type="button" class="phone-detail-icon-btn${screen.isMarkedWatched ? " active" : ""}" data-phone-action="toggleWatched" aria-label="${escapeHtml(screen.isMarkedWatched ? t("common.markUnwatched", {}, "Mark Unwatched") : t("common.markWatched", {}, "Mark Watched"))}">
                  ${iconWatched(screen.isMarkedWatched)}
                </button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Meta info + synopsis
// ---------------------------------------------------------------------------------------

function renderMetaInfo(screen, meta, isSeries) {
  const genresText = normalizeGenreList(meta).join(" • ");
  const yearText = extractPreviewYear(meta.releaseInfo || meta.released || meta.year || "");
  const runtimeText =
    String(meta.runtime || "").trim() ||
    formatRuntimeMinutes(
      isSeries
        ? resolveEpisodeRuntimeForSeason(screen.episodes || [], screen.selectedSeason)
        : meta.runtimeMinutes
    );
  const ageRating = String(meta.ageRating || "").trim();
  const imdbValue = resolveImdbRating(meta);
  const hasExternalRatings = hasMdbListRatings(meta.mdbListRatings);
  const ratingText =
    !hasExternalRatings && imdbValue != null && String(imdbValue).trim() !== ""
      ? String(imdbValue).replace(",", ".")
      : "";

  const primaryParts = [
    yearText ? `<span>${escapeHtml(yearText)}</span>` : "",
    runtimeText ? `<span>${escapeHtml(runtimeText)}</span>` : "",
    ageRating ? `<span class="phone-detail-meta-badge">${escapeHtml(ageRating)}</span>` : ""
  ].filter(Boolean);
  const credit = creditLine(meta, isSeries);

  return `
    <div class="phone-detail-meta">
      ${genresText ? `<div class="phone-detail-genres">${escapeHtml(genresText)}</div>` : ""}
      <div class="phone-detail-meta-row">
        ${primaryParts.join('<span class="phone-detail-meta-dot"></span>')}
        ${
          ratingText
            ? `<span class="phone-detail-imdb-badge">IMDb ${escapeHtml(ratingText)}</span>`
            : ""
        }
      </div>
      ${
        credit.value
          ? `<div class="phone-detail-credit">${escapeHtml(credit.prefix)}: ${escapeHtml(credit.value)}</div>`
          : ""
      }
    </div>
  `;
}

function renderSynopsis(screen, meta) {
  const expanded = Boolean(screen._phoneDetailSynopsisExpanded);
  const description = String(meta.description || t("detail.noDescription", {}, "No description."));
  return `
    <div class="phone-detail-synopsis-block">
      <p class="phone-detail-synopsis${expanded ? " expanded" : ""}" data-phone-detail-synopsis>${escapeHtml(description)}</p>
      <button type="button" class="phone-detail-synopsis-toggle" data-phone-action="toggleSynopsis">
        ${expanded ? escapeHtml(t("common.showLess", {}, "Show less")) : escapeHtml(t("common.showMore", {}, "Show more"))}
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Season/episode selection (series only)
// ---------------------------------------------------------------------------------------

function renderSeasonEpisodeSection(screen) {
  const seasons = screen.getAvailableSeasons();
  if (!seasons.length) {
    return "";
  }
  const chips = seasons
    .map(
      (season) => `
      <button type="button"
              class="phone-detail-season-chip${season === screen.selectedSeason ? " selected" : ""}"
              data-phone-season="${season}">
        ${escapeHtml(
          season === 0
            ? t("episodes_specials", {}, "Specials")
            : t("detail.seasonLabel", { season }, "Season {{season}}")
        )}
      </button>
    `
    )
    .join("");

  const episodes = screen.getSelectedSeasonEpisodes();
  const episodeItems = episodes.map((episode) => ({
    id: episode.id,
    posterUrl: episode.thumbnail || screen.meta?.background || screen.meta?.poster || "",
    title: episode.title,
    subtitle: `S${episode.season}E${episode.episode}`,
    action: "playEpisode",
    watched: screen.isEpisodeMarkedWatched(episode)
  }));

  return `
    <div class="phone-detail-season-chips" data-phone-season-chips>${chips}</div>
    <div id="phoneDetailEpisodeMount">
      ${renderPhoneShelf({
        id: "detail_episodes",
        title: t("detail.episodes", {}, "Episodes"),
        items: episodeItems,
        variant: "continueWatching"
      })}
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Cast + related-content rows
// ---------------------------------------------------------------------------------------

function castShelfItem(person) {
  const castKey = String(person.tmdbId || `${person.name || ""}:${person.character || ""}`);
  return {
    id: castKey,
    posterUrl: person.photo || "",
    title: person.name || "",
    subtitle: person.character || "",
    action: "openCastDetail"
  };
}

function previewShelfItem(rawItem, fallbackType) {
  const item = normalizePreviewItem(rawItem, fallbackType);
  return {
    id: item.id,
    posterUrl: item.landscapePoster || item.poster || "",
    title: item.name,
    subtitle: extractPreviewYear(item.releaseInfo)
  };
}

function renderCastAndRelatedSections(screen, fallbackType) {
  const castItems = Array.isArray(screen.castItems) ? screen.castItems : [];
  const collectionItems = Array.isArray(screen.collectionItems) ? screen.collectionItems : [];
  const moreLikeThisItems = Array.isArray(screen.moreLikeThisItems) ? screen.moreLikeThisItems : [];

  const castShelf = castItems.length
    ? renderPhoneShelf({
        id: "detail_cast",
        title: t("detail.cast", {}, "Cast"),
        items: castItems.map(castShelfItem),
        variant: "cast"
      })
    : "";

  const collectionShelf = collectionItems.length
    ? renderPhoneShelf({
        id: "detail_collection",
        title: String(screen.collectionName || t("detail.collection", {}, "Collection")),
        items: collectionItems.map((item) => previewShelfItem(item, fallbackType)),
        variant: "portrait"
      })
    : "";

  const moreLikeShelf = moreLikeThisItems.length
    ? renderPhoneShelf({
        id: "detail_morelike",
        title: t("detail.moreLikeThis", {}, "More Like This"),
        items: moreLikeThisItems.map((item) => previewShelfItem(item, fallbackType)),
        variant: "portrait"
      })
    : "";

  return `${castShelf}${collectionShelf}${moreLikeShelf}`;
}

// ---------------------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------------------

function renderLoadingSkeleton() {
  return `
    <div class="phone-detail-scroll" data-phone-detail-scroll>
      <div class="phone-detail-hero-skeleton phone-skeleton" aria-hidden="true"></div>
      <div class="phone-detail-body">
        ${renderSkeletonBlock({ width: "70%", height: "32px" })}
        ${renderSkeletonBlock({ width: "40%", height: "16px" })}
        ${renderSkeletonBlock({ width: "100%", height: "56px" })}
        ${renderSkeletonShelf({ count: 5, aspect: "portrait" })}
        ${renderSkeletonShelf({ count: 3, aspect: "portrait" })}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone Detail screen markup. Reads `screen.meta`/`screen.episodes`/
 * `screen.selectedSeason`/`screen.castItems`/`screen.moreLikeThisItems`/
 * `screen.collectionItems` directly — all populated by `metaDetailsScreen.js`'s existing
 * `mount()` data flow. Renders a lightweight skeleton (phoneSkeleton.js) if `screen.meta`
 * hasn't loaded yet (e.g. a live viewport resize arriving before the first fetch resolves). */
export function renderMetaDetailsScreenPhone(screen) {
  const meta = screen.meta;
  if (!meta) {
    return renderLoadingSkeleton();
  }
  const isSeries = isSeriesDetailMeta(meta, screen.episodes);
  const fallbackType = screen.params?.itemType || meta.type || "movie";
  // Mirrors renderSeriesHeroMarkup (always false) / renderMovieHeroMarkup (`playableType !==
  // "tv"`) on the TV side — series never show a whole-title watched toggle in the hero.
  const showWatchedButton =
    !isSeries && resolvePlayableDetailType(screen.params?.itemType || meta?.type, meta) !== "tv";

  return `
    <div class="phone-detail-scroll" data-phone-detail-scroll>
      ${renderHero(screen, meta)}
      <div class="phone-detail-body">
        ${renderActions(screen, isSeries, showWatchedButton)}
        ${renderMetaInfo(screen, meta, isSeries)}
        ${renderSynopsis(screen, meta)}
        ${isSeries ? renderSeasonEpisodeSection(screen) : ""}
        ${renderCastAndRelatedSections(screen, fallbackType)}
      </div>
    </div>
  `;
}

function applyScrollEffects(container, scrollTop) {
  const heroBg = container.querySelector("[data-phone-detail-hero-bg]");
  if (heroBg) {
    heroBg.style.transform = `translate3d(0, ${scrollTop * 0.5}px, 0)`;
  }
  const hero = container.querySelector("[data-phone-detail-hero]");
  const header = container.querySelector("[data-phone-detail-floating-header]");
  if (hero && header) {
    const threshold = Math.max(0, hero.offsetHeight - SCROLL_HEADER_OFFSET_PX);
    header.classList.toggle("visible", scrollTop > threshold);
  }
}

function navigateToPreviewItem(item, fallbackType) {
  const normalized = normalizePreviewItem(item, fallbackType);
  if (!normalized.id) {
    return;
  }
  Router.navigate("detail", {
    itemId: normalized.id,
    itemType: normalized.type || fallbackType,
    fallbackTitle: normalized.name || "Untitled",
    fallbackPoster: normalized.poster || "",
    fallbackBackground: normalized.landscapePoster || ""
  });
}

/** Wires the phone Detail screen's interactivity after `renderMetaDetailsScreenPhone`'s
 * markup has been inserted into `container`. Returns a teardown function; also stores it on
 * `screen._phoneDetailTeardown` so `cleanupMetaDetailsScreenPhone(screen)` can call it without
 * the caller needing to keep the reference itself. */
export function mountMetaDetailsScreenPhone(screen, container) {
  cleanupMetaDetailsScreenPhone(screen);

  const meta = screen.meta;
  if (!meta) {
    return () => {};
  }

  const scrollEl = container.querySelector("[data-phone-detail-scroll]");
  if (scrollEl && Number.isFinite(screen._phoneDetailScrollTop)) {
    scrollEl.scrollTop = screen._phoneDetailScrollTop;
  }
  if (scrollEl) {
    applyScrollEffects(container, scrollEl.scrollTop || 0);
  }

  const handleScroll = () => {
    const scrollTop = scrollEl?.scrollTop || 0;
    screen._phoneDetailScrollTop = scrollTop;
    applyScrollEffects(container, scrollTop);
  };
  scrollEl?.addEventListener("scroll", handleScroll, { passive: true });

  const chromeButtons = Array.from(container.querySelectorAll("[data-phone-action]"));
  chromeButtons.forEach((button) => {
    button.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const action = String(button.dataset.phoneAction || "");
      if (action === "back") {
        if (!screen.navigateBackFromDetail()) {
          Router.back();
        }
        return;
      }
      if (action === "play") {
        void screen.playDefaultFromHero();
        return;
      }
      if (action === "toggleSecondary") {
        screen._phoneDetailActionsExpanded = !screen._phoneDetailActionsExpanded;
        container
          .querySelector("[data-phone-detail-secondary]")
          ?.classList.toggle("expanded", screen._phoneDetailActionsExpanded);
        return;
      }
      if (action === "toggleLibrary") {
        void screen.toggleLibraryFromHero().then(() => screen.renderPhone());
        return;
      }
      if (action === "toggleWatched") {
        // toggleWatchedFromDetail() already re-renders internally (this.render(this.meta,
        // focusRestore)), which dispatches back to renderPhone() in phone mode.
        void screen.toggleWatchedFromDetail();
        return;
      }
      if (action === "toggleSynopsis") {
        screen._phoneDetailSynopsisExpanded = !screen._phoneDetailSynopsisExpanded;
        screen.renderPhone();
      }
    };
  });

  const seasonChips = Array.from(container.querySelectorAll("[data-phone-season]"));
  seasonChips.forEach((chip) => {
    chip.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const season = Number(chip.dataset.phoneSeason || 0);
      if (season !== screen.selectedSeason) {
        screen.hasManualSeasonSelection = true;
        screen.selectedSeason = season;
        screen.renderPhone();
      }
    };
  });

  const detachCastShelf = bindPhoneShelfEvents(
    container.querySelector('[data-shelf-id="detail_cast"]'),
    {}
  );
  const detachEpisodeShelf = bindPhoneShelfEvents(
    container.querySelector('[data-shelf-id="detail_episodes"]'),
    {}
  );

  const fallbackType = screen.params?.itemType || meta.type || "movie";
  const collectionItems = Array.isArray(screen.collectionItems) ? screen.collectionItems : [];
  const moreLikeThisItems = Array.isArray(screen.moreLikeThisItems) ? screen.moreLikeThisItems : [];

  const detachCollectionShelf = bindPhoneShelfEvents(
    container.querySelector('[data-shelf-id="detail_collection"]'),
    {
      onLongPress: (id, cardElement) => {
        const item = collectionItems.find((entry) => String(entry.id) === id);
        if (item) {
          openZoomForPreviewItem(item, cardElement, fallbackType);
        }
      }
    }
  );
  const detachMoreLikeShelf = bindPhoneShelfEvents(
    container.querySelector('[data-shelf-id="detail_morelike"]'),
    {
      onLongPress: (id, cardElement) => {
        const item = moreLikeThisItems.find((entry) => String(entry.id) === id);
        if (item) {
          openZoomForPreviewItem(item, cardElement, fallbackType);
        }
      }
    }
  );

  const teardown = () => {
    scrollEl?.removeEventListener("scroll", handleScroll);
    chromeButtons.forEach((button) => {
      button.onclick = null;
    });
    seasonChips.forEach((chip) => {
      chip.onclick = null;
    });
    detachCastShelf();
    detachEpisodeShelf();
    detachCollectionShelf();
    detachMoreLikeShelf();
  };

  screen._phoneDetailTeardown = teardown;
  return teardown;
}

function openZoomForPreviewItem(rawItem, cardElement, fallbackType) {
  const item = normalizePreviewItem(rawItem, fallbackType);
  if (!item.id) {
    return;
  }
  openPosterZoomOverlay({
    posterElement: cardElement,
    posterUrl: item.landscapePoster || item.poster || "",
    title: item.name,
    subtitle: extractPreviewYear(item.releaseInfo),
    aspect: "portrait",
    actions: [
      {
        id: "details",
        label: t("cw_action_go_to_details", {}, "Go to details"),
        onSelect: () => navigateToPreviewItem(rawItem, fallbackType)
      }
    ]
  });
}

/** Handles a tap on any `.focusable[data-action]` target inside the phone Detail screen,
 * dispatched via the shared `onPointerActivate` contract (`posterCard.js` markup) — called
 * from `metaDetailsScreen.js`'s own `onPointerActivate(target)`, which delegates here only
 * when `Platform.isPhoneViewport()` is true (after its own unconditional trailer-action
 * branches, which stay TV/phone-agnostic). Returns whether the tap was handled. */
export function handlePhoneMetaDetailsPointerActivate(screen, target) {
  const card = target?.closest?.(".phone-poster-card[data-id]");
  if (!card) {
    return false;
  }
  const id = String(card.dataset.id || "");
  const action = String(card.dataset.action || "");
  if (!id) {
    return false;
  }

  if (action === "openCastDetail") {
    const castItems = Array.isArray(screen.castItems) ? screen.castItems : [];
    const person = castItems.find(
      (entry) => String(entry.tmdbId || `${entry.name || ""}:${entry.character || ""}`) === id
    );
    if (!person) {
      return false;
    }
    Router.navigate("castDetail", {
      castId: person.tmdbId || "",
      castName: person.name || "",
      castRole: person.character || "",
      castPhoto: person.photo || ""
    });
    return true;
  }

  if (action === "playEpisode") {
    void screen.openEpisodeStreamChooser(id);
    return true;
  }

  const fallbackType = screen.params?.itemType || screen.meta?.type || "movie";
  const collectionItems = Array.isArray(screen.collectionItems) ? screen.collectionItems : [];
  const moreLikeThisItems = Array.isArray(screen.moreLikeThisItems) ? screen.moreLikeThisItems : [];
  const previewItem =
    collectionItems.find((entry) => String(entry.id) === id) ||
    moreLikeThisItems.find((entry) => String(entry.id) === id);
  if (previewItem) {
    navigateToPreviewItem(previewItem, fallbackType);
    return true;
  }

  return false;
}

/** Tears down whatever `mountMetaDetailsScreenPhone` last wired up, if anything. Safe to call
 * when nothing is mounted (e.g. the screen has never rendered in phone mode). */
export function cleanupMetaDetailsScreenPhone(screen) {
  screen._phoneDetailTeardown?.();
  screen._phoneDetailTeardown = null;
}
