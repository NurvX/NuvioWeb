import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { catalogRepository } from "../../../data/repository/catalogRepository.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import { CollectionsStore } from "../../../data/local/collectionsStore.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";
import { TMDB_API_KEY, TRAKT_API_URL, TRAKT_CLIENT_ID } from "../../../config.js";
import { normalizeCollectionFolderItem } from "../home/homeScreen.js";
import { buildWatchedTitleIdSet, isTitleItemWatched } from "../../components/watchedTitleBadge.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import { renderPosterCard, bindPosterCardEvents } from "../../components/posterCard.js";
import {
  renderPhoneShelf,
  bindPhoneShelfEvents,
  defaultPhoneShelfViewAllLabel
} from "../../components/phoneShelf.js";
import { renderSkeletonPosterCard, renderSkeletonShelf } from "../../components/phoneSkeleton.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
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
import { I18n } from "../../../i18n/index.js";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_POSTER_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w1280";
const TRAKT_PAGE_SIZE = 50;
const STREAMING_NETWORK_PRESETS = new Map([
  ["netflix", { title: "Netflix", tmdbId: 213 }],
  ["hbo", { title: "HBO", tmdbId: 49 }],
  ["max", { title: "HBO", tmdbId: 49 }],
  ["disney", { title: "Disney+", tmdbId: 2739 }],
  ["disney+", { title: "Disney+", tmdbId: 2739 }],
  ["prime video", { title: "Prime Video", tmdbId: 1024 }],
  ["amazon prime video", { title: "Prime Video", tmdbId: 1024 }],
  ["hulu", { title: "Hulu", tmdbId: 453 }],
  ["apple tv", { title: "Apple TV+", tmdbId: 2552 }],
  ["apple tv+", { title: "Apple TV+", tmdbId: 2552 }],
  ["paramount+", { title: "Paramount+", tmdbId: 4330 }],
  ["paramount plus", { title: "Paramount+", tmdbId: 4330 }],
  ["starz", { title: "Starz", tmdbId: 318 }]
]);

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function toImageUrl(path, kind = "poster") {
  if (!path) {
    return "";
  }
  const normalizedPath = String(path);
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  const baseUrl = kind === "backdrop" ? TMDB_BACKDROP_IMAGE_BASE_URL : TMDB_POSTER_IMAGE_BASE_URL;
  return `${baseUrl}${normalizedPath}`;
}

function buildPlaceholderPosterDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2430" stop-opacity="0.92"/><stop offset="1" stop-color="#1f2430" stop-opacity="0.98"/></linearGradient></defs><rect width="500" height="750" fill="url(#g)"/><circle cx="250" cy="375" r="46" fill="none" stroke="#9ca3af" stroke-opacity="0.28" stroke-width="4"/><circle cx="250" cy="375" r="42" fill="#ffffff" fill-opacity="0.92" stroke="#9ca3af" stroke-opacity="0.18" stroke-width="3"/><path d="M240 352 L240 398 L278 375 Z" fill="#1f2430" fill-opacity="0.8"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeItem(item = {}, fallbackType = "movie") {
  const source = item && typeof item === "object" ? item : {};
  const type =
    String(source.type || source.apiType || fallbackType).toLowerCase() === "tv"
      ? "series"
      : String(source.type || source.apiType || fallbackType || "movie").toLowerCase();
  const runtimeValue =
    source.runtimeMinutes ??
    source.runtime ??
    source.durationMinutes ??
    source.duration_minutes ??
    0;
  return {
    ...source,
    id: String(source.id || "").trim(),
    type,
    apiType: type,
    name: firstNonEmpty(source.name, source.title, source.id),
    poster: firstNonEmpty(
      source.poster,
      source.thumbnail,
      source.background,
      source.backdrop,
      source.backdropUrl,
      source.landscapePoster
    ),
    landscapePoster: firstNonEmpty(
      source.landscapePoster,
      source.backdrop,
      source.backdropUrl,
      source.background
    ),
    backdrop: firstNonEmpty(
      source.backdrop,
      source.backdropUrl,
      source.background,
      source.landscapePoster
    ),
    background: firstNonEmpty(
      source.background,
      source.backdrop,
      source.backdropUrl,
      source.landscapePoster,
      source.poster
    ),
    releaseInfo: firstNonEmpty(
      source.releaseInfo,
      source.released,
      source.releaseDate,
      source.release_date,
      source.year
    ),
    released: firstNonEmpty(source.released, source.releaseDate, source.release_date),
    releaseDate: firstNonEmpty(source.releaseDate, source.release_date, source.released),
    logo: firstNonEmpty(source.logo),
    description: firstNonEmpty(source.description, source.overview, source.plot),
    genres: Array.isArray(source.genres) ? source.genres.filter(Boolean) : [],
    runtimeMinutes: Number(runtimeValue) || runtimeValue || 0,
    imdbRating: source.imdbRating ?? source.imdb_rating ?? source.rating ?? null,
    rating: source.rating ?? source.imdbRating ?? source.imdb_rating ?? null,
    ageRating: firstNonEmpty(source.ageRating, source.age_rating),
    status: firstNonEmpty(source.status),
    language: firstNonEmpty(source.language),
    country: firstNonEmpty(source.country),
    tmdbId: firstNonEmpty(source.tmdbId, String(source.id || "").replace(/^tmdb:/i, ""))
  };
}

function buildFolderHeroSeed(folder = null) {
  if (!folder) {
    return null;
  }
  return {
    id: `folder:${String(folder.id || "")}`,
    type: "series",
    name: firstNonEmpty(folder.title, "Collection"),
    poster: firstNonEmpty(folder.coverImageUrl),
    background: firstNonEmpty(folder.heroBackdropUrl, folder.coverImageUrl),
    logo: firstNonEmpty(folder.titleLogoUrl),
    description: "",
    releaseInfo: ""
  };
}

function sourceType(source = {}) {
  const mediaType = String(source.mediaType || "").toUpperCase();
  if (mediaType === "TV" || mediaType === "SERIES") {
    return "series";
  }
  const rawType = String(source.type || source.apiType || "movie").toLowerCase();
  return rawType === "tv" ? "series" : rawType;
}

export function buildFolderSourceRows(tabs = []) {
  return tabs
    .filter((tab) => !tab.isAllTab)
    .map((tab, index) => {
      const sourceTabIndex = tabs.indexOf(tab);
      const type = sourceType(tab.source || {});
      return {
        homeCatalogKey: tab.key || `folder_source_${index}`,
        folderTabIndex: sourceTabIndex >= 0 ? sourceTabIndex : index,
        addonId: tab.source?.addonId || tab.source?.provider || "collection",
        addonBaseUrl: tab.source?.addonBaseUrl || "",
        addonName: tab.source?.addonName || tab.source?.provider || "Collection",
        catalogId:
          tab.source?.catalogId ||
          tab.source?.tmdbId ||
          tab.source?.traktListId ||
          tab.key ||
          `source_${index}`,
        catalogName: tab.label || tab.source?.catalogName || tab.source?.title || "Collection",
        type,
        result: {
          status: tab.loading ? "loading" : tab.error ? "error" : "success",
          data: {
            items: Array.isArray(tab.items) ? tab.items : []
          }
        },
        suppressPosterText: true
      };
    });
}

function normalizePresetKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildFallbackStreamingSources(folder = {}) {
  const key = normalizePresetKey(folder.title || folder.name || "");
  const preset = STREAMING_NETWORK_PRESETS.get(key);
  if (!preset?.tmdbId) {
    return [];
  }
  return [
    {
      provider: "tmdb",
      tmdbSourceType: "NETWORK",
      title: `${preset.title} Popular`,
      tmdbId: preset.tmdbId,
      mediaType: "TV",
      sortBy: "popularity.desc",
      filters: {}
    },
    {
      provider: "tmdb",
      tmdbSourceType: "NETWORK",
      title: `${preset.title} Recent`,
      tmdbId: preset.tmdbId,
      mediaType: "TV",
      sortBy: "first_air_date.desc",
      filters: {}
    }
  ];
}

function roundRobinMerge(lists = []) {
  const result = [];
  const seen = new Set();
  const maxSize = lists.reduce(
    (max, list) => Math.max(max, Array.isArray(list) ? list.length : 0),
    0
  );
  for (let index = 0; index < maxSize; index += 1) {
    lists.forEach((list) => {
      const item = list?.[index];
      const key = `${item?.type || item?.apiType || "movie"}:${item?.id || ""}`;
      if (!item?.id || seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(item);
    });
  }
  return result;
}

function buildAddonTabLabel(source = {}, addons = []) {
  const addon = findAddonForSource(source, addons);
  const catalog =
    addon?.catalogs?.find(
      (entry) =>
        String(entry?.id || "") === String(source.catalogId || "") &&
        String(entry?.apiType || "") === String(source.type || "")
    ) || null;
  const baseName = firstNonEmpty(
    catalog?.name,
    source.catalogName,
    source.title,
    source.catalogId || source.type || "Catalog"
  );
  return source.genre ? `${baseName} · ${source.genre}` : baseName;
}

function sameAddonUrl(left = "", right = "") {
  const leftUrl = String(left || "").trim();
  const rightUrl = String(right || "").trim();
  if (!leftUrl || !rightUrl) {
    return false;
  }
  return addonRepository.canonicalizeUrl(leftUrl) === addonRepository.canonicalizeUrl(rightUrl);
}

function findAddonForSource(source = {}, addons = []) {
  return (
    addons.find((entry) => String(entry?.id || "") === String(source.addonId || "")) ||
    addons.find((entry) => sameAddonUrl(entry?.baseUrl, source.addonBaseUrl)) ||
    null
  );
}

function buildTmdbTabLabel(source = {}) {
  return firstNonEmpty(source.title, source.tmdbSourceType || "TMDB");
}

function buildTraktTabLabel(source = {}) {
  return firstNonEmpty(source.title, `List ${source.traktListId || ""}`);
}

function stableSourceValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSourceValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = stableSourceValue(value[key]);
        return accumulator;
      }, {});
  }
  return value ?? null;
}

function buildFolderSourceKey(source = {}, index = 0) {
  const provider = String(source.provider || "addon").toLowerCase();
  const signature = {
    provider,
    index,
    addonId: source.addonId || "",
    catalogId: source.catalogId || "",
    type: source.type || source.apiType || "",
    genre: source.genre || "",
    tmdbSourceType: source.tmdbSourceType || "",
    tmdbId: source.tmdbId ?? "",
    mediaType: source.mediaType || "",
    title: source.title || "",
    sortBy: source.sortBy || "",
    filters: stableSourceValue(source.filters || {})
  };
  return `${provider}:${index}:${JSON.stringify(stableSourceValue(signature))}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      String(payload?.message || payload?.error || response.statusText || "Request failed")
    );
  }
  return { response, payload };
}

async function fetchAddonSourceItems(source = {}, page = 1) {
  const addons = await addonRepository.getInstalledAddons();
  const addon = findAddonForSource(source, addons);
  const addonBaseUrl = firstNonEmpty(addon?.baseUrl, source.addonBaseUrl);
  if (!addonBaseUrl) {
    throw new Error("Addon not found");
  }
  const extraArgs = source.genre ? { genre: source.genre } : {};
  const result = await catalogRepository.getCatalog({
    addonBaseUrl,
    addonId: firstNonEmpty(addon?.id, source.addonId, addonBaseUrl),
    addonName: firstNonEmpty(addon?.displayName, addon?.name, source.addonName, "Addon"),
    catalogId: source.catalogId,
    catalogName: buildAddonTabLabel(source, addons),
    type: source.type,
    skip: Math.max(0, (page - 1) * 100),
    extraArgs,
    supportsSkip: true
  });
  if (result?.status !== "success") {
    throw new Error(String(result?.message || "Could not load catalog"));
  }
  return {
    items: (result.data?.items || [])
      .map((item) => normalizeItem(item, source.type))
      .filter((item) => item.id),
    hasMore: Boolean(result.data?.hasMore),
    page
  };
}

function getTmdbApiKey() {
  const settings = TmdbSettingsStore.get();
  return settings.enabled ? String(TMDB_API_KEY || "").trim() : "";
}

function getTmdbLanguage() {
  return String(TmdbSettingsStore.get().language || "en-US").trim() || "en-US";
}

function setTmdbDiscoverParam(params, key, value) {
  if (value == null || value === "") {
    return;
  }
  params.set(key, String(value));
}

function applyTmdbDiscoverFilters(params, filters = {}, mediaType = "movie") {
  const isTv = String(mediaType || "").toLowerCase() === "tv";
  setTmdbDiscoverParam(params, "with_genres", filters.withGenres);
  setTmdbDiscoverParam(params, "without_genres", filters.withoutGenres);
  setTmdbDiscoverParam(
    params,
    isTv ? "first_air_date.gte" : "primary_release_date.gte",
    filters.releaseDateGte
  );
  setTmdbDiscoverParam(
    params,
    isTv ? "first_air_date.lte" : "primary_release_date.lte",
    filters.releaseDateLte
  );
  setTmdbDiscoverParam(params, "vote_average.gte", filters.voteAverageGte);
  setTmdbDiscoverParam(params, "vote_average.lte", filters.voteAverageLte);
  setTmdbDiscoverParam(params, "vote_count.gte", filters.voteCountGte);
  setTmdbDiscoverParam(params, "with_original_language", filters.withOriginalLanguage);
  setTmdbDiscoverParam(params, "with_origin_country", filters.withOriginCountry);
  setTmdbDiscoverParam(params, "with_keywords", filters.withKeywords);
  setTmdbDiscoverParam(params, "without_keywords", filters.withoutKeywords);
  setTmdbDiscoverParam(params, "with_companies", filters.withCompanies);
  setTmdbDiscoverParam(params, "without_companies", filters.withoutCompanies);
  if (isTv) {
    setTmdbDiscoverParam(params, "with_networks", filters.withNetworks);
  }
  if (Number.isFinite(Number(filters.year)) && Number(filters.year) > 0) {
    params.set(isTv ? "first_air_date_year" : "year", String(Math.trunc(Number(filters.year))));
  }
  if (filters.withWatchProviders || filters.withoutWatchProviders) {
    setTmdbDiscoverParam(params, "watch_region", filters.watchRegion || "US");
  }
  if (filters.withWatchProviders) {
    setTmdbDiscoverParam(params, "with_watch_providers", filters.withWatchProviders);
    setTmdbDiscoverParam(params, "with_watch_monetization_types", "flatrate|free|ads|rent|buy");
  }
  setTmdbDiscoverParam(params, "without_watch_providers", filters.withoutWatchProviders);
}

function mapTmdbListItem(item = {}, mediaType = "movie") {
  const type = mediaType === "tv" ? "series" : "movie";
  const title = firstNonEmpty(item.title, item.name, item.original_title, item.original_name);
  if (!item?.id || !title) {
    return null;
  }
  const posterUrl = toImageUrl(item.poster_path || item.posterPath, "poster");
  const backdropUrl = toImageUrl(item.backdrop_path || item.backdropPath, "backdrop");
  return normalizeItem(
    {
      id: `tmdb:${item.id}`,
      type,
      name: title,
      poster: firstNonEmpty(posterUrl, backdropUrl, buildPlaceholderPosterDataUrl()),
      landscapePoster: backdropUrl,
      background: backdropUrl,
      description: firstNonEmpty(item.overview, item.description),
      releaseInfo: String(item.release_date || item.first_air_date || "").slice(0, 4),
      released: item.release_date || item.first_air_date || "",
      releaseDate: item.release_date || item.first_air_date || "",
      rating: typeof item.vote_average === "number" ? item.vote_average : null,
      imdbRating: typeof item.vote_average === "number" ? item.vote_average : null,
      tmdbId: String(item.id)
    },
    type
  );
}

async function fetchTmdbSourceItems(source = {}, page = 1) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new Error("TMDB is not configured");
  }
  const language = getTmdbLanguage();
  const type = String(source.tmdbSourceType || "").toUpperCase();
  const mediaType =
    type === "NETWORK" || String(source.mediaType || "MOVIE").toUpperCase() === "TV"
      ? "tv"
      : "movie";
  if (type === "COLLECTION") {
    const items = await TmdbMetadataService.fetchMovieCollection({
      collectionId: source.tmdbId,
      language
    });
    return {
      items: items.map((item) => normalizeItem(item, "movie")).filter((item) => item.id),
      hasMore: false,
      page: 1
    };
  }
  if (type === "LIST") {
    const url = `${TMDB_API_URL}/list/${encodeURIComponent(String(source.tmdbId || ""))}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}&page=${encodeURIComponent(String(page))}`;
    const { payload } = await fetchJson(url);
    return {
      items: (Array.isArray(payload?.items) ? payload.items : [])
        .map((item) => mapTmdbListItem(item, String(item?.media_type || mediaType)))
        .filter(Boolean),
      hasMore: Number(payload?.page || page) < Number(payload?.total_pages || page),
      page: Number(payload?.page || page)
    };
  }
  if (type === "PERSON" || type === "DIRECTOR") {
    const url = `${TMDB_API_URL}/person/${encodeURIComponent(String(source.tmdbId || ""))}/combined_credits?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`;
    const { payload } = await fetchJson(url);
    const sourceItems =
      type === "DIRECTOR"
        ? Array.isArray(payload?.crew)
          ? payload.crew.filter((entry) => String(entry?.job || "").toLowerCase() === "director")
          : []
        : Array.isArray(payload?.cast)
          ? payload.cast
          : [];
    return {
      items: sourceItems
        .map((item) => mapTmdbListItem(item, String(item?.media_type || mediaType)))
        .filter(Boolean),
      hasMore: false,
      page: 1
    };
  }
  const params = new URLSearchParams({
    api_key: apiKey,
    language,
    page: String(page),
    sort_by: String(
      source.sortBy || (mediaType === "tv" ? "first_air_date.desc" : "popularity.desc")
    )
  });
  const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
  applyTmdbDiscoverFilters(params, filters, mediaType);
  if (type === "COMPANY" && source.tmdbId) {
    params.set("with_companies", String(source.tmdbId));
  }
  if (type === "NETWORK" && source.tmdbId) {
    params.set("with_networks", String(source.tmdbId));
    params.set(
      "first_air_date.lte",
      filters.releaseDateLte || new Date().toISOString().slice(0, 10)
    );
    params.set("with_status", "0|3|4");
  }
  const url = `${TMDB_API_URL}/discover/${mediaType}?${params.toString()}`;
  const { payload } = await fetchJson(url);
  return {
    items: (Array.isArray(payload?.results) ? payload.results : [])
      .map((item) => mapTmdbListItem(item, mediaType))
      .filter(Boolean),
    hasMore: Number(payload?.page || page) < Number(payload?.total_pages || page),
    page: Number(payload?.page || page)
  };
}

function buildTraktHeaders() {
  const clientId = String(TRAKT_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new Error("Trakt is not configured");
  }
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId
  };
}

function mapTraktEntity(entity = {}, type = "movie") {
  const ids = entity?.ids || {};
  const title = firstNonEmpty(entity?.title, entity?.name);
  if (!title) {
    return null;
  }
  const id = firstNonEmpty(
    ids?.imdb,
    ids?.slug ? `${type}:${ids.slug}` : "",
    ids?.trakt ? `trakt:${ids.trakt}` : ""
  );
  if (!id) {
    return null;
  }
  const normalizedType = type === "show" ? "series" : "movie";
  return normalizeItem(
    {
      id,
      type: normalizedType,
      name: title,
      poster: firstNonEmpty(
        entity?.images?.poster?.[0],
        entity?.images?.poster,
        entity?.images?.posters?.[0]
      ),
      background: firstNonEmpty(
        entity?.images?.fanart?.[0],
        entity?.images?.background,
        entity?.images?.backdrop?.[0]
      ),
      releaseInfo: String(entity?.year || entity?.released || entity?.first_aired || "").slice(
        0,
        4
      ),
      logo: firstNonEmpty(entity?.images?.logo?.[0])
    },
    normalizedType
  );
}

async function fetchTraktSourceItems(source = {}, page = 1) {
  const mediaType = String(source.mediaType || "MOVIE").toUpperCase() === "TV" ? "show" : "movie";
  const url = new URL(
    `${String(TRAKT_API_URL || "https://api.trakt.tv").replace(/\/+$/, "")}/lists/${encodeURIComponent(String(source.traktListId || ""))}/items/${mediaType}`
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(TRAKT_PAGE_SIZE));
  url.searchParams.set("sort_by", String(source.sortBy || "rank"));
  url.searchParams.set("sort_how", String(source.sortHow || "asc"));
  const response = await fetch(url.toString(), { headers: buildTraktHeaders() });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(
      String(
        payload?.message || payload?.error || response.statusText || "Could not load Trakt list"
      )
    );
  }
  const pageCount = Number(response.headers.get("X-Pagination-Page-Count") || page);
  const items = (Array.isArray(payload) ? payload : [])
    .map((entry) => {
      return mediaType === "show"
        ? mapTraktEntity(entry?.show || null, "show")
        : mapTraktEntity(entry?.movie || null, "movie");
    })
    .filter(Boolean);
  return {
    items,
    hasMore: page < pageCount && items.length > 0,
    page
  };
}

async function fetchSourceItems(source = {}, page = 1) {
  const provider = String(source.provider || "addon").toLowerCase();
  if (provider === "tmdb") {
    return fetchTmdbSourceItems(source, page);
  }
  if (provider === "trakt") {
    return fetchTraktSourceItems(source, page);
  }
  return fetchAddonSourceItems(source, page);
}

const SCROLL_LOAD_THRESHOLD_PX = 640;
const GRID_INITIAL_SKELETON_COUNT = 9;
const ROW_SKELETON_COUNT = 6;

function phoneT(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function phoneEscapeHtml(value = "") {
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
      console.warn("folderDetailScreen: failed to save list membership", error);
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

function renderHero(coverImageUrl) {
  return `
    <div class="phone-folder-hero" data-phone-folder-hero>
      <div class="phone-folder-hero-bg" data-phone-folder-hero-bg style="background-image:url('${phoneEscapeHtml(
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
        aria-label="${phoneEscapeHtml(phoneT("common.back", {}, "Back"))}"
      >
        ${backIconMarkup()}
      </button>
      <div class="phone-folder-header-text">
        ${collectionTitle ? `<div class="phone-folder-eyebrow">${phoneEscapeHtml(collectionTitle)}</div>` : ""}
        <h1 class="phone-folder-title">${phoneEscapeHtml(folder?.title || "Folder")}</h1>
      </div>
    </header>
  `;
}

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
              data-tab-index="${index}">${phoneEscapeHtml(tab.label || "Tab")}</button>
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
      <h3 class="phone-folder-empty-title">${phoneEscapeHtml(message)}</h3>
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
      selectedTab?.error || phoneT("catalog_see_all_empty_title", {}, "No items available")
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
          <span>${phoneEscapeHtml(phoneT("discover_loading", {}, "Loading..."))}</span>
        </div>
      `
          : ""
      }
    `;
  }
  return `${tabRow}${bodyMarkup}`;
}

function buildRowTitle(row) {
  const mediaTypeLabel = row.type === "series" ? "Series" : "Movie";
  return row.catalogName !== mediaTypeLabel
    ? `${row.catalogName} - ${mediaTypeLabel}`
    : row.catalogName;
}

function renderRowTrackBody(screen) {
  const rows = buildFolderSourceRows(screen.tabs || []);
  if (!rows.length) {
    return renderGridEmptyState(phoneT("catalog_see_all_empty_title", {}, "No items available"));
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

function renderFolderDetailScreenPhone(screen) {
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

function handleFolderDetailPhonePointerActivate(screen, target) {
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

function mountFolderDetailScreenPhone(screen, container) {
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

function cleanupFolderDetailScreenPhone(screen) {
  screen._phoneFolderTeardown?.();
  screen._phoneFolderTeardown = null;
}

export const FolderDetailScreen = {
  getRouteStateKey(params = {}) {
    const collectionId = String(params?.collectionId || "").trim();
    const folderId = String(params?.folderId || "").trim();
    if (!collectionId || !folderId) {
      return null;
    }
    return `folderDetail:${collectionId}:${folderId}`;
  },

  captureRouteState() {
    const shell = this.container?.querySelector(".seeall-shell");
    const active =
      document.activeElement instanceof HTMLElement &&
      this.container?.contains(document.activeElement)
        ? document.activeElement
        : null;
    const focused =
      (active?.classList?.contains("focusable") ? active : null) ||
      this.container?.querySelector(".focusable.focused") ||
      active;
    const focusedSection = focused?.closest?.("[data-row-key]") || null;
    const trackScrollStates = Object.fromEntries(
      Array.from(this.container?.querySelectorAll(".folder-row-track[data-row-key]") || [])
        .map((track) => [String(track.dataset.rowKey || ""), Number(track.scrollLeft || 0)])
        .filter(([key]) => key)
    );
    return {
      params: this.params ? { ...this.params } : {},
      selectedTabIndex: Number(this.selectedTabIndex || 0),
      lastFocusedKey: String(this.lastFocusedKey || ""),
      focusedItemId: String(focused?.dataset?.itemId || ""),
      focusedItemType: String(focused?.dataset?.itemType || ""),
      focusedRowKey: String(
        focusedSection?.dataset?.rowKey ||
          focused?.closest?.("[data-track-row-key]")?.dataset?.trackRowKey ||
          ""
      ),
      savedScrollTop: Number(shell?.scrollTop ?? this.savedScrollTop ?? 0),
      trackScrollStates,
      tabs: Array.isArray(this.tabs)
        ? this.tabs.map((tab) => ({
            ...tab,
            restoreNeedsReload: Boolean(tab.loading),
            loading: false
          }))
        : [],
      heroItem: this.heroItem ? { ...this.heroItem } : null
    };
  },

  hydrateFromRouteState(restoredState = null, params = {}) {
    const snapshot = restoredState && typeof restoredState === "object" ? restoredState : null;
    if (
      !snapshot?.params ||
      this.getRouteStateKey(snapshot.params) !== this.getRouteStateKey(params)
    ) {
      return false;
    }
    this.selectedTabIndex = Math.max(0, Number(snapshot.selectedTabIndex || 0));
    this.lastFocusedKey = String(snapshot.lastFocusedKey || "tab:0");
    this.restoredFocusedItem = snapshot.focusedItemId
      ? {
          itemId: String(snapshot.focusedItemId),
          itemType: String(snapshot.focusedItemType || ""),
          rowKey: String(snapshot.focusedRowKey || "")
        }
      : null;
    this.savedScrollTop = Math.max(0, Number(snapshot.savedScrollTop || 0));
    this.restoredTrackScrollStates = snapshot.trackScrollStates || {};
    this.restoredFollowLayoutFocusState = snapshot.followLayoutFocusState || null;
    if (snapshot.heroItem?.id) {
      this.heroItem = { ...snapshot.heroItem };
    }

    const restoredTabs = new Map(
      (Array.isArray(snapshot.tabs) ? snapshot.tabs : [])
        .filter((tab) => tab?.key)
        .map((tab) => [String(tab.key), tab])
    );
    this.tabs = this.tabs.map((tab) => {
      const restored = restoredTabs.get(String(tab.key || ""));
      return restored
        ? {
            ...tab,
            items: Array.isArray(restored.items) ? [...restored.items] : [],
            hasMore: Boolean(restored.hasMore),
            page: Math.max(1, Number(restored.page || 1)),
            loading: false,
            error: String(restored.error || ""),
            restoreNeedsReload: Boolean(restored.restoreNeedsReload)
          }
        : tab;
    });
    this.sourceTabs = this.tabs.filter((tab) => !tab.isAllTab);
    this.selectedTabIndex = Math.min(this.selectedTabIndex, Math.max(0, this.tabs.length - 1));
    return true;
  },

  async mount(params = {}, navigationContext = {}) {
    this.container = document.getElementById("folderDetail");
    ScreenUtils.show(this.container);
    this.phoneViewportUnsubscribe?.();
    this.params = params || {};
    this.layoutPrefs = LayoutPreferences.get();
    this.collection =
      CollectionsStore.get().find(
        (entry) => String(entry?.id || "") === String(this.params.collectionId || "")
      ) || null;
    this.folder =
      this.collection?.folders?.find(
        (entry) => String(entry?.id || "") === String(this.params.folderId || "")
      ) || null;
    this.selectedTabIndex = 0;
    this.lastFocusedKey = "tab:0";
    this.savedScrollTop = 0;
    this.tabs = [];
    this.viewMode = String(this.collection?.viewMode || "TABBED_GRID").toUpperCase();
    this.heroItem = null;

    if (!this.collection || !this.folder) {
      this.container.innerHTML = `<div class="seeall-shell"><div class="seeall-empty">Collection folder not found.</div></div>`;
      return;
    }

    this.heroItem =
      normalizeCollectionFolderItem(
        {
          ...(this.folder || {}),
          collectionId: this.collection.id,
          collectionTitle: this.collection.title
        },
        this.collection
      ) || buildFolderHeroSeed(this.folder);

    const [addons, watchedItems] = await Promise.all([
      addonRepository.getInstalledAddons().catch(() => []),
      watchedItemsRepository.getAll(5000).catch(() => [])
    ]);
    this.watchedTitleIds = buildWatchedTitleIdSet(watchedItems);
    const folderSources =
      Array.isArray(this.folder.sources) && this.folder.sources.length
        ? this.folder.sources
        : buildFallbackStreamingSources(this.folder);
    const sourceTabs = folderSources.map((source, index) => ({
      key: buildFolderSourceKey(source, index),
      label:
        source.provider === "tmdb"
          ? buildTmdbTabLabel(source)
          : source.provider === "trakt"
            ? buildTraktTabLabel(source)
            : buildAddonTabLabel(source, addons),
      source,
      items: [],
      hasMore: false,
      page: 1,
      loading: false,
      error: ""
    }));
    this.sourceTabs = sourceTabs;
    this.tabs =
      this.collection.showAllTab !== false && sourceTabs.length > 1
        ? [
            {
              key: "all",
              label: "All",
              isAllTab: true,
              items: [],
              hasMore: false,
              page: 1,
              loading: true,
              error: ""
            },
            ...sourceTabs
          ]
        : sourceTabs;

    const restored = this.hydrateFromRouteState(navigationContext?.restoredState, this.params);
    this.render();
    const sourceOffset = this.tabs[0]?.isAllTab ? 1 : 0;
    const tabsToLoad = restored
      ? this.tabs
          .map((tab, index) => ({ tab, index }))
          .filter(({ tab }) => !tab.isAllTab && tab.restoreNeedsReload)
          .map(({ index }) => index)
      : sourceTabs.map((_, index) => index + sourceOffset);
    await Promise.all(tabsToLoad.map((index) => this.loadTab(index, { append: false })));
  },

  rebuildAllTab() {
    if (!this.tabs[0]?.isAllTab) {
      return;
    }
    const sourceTabs = this.tabs.slice(1);
    this.tabs[0] = {
      ...this.tabs[0],
      items: roundRobinMerge(sourceTabs.map((tab) => tab.items || [])),
      hasMore: sourceTabs.some((tab) => tab.hasMore),
      loading: sourceTabs.some((tab) => tab.loading),
      error: ""
    };
  },

  async loadTab(tabIndex, { append = false } = {}) {
    const tab = this.tabs[tabIndex];
    if (!tab || tab.isAllTab || tab.loading) {
      return;
    }
    this.tabs[tabIndex] = { ...tab, loading: true, error: "" };
    this.rebuildAllTab();
    this.render();
    try {
      const nextPage = append ? Math.max(1, Number(tab.page || 1) + 1) : 1;
      const result = await fetchSourceItems(tab.source, nextPage);
      const existing = append ? this.tabs[tabIndex].items || [] : [];
      const seen = new Set(existing.map((item) => `${item.type}:${item.id}`));
      const incoming = (result.items || []).filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (!item.id || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      this.tabs[tabIndex] = {
        ...this.tabs[tabIndex],
        items: append ? [...existing, ...incoming] : incoming,
        hasMore: Boolean(result.hasMore && incoming.length),
        page: Number(result.page || nextPage),
        loading: false,
        error: ""
      };
      if (!this.heroItem) {
        this.heroItem = this.tabs[tabIndex].items[0] || null;
      }
    } catch (error) {
      this.tabs[tabIndex] = {
        ...this.tabs[tabIndex],
        loading: false,
        error: String(error?.message || "Could not load source")
      };
    }
    this.rebuildAllTab();
    this.render();
  },

  getSelectedTab() {
    return this.tabs[this.selectedTabIndex] || null;
  },

  render() {
    this.renderPhone();
  },

  renderPhone() {
    if (!this.container) {
      return;
    }
    this.container.innerHTML = renderFolderDetailScreenPhone(this);
    mountFolderDetailScreenPhone(this, this.container);
  },

  onPointerActivate(target) {
    return handleFolderDetailPhonePointerActivate(this, target);
  },

  consumeBackRequest() {
    return false;
  },

  cleanup() {
    cleanupFolderDetailScreenPhone(this);
    ScreenUtils.hide(this.container);
  }
};
