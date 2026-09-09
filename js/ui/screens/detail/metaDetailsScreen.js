import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { metaRepository } from "../../../data/repository/metaRepository.js";
import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";
import { savedLibraryRepository } from "../../../data/repository/savedLibraryRepository.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import {
  libraryRepository,
  LibrarySourceMode
} from "../../../data/repository/libraryRepository.js";
import { detailWatchedEnrichmentService } from "../../../data/repository/detailWatchedEnrichmentService.js";
import { watchedSeriesReconciliationService } from "../../../data/repository/watchedSeriesReconciliationService.js";
import { TmdbService } from "../../../core/tmdb/tmdbService.js";
import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { imdbEpisodeRatingsRepository } from "../../../data/repository/imdbEpisodeRatingsRepository.js";
import { parseEpisodeRuntimeMinutes } from "./episodeCardMetadata.js";
import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";
import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import {
  MoreLikeThisSourcePreference,
  TraktSettingsStore
} from "../../../data/local/traktSettingsStore.js";
import {
  requestJson as traktRequestJson,
  TraktAuthService
} from "../../../data/repository/traktAuthService.js";
import { Environment } from "../../../platform/environment.js";
import { Platform } from "../../../platform/index.js";

import {
  TMDB_API_KEY,
  TRAKT_API_URL,
  TRAKT_CLIENT_ID,
  YOUTUBE_PROXY_URL
} from "../../../config.js";
import { I18n } from "../../../i18n/index.js";
import { renderPhoneShelf, bindPhoneShelfEvents } from "../../components/phoneShelf.js";
import { openPosterZoomOverlay } from "../../components/posterZoomOverlay.js";
import { renderSkeletonBlock, renderSkeletonShelf } from "../../components/phoneSkeleton.js";

import { resolveMovieStreamIdentity } from "./movieStreamIdentity.js";

import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";
import {
  WATCH_PROGRESS_COMPLETED_THRESHOLD,
  getWatchProgressFraction,
  isWatchProgressInProgress,
  resolveWatchProgressResumePositionMs
} from "../../../domain/model/watchProgress.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const DETAIL_PROGRESS_END_THRESHOLD = WATCH_PROGRESS_COMPLETED_THRESHOLD;
const TRAKT_COMMENTS_LIMIT = 100;

const LOCAL_YOUTUBE_PROXY_URL = "youtube-proxy.html";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

// Returns the first value that is a non-negative integer (number or numeric
// string); null when none is. Whitespace-only strings, non-integers and
// non-numeric types count as missing — `Number("  ")` is 0 and would otherwise
// turn an empty field into a fake specials season. An explicit 0 is reported
// as 0 (not folded into a falsy default the way `Number(value || 0)` did) so
// resolveSeasonEpisode() can keep a declared specials season out of its
// missing-season fallback below.
function firstNonNegativeInt(values = []) {
  for (const value of values) {
    if (typeof value !== "number" && typeof value !== "string") {
      continue;
    }
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === "") {
      continue;
    }
    const num = Number(normalized);
    if (Number.isInteger(num) && num >= 0) {
      return num;
    }
  }
  return null;
}

// Stremio video ids frequently encode the season and episode as the trailing
// colon-separated segments (e.g. "tt1234567:1:2"). Many addons (AIOStreams and
// other aggregators included) rely on this and do NOT populate the explicit
// `season`/`episode` fields, which previously caused every episode to be
// dropped and the detail screen to report "No episodes available".
// Returns null when the id does not encode a season/episode pair.
function parseSeasonEpisodeFromId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) {
    return null;
  }
  const segments = id.split(":");
  if (segments.length < 3) {
    return null;
  }
  const lastSegment = segments[segments.length - 1];
  const secondLastSegment = segments[segments.length - 2];
  if (!/^\d+$/.test(lastSegment) || !/^\d+$/.test(secondLastSegment)) {
    return null;
  }
  // Three-segment ids are only safe to treat as "<series>:<season>:<episode>"
  // when the prefix is an IMDb id (e.g. "tt1234567:1:2"). Otherwise the middle
  // segment is an addon-specific identifier (e.g. "kitsu:12345:6") rather than a
  // season, and those metas always provide explicit season/episode fields.
  if (segments.length === 3 && !/^tt\d+$/i.test(segments[0])) {
    return null;
  }
  return { season: Number(secondLastSegment), episode: Number(lastSegment) };
}

function resolveSeasonEpisode(video = {}) {
  const fromId = parseSeasonEpisodeFromId(video.id);
  const season = firstNonNegativeInt([video.season, video.seasonNumber, fromId?.season]);
  const episode = firstNonNegativeInt([
    video.episode,
    video.episodeNumber,
    fromId?.episode,
    video.number
  ]);
  // Some addons omit the season entirely for single-season shows and only
  // provide an episode/number; treat those as season 1 instead of discarding
  // the episode. The explicit-0-vs-missing distinction from
  // firstNonNegativeInt() is consumed right here: a season explicitly set to 0
  // (specials) skips this fallback, while an omitted season still maps to season 1.
  if (season == null && episode > 0) {
    return { season: 1, episode };
  }
  return { season: season ?? 0, episode: episode ?? 0 };
}

function toEpisodeEntry(video = {}) {
  const { season, episode } = resolveSeasonEpisode(video);
  const runtimeMinutes = parseEpisodeRuntimeMinutes(
    video.runtime || video.runtimeMinutes || video.durationMinutes || video.duration
  );
  return {
    id: video.id || "",
    title: video.title || video.name || `S${season}E${episode}`,
    season,
    episode,
    thumbnail: video.thumbnail || null,
    overview: video.overview || video.description || "",
    runtimeMinutes,
    released:
      video.released ||
      video.releaseDate ||
      video.release_date ||
      video.firstAired ||
      video.first_aired ||
      video.airDate ||
      video.air_date ||
      "",
    available: video.available,
    imdbRating:
      video.imdbRating ??
      video.imdb_score ??
      video.ratings?.imdb ??
      video.mdbListRatings?.imdb ??
      null
  };
}

function normalizeEpisodes(videos = []) {
  return videos
    .map((video) => toEpisodeEntry(video))
    .filter((video) => video.id && video.season >= 0 && video.episode > 0)
    .sort((left, right) => {
      if (left.season === 0 || right.season === 0) {
        if (left.season !== right.season) {
          return left.season === 0 ? 1 : -1;
        }
      }
      if (left.season !== right.season) {
        return left.season - right.season;
      }
      return left.episode - right.episode;
    });
}

function detailProgressFraction(progress = {}) {
  return getWatchProgressFraction(progress);
}

function pushUniqueResumeId(ids, value) {
  const normalized = String(value || "").trim();
  if (normalized && !ids.includes(normalized)) {
    ids.push(normalized);
  }
}

function buildResumeContentIds(meta = {}, params = {}) {
  const ids = [];
  pushUniqueResumeId(ids, params?.itemId);
  pushUniqueResumeId(ids, params?.originalItemId);
  pushUniqueResumeId(ids, meta?.id);
  const imdb = String(
    meta?.ids?.imdb || meta?.imdb_id || meta?.imdbId || params?.imdbId || ""
  ).trim();
  if (imdb) {
    pushUniqueResumeId(ids, imdb);
    pushUniqueResumeId(ids, `imdb:${imdb}`);
  }
  const tmdb = meta?.ids?.tmdb ?? meta?.tmdb_id ?? meta?.tmdbId ?? params?.tmdbId;
  if (tmdb != null && String(tmdb).trim() !== "") {
    pushUniqueResumeId(ids, String(tmdb));
    pushUniqueResumeId(ids, `tmdb:${tmdb}`);
  }
  const trakt = meta?.ids?.trakt ?? meta?.trakt_id ?? meta?.traktId;
  if (trakt != null && String(trakt).trim() !== "") {
    pushUniqueResumeId(ids, String(trakt));
    pushUniqueResumeId(ids, `trakt:${trakt}`);
  }
  return ids;
}

// Exported for js/ui/screens/detail/metaDetailsScreenPhone.js (ticket 02-01): the phone
// render path reuses these pure helpers verbatim (series/movie detection, meta-row
// formatting, preview-item normalization) rather than reimplementing them, matching
// normalizeHomeRowItem's export in homeScreen.js.
export function isSeriesDetailMeta(meta = {}, episodes = null) {
  const normalizedType = String(meta?.type || "")
    .trim()
    .toLowerCase();
  if (normalizedType === "series") {
    return true;
  }
  const resolvedEpisodes = Array.isArray(episodes)
    ? episodes
    : normalizeEpisodes(meta?.videos || []);
  // Match Android TV: addon-defined types such as `other` are episodic when
  // their full meta contains valid season/episode videos.
  return resolvedEpisodes.length > 0;
}

export function resolvePlayableDetailType(itemType, meta = {}) {
  const rawType = String(itemType || meta?.type || "").trim();
  if (!rawType) {
    return "movie";
  }
  const normalizedType = rawType.toLowerCase();
  if (["movie", "series", "channel", "tv"].includes(normalizedType)) {
    return normalizedType;
  }
  // Match Android's ContentType.UNKNOWN behavior: preserve addon-defined API
  // types so the stream request uses the exact catalog type instead of movie.
  return rawType;
}

function resolveMetaImdbId(meta = {}, params = {}) {
  const candidates = [
    meta?.imdbId,
    meta?.imdb_id,
    meta?.externalIds?.imdb,
    meta?.external_ids?.imdb_id,
    params?.imdbId,
    params?.imdb_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .split(":")[0]
      )
      .find((value) => /^tt\d+$/i.test(value)) || null
  );
}

function resolveMetaTmdbId(meta = {}, params = {}) {
  const candidates = [
    meta?.tmdbId,
    meta?.tmdb_id,
    meta?.ids?.tmdb,
    meta?.externalIds?.tmdb,
    meta?.external_ids?.tmdb,
    params?.tmdbId,
    params?.tmdb_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .replace(/^tmdb:/i, "")
            .split(":")[0]
      )
      .find((value) => /^\d+$/.test(value)) || null
  );
}

function resolveMetaTraktId(meta = {}, params = {}) {
  const candidates = [
    meta?.traktId,
    meta?.trakt_id,
    meta?.ids?.trakt,
    meta?.externalIds?.trakt,
    meta?.external_ids?.trakt,
    params?.traktId,
    params?.trakt_id,
    meta?.id,
    params?.itemId
  ];
  return (
    candidates
      .map(
        (value) =>
          String(value || "")
            .trim()
            .replace(/^trakt:/i, "")
            .split(":")[0]
      )
      .find((value) => /^\d+$/.test(value)) || null
  );
}

function resolveMetaOriginalLanguage(meta = {}, params = {}) {
  return (
    [
      meta?.originalLanguage,
      meta?.original_language,
      params?.contentLanguage,
      params?.originalLanguage,
      params?.original_language
    ]
      .map((value) => String(value || "").trim())
      .find(Boolean) || null
  );
}

function metaWithRouteExternalIds(meta = {}, params = {}) {
  const imdbId = resolveMetaImdbId(meta, params);
  const tmdbId = resolveMetaTmdbId(meta, params);
  const traktId = resolveMetaTraktId(meta, params);
  const ids = {
    ...(meta?.ids && typeof meta.ids === "object" ? meta.ids : {})
  };
  if (imdbId && !ids.imdb) {
    ids.imdb = imdbId;
  }
  if (tmdbId && !ids.tmdb) {
    ids.tmdb = tmdbId;
  }
  if (traktId && !ids.trakt) {
    ids.trakt = traktId;
  }
  return {
    ...(meta || {}),
    ids,
    imdbId: meta?.imdbId || imdbId || null,
    tmdbId: meta?.tmdbId || tmdbId || null,
    traktId: meta?.traktId || traktId || null
  };
}

function extractCast(meta = {}) {
  const toPhoto = (value) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.startsWith("//")) {
      return `https:${raw}`;
    }
    if (raw.startsWith("http://")) {
      return `https://${raw.slice("http://".length)}`;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    if (raw.startsWith("/")) {
      return `https://image.tmdb.org/t/p/w300${raw}`;
    }
    return raw;
  };
  const normalizeCastValue = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const selectBetterCastEntry = (current, candidate) => {
    if (!candidate) {
      return current;
    }
    if (!current) {
      return candidate;
    }
    const currentScore = Number(Boolean(current.photo)) + Number(Boolean(current.tmdbId));
    const candidateScore = Number(Boolean(candidate.photo)) + Number(Boolean(candidate.tmdbId));
    return candidateScore > currentScore ? candidate : current;
  };
  const mergeCastEntries = (primary = [], supplemental = []) => {
    if (!primary.length) {
      return supplemental;
    }
    if (!supplemental.length) {
      return primary;
    }

    const exactMatches = new Map();
    const nameMatches = new Map();
    supplemental.forEach((entry) => {
      const normalizedName = normalizeCastValue(entry?.name);
      if (!normalizedName) {
        return;
      }
      const normalizedCharacter = normalizeCastValue(entry?.character);
      if (normalizedCharacter) {
        const exactKey = `${normalizedName}|${normalizedCharacter}`;
        exactMatches.set(exactKey, selectBetterCastEntry(exactMatches.get(exactKey), entry));
      }
      nameMatches.set(
        normalizedName,
        selectBetterCastEntry(nameMatches.get(normalizedName), entry)
      );
    });

    return primary.map((entry) => {
      const normalizedName = normalizeCastValue(entry?.name);
      const normalizedCharacter = normalizeCastValue(entry?.character);
      const exactKey =
        normalizedName && normalizedCharacter ? `${normalizedName}|${normalizedCharacter}` : "";
      const match =
        (exactKey ? exactMatches.get(exactKey) : null) ||
        (normalizedName ? nameMatches.get(normalizedName) : null);
      return {
        ...entry,
        character: entry?.character || match?.character || "",
        photo: entry?.photo || match?.photo || "",
        tmdbId: entry?.tmdbId || match?.tmdbId || null
      };
    });
  };
  const mapCastEntries = (items = [], mapper) =>
    (Array.isArray(items) ? items : []).map(mapper).filter((entry) => Boolean(entry?.name));

  const members = Array.isArray(meta.castMembers) ? meta.castMembers : [];
  const memberEntries = mapCastEntries(members, (entry) => ({
    name: entry?.name || "",
    character: entry?.character || entry?.role || "",
    photo: toPhoto(
      entry?.photo ||
        entry?.profilePath ||
        entry?.profile_path ||
        entry?.avatar ||
        entry?.image ||
        entry?.poster ||
        ""
    ),
    tmdbId: entry?.tmdbId || entry?.id || null
  }));

  const direct = Array.isArray(meta.cast) ? meta.cast : [];
  const directEntries = mapCastEntries(direct, (entry) => {
    if (typeof entry === "string") {
      return { name: entry, character: "", photo: "", tmdbId: null };
    }
    return {
      name: entry?.name || "",
      character: entry?.character || "",
      photo: toPhoto(
        entry?.photo ||
          entry?.profilePath ||
          entry?.profile_path ||
          entry?.avatar ||
          entry?.image ||
          entry?.poster ||
          ""
      ),
      tmdbId: entry?.tmdbId || entry?.id || null
    };
  });

  const credits = meta.credits?.cast;
  const creditEntries = mapCastEntries(credits, (entry) => ({
    name: entry?.name || entry?.character || "",
    character: entry?.character || "",
    photo: toPhoto(
      entry?.profile_path ||
        entry?.photo ||
        entry?.profilePath ||
        entry?.avatar_path ||
        entry?.avatar ||
        entry?.image ||
        ""
    ),
    tmdbId: entry?.id || null
  }));

  if (memberEntries.length) {
    return mergeCastEntries(memberEntries, [...directEntries, ...creditEntries]).slice(0, 18);
  }
  if (directEntries.length) {
    return mergeCastEntries(directEntries, creditEntries).slice(0, 12);
  }
  if (creditEntries.length) {
    return creditEntries.slice(0, 12);
  }

  return [];
}

async function withTimeout(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), ms);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function hasMdbListRatings(ratings = {}) {
  return ["trakt", "imdb", "tmdb", "letterboxd", "tomatoes", "audience", "metacritic"].some(
    (key) => ratings?.[key] != null && String(ratings[key]).trim() !== ""
  );
}

export function normalizeGenreList(meta = {}) {
  const raw = Array.isArray(meta?.genres)
    ? meta.genres
    : String(meta?.genres || meta?.genre || "").split(/[•,|/]/);
  return raw.map((genre) => String(genre || "").trim()).filter(Boolean);
}

function mergeGenreLists(primary = [], fallback = []) {
  const seen = new Set();
  return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])]
    .map((genre) => String(genre || "").trim())
    .filter((genre) => {
      const key = genre.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function resolveImdbRating(meta = {}) {
  if (meta?.imdbRating != null && String(meta.imdbRating).trim() !== "") {
    return meta.imdbRating;
  }
  if (meta?.imdb_score != null && String(meta.imdb_score).trim() !== "") {
    return meta.imdb_score;
  }
  if (meta?.ratings?.imdb != null && String(meta.ratings.imdb).trim() !== "") {
    return meta.ratings.imdb;
  }
  if (meta?.mdbListRatings?.imdb != null && String(meta.mdbListRatings.imdb).trim() !== "") {
    return meta.mdbListRatings.imdb;
  }
  return null;
}

export function formatRuntimeMinutes(runtime) {
  return formatDurationMinutes(runtime);
}

function formatDurationMinutes(totalMinutes) {
  const minutesValue = Number(totalMinutes || 0);
  if (!Number.isFinite(minutesValue) || minutesValue <= 0) {
    return "";
  }
  const roundedMinutes = Math.max(0, Math.round(minutesValue));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function resolveEpisodeRuntimeForSeason(episodes = [], season = null) {
  const seasonNumber = Number(season || 0);
  const inSeason = episodes.find(
    (episode) =>
      Number(episode.season || 0) === seasonNumber && Number(episode.runtimeMinutes || 0) > 0
  );
  if (inSeason) {
    return Number(inSeason.runtimeMinutes || 0);
  }
  const anyEpisode = episodes.find((episode) => Number(episode.runtimeMinutes || 0) > 0);
  return anyEpisode ? Number(anyEpisode.runtimeMinutes || 0) : 0;
}

export function normalizePreviewItem(item = {}, fallbackType = "movie") {
  return {
    id: String(item.id || ""),
    name: item.name || item.title || "Untitled",
    type: item.type || item.apiType || fallbackType,
    poster: item.poster || "",
    landscapePoster: item.landscapePoster || item.background || item.poster || "",
    releaseInfo: item.releaseInfo || item.year || ""
  };
}

function bestTraktArtwork(images = {}, kind) {
  const candidates = images?.[kind];
  if (Array.isArray(candidates)) {
    return candidates.find((entry) => typeof entry === "string" && entry) || "";
  }
  if (typeof candidates === "string") return candidates;
  if (candidates && typeof candidates === "object") {
    return candidates.full || candidates.medium || candidates.thumb || "";
  }
  return "";
}

function traktRelatedPreview(media = {}, type = "movie") {
  const ids = media.ids || {};
  const id = ids.imdb
    ? String(ids.imdb)
    : ids.tmdb != null
      ? `tmdb:${ids.tmdb}`
      : ids.trakt != null
        ? `trakt:${ids.trakt}`
        : "";
  if (!id || !(media.title || media.original_title)) return null;
  const landscape = bestTraktArtwork(media.images, "fanart");
  const poster = bestTraktArtwork(media.images, "poster");
  return normalizePreviewItem(
    {
      id,
      name: media.title || media.original_title,
      type,
      poster: landscape || poster,
      landscapePoster: landscape || poster,
      releaseInfo: media.year == null ? "" : String(media.year)
    },
    type
  );
}

export function extractPreviewYear(value = "") {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function resolveYoutubeId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }
  const watchMatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch?.[1]) {
    return watchMatch[1];
  }
  const shortMatch = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch?.[1]) {
    return shortMatch[1];
  }
  const embedMatch = raw.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch?.[1]) {
    return embedMatch[1];
  }
  return "";
}

function shouldUseDirectYoutubeEmbedOnTv() {
  return (Platform.isWebOS() || Platform.isTizen()) && !getYoutubeProxyBaseUrl();
}

function getYoutubeProxyBaseUrl() {
  const configured = String(YOUTUBE_PROXY_URL || "").trim();
  if (Platform.isWebOS() || Platform.isTizen()) {
    // The local proxy is served from a file:// origin, which YouTube rejects
    // (embed error 153). Prefer a configured https-hosted proxy when available
    // so the embedding origin is valid; otherwise fall back to the local file.
    return /^https?:\/\//i.test(configured) ? configured : LOCAL_YOUTUBE_PROXY_URL;
  }
  return configured || LOCAL_YOUTUBE_PROXY_URL;
}

function resolveTrailerPostMessageTargetOrigin(src = "") {
  try {
    const url = new URL(String(src || ""), globalThis?.location?.href || "https://example.com/");
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch (_) {
    // Fall through to wildcard for opaque/file origins.
  }
  return "*";
}

function resolveTrailerTrustedProxyOrigin() {
  try {
    const url = new URL(
      getYoutubeProxyBaseUrl(),
      globalThis?.location?.href || "https://example.com/"
    );
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin;
    }
  } catch (_) {
    // Local file origins are validated by event.source instead.
  }
  return "";
}

function buildDirectYoutubeEmbedUrl(cleanId = "", { muted = false, loop = true } = {}) {
  const videoId = String(cleanId || "").trim();
  if (!videoId || !Environment.isBrowser()) {
    return "";
  }
  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    controls: "0",
    loop: loop ? "1" : "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    cc_load_policy: "0",
    iv_load_policy: "3"
  });
  if (loop) {
    params.set("playlist", videoId);
  }
  const origin = String(globalThis?.location?.origin || "").trim();
  if (/^https?:\/\//i.test(origin)) {
    params.set("origin", origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function buildYoutubeEmbedUrl(ytId = "", { muted = false } = {}) {
  const cleanId = String(ytId || "").trim();
  if (!cleanId) {
    return "";
  }
  if (shouldUseDirectYoutubeEmbedOnTv()) {
    return buildDirectYoutubeEmbedUrl(cleanId, { muted });
  }
  const proxyBase = getYoutubeProxyBaseUrl();
  if (proxyBase) {
    try {
      const proxyUrl = new URL(proxyBase, globalThis?.location?.href || "https://example.com/");
      proxyUrl.searchParams.set("v", cleanId);
      proxyUrl.searchParams.set("autoplay", "1");
      proxyUrl.searchParams.set("muted", muted ? "1" : "0");
      proxyUrl.searchParams.set("controls", "0");
      proxyUrl.searchParams.set("loop", "1");
      proxyUrl.searchParams.set("playlist", cleanId);
      proxyUrl.searchParams.set("playsinline", "1");
      proxyUrl.searchParams.set("rel", "0");
      proxyUrl.searchParams.set("cc_load_policy", "0");
      proxyUrl.searchParams.set("_cb", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      return proxyUrl.toString();
    } catch (_) {
      return "";
    }
  }
  if (!Environment.isBrowser()) {
    return "";
  }
  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    controls: "0",
    loop: "1",
    playlist: cleanId,
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    cc_load_policy: "0",
    enablejsapi: "1"
  });
  const origin = String(globalThis?.location?.origin || "").trim();
  if (/^https?:\/\//i.test(origin)) {
    params.set("origin", origin);
  }
  return `https://www.youtube-nocookie.com/embed/${cleanId}?${params.toString()}`;
}

function resolveTrailerSource(meta = {}) {
  const trailerCandidates = [
    ...(Array.isArray(meta?.trailers) ? meta.trailers : []),
    ...(Array.isArray(meta?.videos) ? meta.videos : [])
  ];
  for (const entry of trailerCandidates) {
    const ytId = resolveYoutubeId(
      entry?.ytId || entry?.youtubeId || entry?.source || entry?.url || entry?.link || ""
    );
    if (ytId) {
      const embedUrl = buildYoutubeEmbedUrl(ytId);
      if (!embedUrl) {
        continue;
      }
      return {
        kind: "youtube",
        ytId,
        embedUrl
      };
    }
  }
  const ytId = resolveYoutubeId(Array.isArray(meta?.trailerYtIds) ? meta.trailerYtIds[0] : "");
  if (!ytId) {
    return null;
  }
  const embedUrl = buildYoutubeEmbedUrl(ytId);
  if (!embedUrl) {
    return null;
  }
  return {
    kind: "youtube",
    ytId,
    embedUrl
  };
}

function stripTraktSpoilerMarkup(value = "") {
  return String(value || "")
    .replace(/\[\/?spoiler\]/gi, "")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function containsTraktInlineSpoiler(value = "") {
  return /\[spoiler\].*?\[\/spoiler\]/is.test(String(value || ""));
}

function normalizeTrailerProxyStatePayload(
  payload,
  fallbackMuted = false,
  fallbackCaptionsEnabled = false
) {
  const source = payload && typeof payload === "object" ? payload : {};
  const nestedState = source.state && typeof source.state === "object" ? source.state : null;
  const candidate = nestedState || source;
  return {
    currentTime: Number(candidate.currentTime || 0),
    duration: Number(candidate.duration || 0),
    playerState: Number(candidate.playerState ?? -1),
    ended: Boolean(candidate.ended),
    paused: Boolean(candidate.paused),
    muted: candidate.muted == null ? Boolean(fallbackMuted) : Boolean(candidate.muted),
    captionsEnabled:
      candidate.captionsEnabled == null
        ? Boolean(fallbackCaptionsEnabled)
        : Boolean(candidate.captionsEnabled),
    loading: Boolean(candidate.loading),
    controllable: candidate.controllable !== false
  };
}

function captureHorizontalScrollMap(container) {
  const state = {};
  Array.from(container?.querySelectorAll("[data-scroll-key]") || []).forEach((node) => {
    const key = String(node.dataset.scrollKey || "").trim();
    if (!key) {
      return;
    }
    state[key] = Number(node.scrollLeft || 0);
  });
  return state;
}

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

export const MetaDetailsScreen = {
  getRouteStateKey(params = {}) {
    const itemId = String(params?.itemId || "").trim();
    if (!itemId) {
      return null;
    }
    return `detail:${String(params?.itemType || "movie").trim() || "movie"}:${itemId}`;
  },

  captureRouteState() {
    const content = this.container?.querySelector(".series-detail-content");
    return {
      params: this.params ? { ...this.params } : {},
      meta: this.meta ? { ...this.meta } : null,
      isSavedInLibrary: Boolean(this.isSavedInLibrary),
      isMarkedWatched: Boolean(this.isMarkedWatched),
      episodes: Array.isArray(this.episodes) ? [...this.episodes] : [],
      castItems: Array.isArray(this.castItems) ? [...this.castItems] : [],
      moreLikeThisItems: Array.isArray(this.moreLikeThisItems) ? [...this.moreLikeThisItems] : [],
      moreLikeThisSource: this.moreLikeThisSource || null,
      collectionItems: Array.isArray(this.collectionItems) ? [...this.collectionItems] : [],
      commentsItems: Array.isArray(this.commentsItems) ? [...this.commentsItems] : [],
      collectionName: String(this.collectionName || ""),
      seriesRatingsBySeason: this.seriesRatingsBySeason ? { ...this.seriesRatingsBySeason } : {},
      nextEpisodeToWatch: this.nextEpisodeToWatch ? { ...this.nextEpisodeToWatch } : null,
      trailerSource: this.trailerSource ? { ...this.trailerSource } : null,
      selectedSeason: Number(this.selectedSeason || 0),
      selectedRatingSeason: Number(this.selectedRatingSeason || 0),
      seriesInsightTab: String(this.seriesInsightTab || "cast"),
      movieInsightTab: String(this.movieInsightTab || "cast"),
      commentsPage: Number(this.commentsPage || 0),
      commentsPageCount: Number(this.commentsPageCount || 0),
      episodeFocusIndexBySeason: this.episodeFocusIndexBySeason
        ? { ...this.episodeFocusIndexBySeason }
        : {},
      railFocusIndexByKey: this.railFocusIndexByKey ? { ...this.railFocusIndexByKey } : {},
      pendingFocusRestore: this.captureDetailFocus(),
      contentScrollTop: Number(content?.scrollTop || 0),
      trackScrollLeftByKey: captureHorizontalScrollMap(this.container),
      episodeProgressEntries: Array.from(this.episodeProgressMap?.entries?.() || []),
      watchedEpisodeKeys: Array.from(this.watchedEpisodeKeys || [])
    };
  },

  hydrateFromRouteState(restoredState = null, params = {}) {
    const snapshot = restoredState && typeof restoredState === "object" ? restoredState : null;
    const restoredItemId = String(snapshot?.params?.itemId || "").trim();
    const nextItemId = String(params?.itemId || "").trim();
    if (!snapshot?.meta || !restoredItemId || restoredItemId !== nextItemId) {
      return false;
    }
    this.params = params || {};
    this.meta = { ...snapshot.meta };
    this.isSavedInLibrary = Boolean(snapshot.isSavedInLibrary);
    this.isMarkedWatched = Boolean(snapshot.isMarkedWatched);
    this.episodes = Array.isArray(snapshot.episodes) ? [...snapshot.episodes] : [];
    this.castItems = Array.isArray(snapshot.castItems) ? [...snapshot.castItems] : [];
    this.moreLikeThisItems = Array.isArray(snapshot.moreLikeThisItems)
      ? [...snapshot.moreLikeThisItems]
      : [];
    this.moreLikeThisSource = snapshot.moreLikeThisSource || null;
    this.collectionItems = Array.isArray(snapshot.collectionItems)
      ? [...snapshot.collectionItems]
      : [];
    this.commentsItems = Array.isArray(snapshot.commentsItems) ? [...snapshot.commentsItems] : [];
    this.collectionName = String(snapshot.collectionName || "");
    this.seriesRatingsBySeason = snapshot.seriesRatingsBySeason
      ? { ...snapshot.seriesRatingsBySeason }
      : {};
    this.nextEpisodeToWatch = snapshot.nextEpisodeToWatch
      ? { ...snapshot.nextEpisodeToWatch }
      : null;
    this.trailerSource = snapshot.trailerSource
      ? { ...snapshot.trailerSource }
      : resolveTrailerSource(this.meta);
    this.selectedSeason = Number(snapshot.selectedSeason ?? this.episodes[0]?.season ?? 1);
    this.selectedRatingSeason = Number(snapshot.selectedRatingSeason || this.selectedSeason || 1);
    this.seriesInsightTab = String(snapshot.seriesInsightTab || "cast");
    this.movieInsightTab = String(snapshot.movieInsightTab || "cast");
    this.commentsPage = Number(snapshot.commentsPage || 0);
    this.commentsPageCount = Number(snapshot.commentsPageCount || 0);
    this.episodeFocusIndexBySeason =
      snapshot.episodeFocusIndexBySeason && typeof snapshot.episodeFocusIndexBySeason === "object"
        ? { ...snapshot.episodeFocusIndexBySeason }
        : {};
    this.railFocusIndexByKey =
      snapshot.railFocusIndexByKey && typeof snapshot.railFocusIndexByKey === "object"
        ? { ...snapshot.railFocusIndexByKey }
        : {};
    this.pendingFocusRestore = snapshot.pendingFocusRestore
      ? { ...snapshot.pendingFocusRestore }
      : null;
    this.restoredContentScrollTop = Number(snapshot.contentScrollTop || 0);
    this.restoredTrackScrollLeftByKey =
      snapshot.trackScrollLeftByKey && typeof snapshot.trackScrollLeftByKey === "object"
        ? { ...snapshot.trackScrollLeftByKey }
        : {};
    this.episodeProgressMap = new Map(
      Array.isArray(snapshot.episodeProgressEntries) ? snapshot.episodeProgressEntries : []
    );
    this.watchedEpisodeKeys = new Set(
      Array.isArray(snapshot.watchedEpisodeKeys) ? snapshot.watchedEpisodeKeys : []
    );
    return true;
  },

  bindTrailerProxyMessaging() {
    if (this.trailerProxyMessageHandler) {
      window.removeEventListener("message", this.trailerProxyMessageHandler);
    }
    const trustedProxyOrigin = resolveTrailerTrustedProxyOrigin();
    this.trailerProxyMessageHandler = (event) => {
      const frameWindow = this.trailerUiRefs?.frame?.contentWindow;
      const data = event?.data;
      if (!data || typeof data !== "object" || data.source !== "nuvio-youtube-proxy") {
        return;
      }
      const eventOrigin = String(event?.origin || "").trim();
      const sourceMatchesFrame = Boolean(frameWindow && event?.source === frameWindow);
      const originMatchesProxy = Boolean(trustedProxyOrigin && eventOrigin === trustedProxyOrigin);
      if (!sourceMatchesFrame && !originMatchesProxy) {
        return;
      }
      if (data.type === "ready") {
        this.stopTrailerProxyLoadingTimer();
        this.trailerProxyState = {
          currentTime: 0,
          duration: 0,
          paused: false,
          muted: Boolean(this.trailerMuted),
          captionsEnabled: Boolean(this.trailerSubtitlesEnabled),
          loading: true,
          controllable: true
        };
        this.postTrailerProxyCommand("setMuted", {
          muted: Boolean(this.trailerMuted)
        });
        this.postTrailerProxyCommand("setCaptionsEnabled", {
          enabled: Boolean(this.trailerSubtitlesEnabled)
        });
        this.postTrailerProxyCommand("play");
        this.postTrailerProxyCommand("getState");
        this.startTrailerFirstFramePolling();
        if (this.trailerPlaybackMode === "manual") {
          this.updateTrailerOverlay();
        }
        return;
      }
      if (data.type === "ended") {
        const endedId = String(data.videoId || "").trim();
        const activeId = String(this.trailerSource?.ytId || "").trim();
        if (
          this.isTrailerPlaying &&
          this.trailerSource?.kind === "youtube" &&
          (!endedId || !activeId || endedId === activeId)
        ) {
          this.stopTrailerPlayback();
        }
        return;
      }
      if (data.type === "firstFrame") {
        const frameVideoId = String(data.videoId || "").trim();
        const activeId = String(this.trailerSource?.ytId || "").trim();
        const frameTime = Number(data.currentTime || 0);
        if (frameTime > 0 && (!frameVideoId || !activeId || frameVideoId === activeId)) {
          this.markTrailerVisualReady();
        }
        return;
      }
      if (data.type === "state") {
        const stateVideoId = String(data.videoId || "").trim();
        const activeVideoId = String(this.trailerSource?.ytId || "").trim();
        if (stateVideoId && activeVideoId && stateVideoId !== activeVideoId) {
          return;
        }
        const nextState = normalizeTrailerProxyStatePayload(
          data,
          this.trailerMuted,
          this.trailerSubtitlesEnabled
        );
        if (
          nextState.loading === false ||
          Number(nextState.duration || 0) > 0 ||
          Number(nextState.currentTime || 0) > 0
        ) {
          this.stopTrailerProxyLoadingTimer();
        }
        this.trailerProxyState = nextState;
        this.trailerYoutubeFallbackActive = nextState.controllable === false;
        if (this.trailerYoutubeFallbackActive) {
          this.scheduleTrailerFallbackReveal(activeVideoId);
        }
        if (!nextState.loading && Number(nextState.currentTime || 0) > 0) {
          this.markTrailerVisualReady();
        }
        if (nextState.ended) {
          this.stopTrailerPlayback();
          return;
        }
        if (this.trailerPlaybackMode === "manual") {
          this.updateTrailerOverlay();
        }
      }
    };
    window.addEventListener("message", this.trailerProxyMessageHandler);
  },

  postTrailerProxyCommand(command, payload = {}) {
    const frameWindow = this.trailerUiRefs?.frame?.contentWindow;
    if (!frameWindow) {
      return false;
    }
    const src = String(this.trailerUiRefs?.frame?.src || this.trailerSource?.embedUrl || "");
    const targetOrigin = resolveTrailerPostMessageTargetOrigin(src);
    try {
      frameWindow.postMessage(
        {
          source: "nuvio-detail-trailer",
          type: "command",
          command: String(command || ""),
          payload: payload && typeof payload === "object" ? payload : {}
        },
        targetOrigin
      );
      return true;
    } catch (_) {
      return false;
    }
  },

  async mount(params = {}, navigationContext = {}) {
    this.container = document.getElementById("detail");
    ScreenUtils.show(this.container);
    this.phoneViewportUnsubscribe?.();
    this.stopTrailerPlayback({
      keepDom: false,
      restartAutoplay: false,
      restoreFocus: false
    });
    this.params = params;
    this.isBackNavigation = Boolean(navigationContext?.isBackNavigation);
    this.pendingEpisodeSelection = null;
    this.pendingMovieSelection = null;
    this.episodeHoldMenu = null;
    this.seasonHoldMenu = null;
    this.heroPlayMenu = null;
    this.libraryListMenu = null;
    this.detailHoldDialog = null;
    this.posterOptionsController = null;
    this.posterOptionsFocusRestore = null;
    this.pendingPosterHoldTarget = null;
    this.pendingPosterHoldTimer = null;
    this.pendingHeroHoldTarget = null;
    this.pendingHeroHoldTimer = null;
    this.streamChooserFocus = null;
    this.streamChooserLoadToken = 0;
    this.isLoadingDetail = true;
    this.detailLoadToken = (this.detailLoadToken || 0) + 1;
    this.seriesInsightTab = "cast";
    this.movieInsightTab = "cast";
    this.selectedRatingSeason = 0;
    this.selectedSeason = 0;
    this.hasManualSeasonSelection = false;
    this.collectionItems = [];
    this.collectionName = "";
    this.commentsItems = [];
    this.commentsPage = 0;
    this.commentsPageCount = 0;
    this.commentsError = "";
    this.commentsLoading = false;
    this.commentsLoadingMore = false;
    this.commentsMode = "title";
    this.commentsEpisodeTarget = null;
    this.selectedCommentIndex = -1;
    this.trailerSource = null;
    this.isTrailerPlaying = false;
    this.trailerPlaybackMode = null;
    this.trailerVisualReady = false;
    this.trailerHasAutoplayed = false;
    this.trailerMuted = false;
    this.trailerSubtitlesEnabled = false;
    this.trailerMediaListeners = [];
    this.trailerUiRefs = null;
    this.trailerProgressTimer = null;
    this.trailerControlsTimer = null;
    this.trailerProxyLoadingTimer = null;
    this.trailerFirstFramePollTimer = null;
    this.trailerFallbackRevealTimer = null;
    this.trailerControlsVisible = true;
    this.trailerProxyState = null;
    this.trailerProxyMessageHandler = null;
    this.trailerYoutubeFallbackActive = false;
    this.trailerDomGeneration = 0;
    this.trailerFocusRestore = null;
    this.episodeProgressMap = new Map();
    this.resumeProgress = null;
    this.resumeContentIds = [];
    this.episodeFocusIndexBySeason = {};
    this.episodeVirtualWindow = null;
    this.episodeVirtualMetrics = null;
    this.episodeTrackScrollHandler = null;
    this.episodeTrackScrollNode = null;
    this.episodeVirtualSyncRaf = null;
    this.episodeHoldRepeatTimer = null;
    this.episodeHoldRepeatDirection = "";
    this.episodeHoldRepeatStartedAt = 0;
    this.episodeHoldRepeatStepCount = 0;
    this.episodeThumbnailPrefetchCache = new Set();
    this.selectedSeasonEpisodeState = null;
    this.railFocusIndexByKey = {};
    this.watchedEpisodeKeys = new Set();
    this.autoOpenedContinueWatchingStream = false;
    this.restoredContentScrollTop = 0;
    this.restoredTrackScrollLeftByKey = {};
    this.bindTrailerProxyMessaging();

    // Route snapshots preserve focus and scroll when navigating Back. A fresh
    // entry from Home must reload metadata instead of reviving a stale detail
    // snapshot captured before playback/background enrichment completed.
    const restoredRouteState = navigationContext?.isBackNavigation
      ? navigationContext?.restoredState || null
      : null;
    if (this.hydrateFromRouteState(restoredRouteState, params)) {
      this.isLoadingDetail = false;
      this.render(this.meta, this.pendingFocusRestore);
      const refreshToken = this.detailLoadToken;
      void this.refreshEpisodePlaybackState()
        .then(() => {
          if (refreshToken !== this.detailLoadToken || !this.container) {
            return;
          }
          this.updateRenderedDetailSections(this.meta, this.pendingFocusRestore || null);
        })
        .catch((error) => {
          console.warn("Detail playback state refresh failed", error);
        });
      if (!hasMdbListRatings(this.meta?.mdbListRatings)) {
        void this.loadMdbListRatings(this.meta, refreshToken);
      }
      this.maybeAutoOpenContinueWatchingStream();
      return;
    }

    this.container.innerHTML = `
      <div class="detail-loading-shell" aria-label="Loading detail">
        <div class="detail-loading-top">
          <div class="detail-loading-block detail-loading-poster"></div>
        </div>
        <div class="detail-loading-meta">
          <div class="detail-loading-block detail-loading-pill"></div>
          <div class="detail-loading-block detail-loading-pill short"></div>
        </div>
        <div class="detail-loading-copy">
          <div class="detail-loading-block detail-loading-line"></div>
          <div class="detail-loading-block detail-loading-line wide"></div>
          <div class="detail-loading-block detail-loading-line mid"></div>
        </div>
        <div class="detail-loading-tags">
          <div class="detail-loading-block detail-loading-tag"></div>
          <div class="detail-loading-block detail-loading-tag"></div>
          <div class="detail-loading-block detail-loading-tag"></div>
          <div class="detail-loading-block detail-loading-tag"></div>
        </div>
        <div class="detail-loading-tags">
          <div class="detail-loading-block detail-loading-chip"></div>
          <div class="detail-loading-block detail-loading-chip"></div>
        </div>
      </div>
    `;

    await this.loadDetail();
  },

  async loadDetail() {
    const token = this.detailLoadToken;
    let { itemId, itemType = "movie", fallbackTitle = "Untitled" } = this.params || {};
    if (!itemId) {
      this.renderError("Item id mancante.");
      return;
    }

    const sourceItemId = itemId;
    const sourceAddonBaseUrl = String(this.params?.addonBaseUrl || "").trim();
    // Match Android's MetaPreview.apiType semantics: the type declared by the
    // individual meta wins, while the catalog type is only a fallback. An
    // aggregator may expose a `channel` catalog whose entries are `tv`; using
    // the row type here makes the original TV addon miss both meta and streams.
    const sourceItemType = String(itemType || this.params?.catalogType).trim() || "movie";
    const canonicalItemId = await this.resolveCanonicalDetailItemId(itemId, itemType);
    if (token !== this.detailLoadToken) {
      return;
    }
    if (canonicalItemId && canonicalItemId !== itemId) {
      this.params = {
        ...(this.params || {}),
        itemId: canonicalItemId,
        originalItemId: this.params?.originalItemId || itemId
      };
      itemId = canonicalItemId;
    }

    const loadMeta = async () => {
      const globalResultPromise = metaRepository.getMetaFromAllAddons(itemType, itemId);
      if (sourceAddonBaseUrl && LayoutPreferences.get().preferExternalMetaAddonDetail !== false) {
        const sourceResult = await withTimeout(
          metaRepository.getMeta(sourceAddonBaseUrl, sourceItemType, sourceItemId),
          1800,
          { status: "error", message: "timeout" }
        );
        if (sourceResult.status === "success") {
          const sourceMeta = sourceResult.data || {};
          if (!sourceMeta.background) {
            const ownerResult = await withTimeout(globalResultPromise, 2200, {
              status: "error",
              message: "timeout"
            });
            if (ownerResult.status === "success") {
              const ownerMeta = ownerResult.data || {};
              return {
                status: "success",
                data: {
                  ...ownerMeta,
                  ...sourceMeta,
                  id: sourceMeta.id || ownerMeta.id || sourceItemId,
                  type: sourceMeta.type || ownerMeta.type || sourceItemType,
                  poster: sourceMeta.poster || ownerMeta.poster || null,
                  background: sourceMeta.background || ownerMeta.background || null,
                  logo: sourceMeta.logo || ownerMeta.logo || null,
                  description: sourceMeta.description || ownerMeta.description || "",
                  genres:
                    Array.isArray(sourceMeta.genres) && sourceMeta.genres.length
                      ? sourceMeta.genres
                      : ownerMeta.genres || [],
                  videos:
                    Array.isArray(sourceMeta.videos) && sourceMeta.videos.length
                      ? sourceMeta.videos
                      : ownerMeta.videos || []
                }
              };
            }
          }
          return sourceResult;
        }
      }
      return globalResultPromise;
    };
    const metaPromise = withTimeout(loadMeta(), 4500, {
      status: "error",
      message: "timeout"
    });
    const isSavedPromise = savedLibraryRepository.isSaved(itemId);
    const progressPromise = watchProgressRepository.getResumeByContentId(itemId);
    const watchedItemPromise = watchedItemsRepository.isWatched(itemId);
    const allProgressPromise = watchProgressRepository.getAll();
    const allWatchedPromise = watchedItemsRepository.getAll();

    const [metaResult, isSaved, initialProgress, watchedItem, allProgressItems, allWatchedItems] =
      await Promise.all([
        metaPromise,
        isSavedPromise,
        progressPromise,
        watchedItemPromise,
        allProgressPromise,
        allWatchedPromise
      ]);
    const meta =
      metaResult.status === "success"
        ? metaResult.data
        : {
            id: itemId,
            type: itemType,
            name: fallbackTitle,
            poster: this.params?.fallbackPoster || null,
            background: this.params?.fallbackBackground || null,
            description: ""
          };
    if (token !== this.detailLoadToken) {
      return;
    }
    this.resumeContentIds = buildResumeContentIds(meta, this.params);
    let progress = initialProgress;
    if (!progress && this.resumeContentIds.length > 1) {
      progress = await watchProgressRepository
        .getResumeByContentIds(this.resumeContentIds)
        .catch((error) => {
          console.warn("Detail resume lookup failed", error);
          return null;
        });
      if (token !== this.detailLoadToken) {
        return;
      }
    }
    this.resumeProgress = progress && isWatchProgressInProgress(progress) ? progress : null;
    this.isSavedInLibrary = isSaved;
    this.isMarkedWatched = Boolean(
      watchedItem ||
      (progress &&
        Number(progress.durationMs || 0) > 0 &&
        Number(progress.positionMs || 0) >= Number(progress.durationMs || 0))
    );

    // Fast first paint with base metadata.
    this.meta = meta;
    this.episodes = normalizeEpisodes(meta?.videos || []);
    this.castItems = extractCast(meta);
    const progressItemsForDetail = this.resumeProgress
      ? [this.resumeProgress, ...allProgressItems]
      : allProgressItems;
    this.buildEpisodeState(progressItemsForDetail, allWatchedItems);
    this.nextEpisodeToWatch = this.computeNextEpisodeToWatch(this.resumeProgress || progress);
    this.selectedSeason = this.resolveInitialSelectedSeason(
      this.resumeProgress || progress,
      progressItemsForDetail
    );
    this.selectedRatingSeason = this.selectedRatingSeason || this.selectedSeason || 1;
    this.moreLikeThisItems = [];
    this.moreLikeThisSource = null;
    this.collectionItems = [];
    this.collectionName = "";
    this.streamItems = [];
    this.trailerSource = resolveTrailerSource(meta);
    if (isSeriesDetailMeta(meta, this.episodes)) {
      this.seriesRatingsBySeason = {};
    } else {
      this.seriesRatingsBySeason = {};
    }
    this.render(meta);
    this.isLoadingDetail = false;
    this.maybeAutoOpenContinueWatchingStream();
    void this.refreshTrailerSource(meta, token);
    void this.loadTraktComments({ force: true });

    // Match Android TV: recommendations are an independent detail-page job.
    // Starting them from the base meta keeps slower artwork/credits enrichment
    // (and its optional cast fallback) from delaying or starving this section.
    void withTimeout(this.fetchMoreLikeThis(meta), 5000, [])
      .then((items) => {
        if (token !== this.detailLoadToken) {
          return;
        }
        this.moreLikeThisItems = Array.isArray(items) ? items : [];
        this.updateRenderedDetailSections(this.meta || meta);
      })
      .catch((error) => {
        console.warn("More like this background load failed", error);
      });

    // Background enrichments: do not block initial screen rendering.
    (async () => {
      const enrichedMeta = await withTimeout(this.enrichMeta(meta), 4000, meta);
      if (token !== this.detailLoadToken) {
        return;
      }

      this.meta = enrichedMeta || meta;
      this.episodes = normalizeEpisodes(this.meta?.videos || []);
      this.castItems = extractCast(this.meta);
      this.buildEpisodeState(progressItemsForDetail, allWatchedItems);
      this.trailerSource = resolveTrailerSource(this.meta);
      if (!this.castItems.length) {
        const fallbackCast = await withTimeout(this.fetchTmdbCastFallback(this.meta), 3200, []);
        if (Array.isArray(fallbackCast) && fallbackCast.length) {
          this.castItems = fallbackCast;
        }
      }
      this.selectedSeason = this.resolveInitialSelectedSeason(
        this.resumeProgress || progress,
        progressItemsForDetail
      );
      this.selectedRatingSeason = this.selectedRatingSeason || this.selectedSeason || 1;
      this.nextEpisodeToWatch = this.computeNextEpisodeToWatch(this.resumeProgress || progress);
      this.updateRenderedDetailSections(this.meta);
      void this.loadMdbListRatings(this.meta, token);
      void this.refreshTrailerSource(this.meta, token);
      void this.loadTraktComments({ force: true });

      const tasks = [];
      if (isSeriesDetailMeta(this.meta, this.episodes)) {
        tasks.push(withTimeout(this.fetchSeriesRatingsBySeason(this.meta), 5000, {}));
        const traktId = this.meta?.ids?.trakt;
        if (traktId) {
          tasks.push(
            withTimeout(
              detailWatchedEnrichmentService.enrichSeriesWatchedState(
                this.episodes,
                this.params?.itemId,
                traktId
              ),
              4500,
              new Map()
            )
          );
        }
      } else {
        tasks.push(
          withTimeout(this.fetchMovieCollection(this.meta), 5000, { items: [], name: "" })
        );
        const movieTraktId = this.meta?.ids?.trakt;
        if (movieTraktId) {
          tasks.push(
            withTimeout(
              detailWatchedEnrichmentService.enrichMovieWatchedState(
                this.params?.itemId,
                movieTraktId
              ),
              4500,
              null
            )
          );
        }
      }
      const results = await Promise.all(tasks);
      if (token !== this.detailLoadToken) {
        return;
      }
      if (isSeriesDetailMeta(this.meta, this.episodes)) {
        this.seriesRatingsBySeason = results[0] || {};
        if (this.meta?.ids?.trakt && results[1] instanceof Map) {
          this.enrichedWatchedState = results[1];
          this.buildEpisodeState(allProgressItems, allWatchedItems, this.enrichedWatchedState);
          this.updateRenderedDetailSections(this.meta);
        }
      } else {
        this.collectionItems = Array.isArray(results[0]?.items) ? results[0].items : [];
        this.collectionName = results[0]?.name || "";
        if (this.meta?.ids?.trakt && results[1]) {
          this.enrichedMovieState = results[1];
          this.isMarkedWatched = Boolean(this.enrichedMovieState?.isWatched);
          this.updateRenderedDetailSections(this.meta);
        }
      }
      this.updateRenderedDetailSections(this.meta);
    })().catch((error) => {
      console.warn("Detail background enrichment failed", error);
    });
  },

  async resolveCanonicalDetailItemId(itemId, itemType = "movie") {
    const rawItemId = String(itemId || "").trim();
    if (!/^tmdb:/i.test(rawItemId)) {
      return rawItemId;
    }
    try {
      const tmdbId = await TmdbService.ensureTmdbId(rawItemId, itemType);
      if (!tmdbId) {
        return rawItemId;
      }
      const enrichment = await TmdbMetadataService.fetchEnrichment({
        tmdbId,
        contentType: itemType,
        language: TmdbSettingsStore.get().language
      });
      const imdbId = String(enrichment?.imdbId || "").trim();
      return imdbId || rawItemId;
    } catch (error) {
      console.warn("Detail TMDB canonical id resolve failed", error);
      return rawItemId;
    }
  },

  async fetchMoreLikeThis(meta) {
    try {
      const trackingSettings = TraktSettingsStore.get();
      if (
        TraktAuthService.isAuthenticated() &&
        trackingSettings.moreLikeThisSource !== MoreLikeThisSourcePreference.TMDB
      ) {
        this.moreLikeThisSource = "trakt";
        return await this.fetchTraktRelated(meta);
      }
      const settings = TmdbSettingsStore.get();
      if (!settings.enabled || !settings.useMoreLikeThis) {
        this.moreLikeThisSource = null;
        return [];
      }
      this.moreLikeThisSource = "tmdb";
      // Android resolves the route type first, then the meta type, and treats
      // both `tv` and `series` as TMDB TV content even when episodes are absent.
      const routeType = String(this.params?.itemType || "").toLowerCase();
      const metaType = String(meta?.type || "").toLowerCase();
      const seriesTypes = ["series", "tv", "show", "tvshow"];
      const movieTypes = ["movie", "film"];
      const resolvedType = [...seriesTypes, ...movieTypes].includes(routeType)
        ? routeType
        : [...seriesTypes, ...movieTypes].includes(metaType)
          ? metaType
          : "movie";
      const type = seriesTypes.includes(resolvedType) ? "series" : "movie";
      const tmdbId =
        (await TmdbService.ensureTmdbId(meta?.id, type)) ||
        (await TmdbService.ensureTmdbId(this.params?.itemId, type)) ||
        (await this.searchTmdbIdByTitle(meta, type));
      if (!tmdbId) {
        return [];
      }
      const recommendations = await TmdbMetadataService.fetchRecommendations({
        tmdbId,
        contentType: type,
        language: settings.language
      });
      return (Array.isArray(recommendations) ? recommendations : [])
        .map((item) => normalizePreviewItem(item, type))
        .filter((item) => item.id && item.id !== String(meta?.id || ""))
        .slice(0, 12);
    } catch (error) {
      console.warn("More like this load failed", error);
      this.moreLikeThisSource = null;
      return [];
    }
  },

  async fetchTraktRelated(meta) {
    const routeType = String(this.params?.itemType || meta?.type || meta?.apiType || "")
      .trim()
      .toLowerCase();
    const type = ["series", "tv", "show", "tvshow"].includes(routeType) ? "series" : "movie";
    const apiType = type === "series" ? "show" : "movie";
    const token = await TraktAuthService.getValidAccessToken();
    if (!token) return [];

    const rawIds = [meta?.id, this.params?.itemId].map((value) => String(value || "").trim());
    const directImdb = resolveMetaImdbId(meta, this.params);
    const directTrakt = rawIds
      .map((value) => value.match(/^trakt:(.+)$/i)?.[1] || null)
      .find(Boolean);
    let pathId = directImdb || directTrakt || String(meta?.slug || "").trim();
    if (!pathId) {
      const tmdbId =
        meta?.tmdbId ||
        rawIds.map((value) => value.match(/^tmdb:(\d+)$/i)?.[1] || null).find(Boolean);
      if (tmdbId) {
        const search = await traktRequestJson(
          `/search/tmdb/${encodeURIComponent(String(tmdbId))}?type=${apiType}`,
          { authorization: `Bearer ${token}` }
        );
        if (search.response.ok) {
          const result = (Array.isArray(search.payload) ? search.payload : []).find(
            (entry) => String(entry?.type || "").toLowerCase() === apiType
          );
          const ids = (type === "series" ? result?.show : result?.movie)?.ids || {};
          pathId = ids.imdb || ids.trakt || ids.slug || "";
        }
      }
    }
    if (!pathId) return [];

    const target = type === "series" ? "shows" : "movies";
    const result = await traktRequestJson(
      `/${target}/${encodeURIComponent(String(pathId))}/related?extended=full%2Cimages&page=1&limit=20`,
      { authorization: `Bearer ${token}` }
    );
    if (result.response.status === 404) return [];
    if (!result.response.ok) {
      throw new Error(`Trakt related titles failed (${result.response.status})`);
    }
    return (Array.isArray(result.payload) ? result.payload : [])
      .map((item) => traktRelatedPreview(item, type))
      .filter((item) => item?.id && item.id !== String(meta?.id || ""))
      .slice(0, 20);
  },

  getAvailableSeasons(episodes = this.episodes) {
    const seasons = Array.from(
      new Set(
        (Array.isArray(episodes) ? episodes : [])
          .map((episode) => Number(episode?.season || 0))
          .filter((season) => Number.isFinite(season) && season >= 0)
      )
    );
    const regular = seasons.filter((season) => season > 0).sort((left, right) => left - right);
    const specials = seasons.filter((season) => season === 0);
    return [...regular, ...specials];
  },

  supportsTraktComments(meta = this.meta) {
    const type = String(meta?.type || meta?.apiType || this.params?.itemType || "")
      .trim()
      .toLowerCase();
    return (
      ["movie", "series", "tv", "show"].includes(type) || isSeriesDetailMeta(meta, this.episodes)
    );
  },

  resolveTraktCommentsTarget(meta = this.meta) {
    if (!this.supportsTraktComments(meta)) return null;
    const isEpisode = this.commentsMode === "episode" && this.commentsEpisodeTarget;
    const directId =
      resolveMetaImdbId(meta, this.params) ||
      String(meta?.slug || "").trim() ||
      String(meta?.id || this.params?.itemId || "")
        .split(":")
        .find((part) => /^tt\d+$/i.test(part)) ||
      String(this.params?.itemId || meta?.id || "").trim();
    if (!directId) return null;
    const isSeries = isSeriesDetailMeta(meta, this.episodes);
    if (isEpisode && isSeries) {
      const season = Number(this.commentsEpisodeTarget?.season || 0);
      const episode = Number(this.commentsEpisodeTarget?.episode || 0);
      if (season > 0 && episode > 0) {
        return {
          path: `/shows/${encodeURIComponent(directId)}/seasons/${season}/episodes/${episode}/comments/likes`
        };
      }
    }
    return {
      path: `/${isSeries ? "shows" : "movies"}/${encodeURIComponent(directId)}/comments/likes`
    };
  },

  async fetchTraktCommentsPage(page = 1) {
    const target = this.resolveTraktCommentsTarget(this.meta);
    if (!target || !TRAKT_CLIENT_ID) {
      return { items: [], page: 0, pageCount: 0 };
    }
    const token = await TraktAuthService.getValidAccessToken().catch(() => null);
    if (!token) {
      return { items: [], page: 0, pageCount: 0 };
    }
    const url = new URL(
      `${String(TRAKT_API_URL || "https://api.trakt.tv").replace(/\/+$/, "")}${target.path}`
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(TRAKT_COMMENTS_LIMIT));
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": TRAKT_CLIENT_ID,
        Authorization: `Bearer ${token}`
      }
    });
    if (response.status === 404) {
      return { items: [], page, pageCount: 0 };
    }
    if (!response.ok) {
      throw new Error(`Trakt comments failed (${response.status})`);
    }
    const payload = await response.json();
    const items = (Array.isArray(payload) ? payload : [])
      .filter((entry) => String(entry?.comment || "").trim())
      .map((entry) => ({
        id: Number(entry.id || 0),
        authorDisplayName: entry.user?.name || entry.user?.username || "Trakt user",
        authorUsername: entry.user?.username || "",
        comment: stripTraktSpoilerMarkup(entry.comment),
        spoiler: Boolean(entry.spoiler),
        containsInlineSpoilers: containsTraktInlineSpoiler(entry.comment),
        review: Boolean(entry.review),
        likes: Number(entry.likes || 0),
        rating: entry.user_stats?.rating ?? entry.userStats?.rating ?? null,
        createdAt: entry.created_at || entry.createdAt || ""
      }));
    return {
      items,
      page,
      pageCount: Number(response.headers.get("X-Pagination-Page-Count") || page || 0)
    };
  },

  async loadTraktComments({ force: _force = false, append = false } = {}) {
    if (
      !TraktSettingsStore.get().showMetaComments ||
      !TraktAuthService.isAuthenticated() ||
      !this.supportsTraktComments(this.meta)
    ) {
      this.commentsItems = [];
      this.commentsPage = 0;
      this.commentsPageCount = 0;
      this.commentsError = "";
      this.commentsLoading = false;
      this.commentsLoadingMore = false;
      return;
    }
    const page = append ? Number(this.commentsPage || 0) + 1 : 1;
    if (append && this.commentsPageCount > 0 && page > this.commentsPageCount) return;
    if (append) this.commentsLoadingMore = true;
    else this.commentsLoading = true;
    this.commentsError = "";
    this.updateRenderedDetailSections(this.meta);
    try {
      const result = await this.fetchTraktCommentsPage(page);
      const existingIds = new Set(
        (append ? this.commentsItems : []).map((item) => Number(item.id || 0))
      );
      const nextItems = result.items.filter((item) => !existingIds.has(Number(item.id || 0)));
      this.commentsItems = append ? [...this.commentsItems, ...nextItems] : nextItems;
      this.commentsPage = result.page;
      this.commentsPageCount = result.pageCount;
      this.commentsError = "";
    } catch (error) {
      console.warn("Trakt comments load failed", error);
      this.commentsError = t("detail_comments_error", {}, "Could not load Trakt comments.");
    } finally {
      this.commentsLoading = false;
      this.commentsLoadingMore = false;
      this.updateRenderedDetailSections(this.meta);
    }
  },

  hasAvailableSeason(season, episodes = this.episodes) {
    const wanted = Number(season || 0);
    return wanted >= 0 && this.getAvailableSeasons(episodes).includes(wanted);
  },

  findEpisodeFromProgress(progress = {}) {
    if (!this.episodes?.length || !progress) {
      return null;
    }
    const videoId = String(progress?.videoId || "").trim();
    if (videoId) {
      const directMatch = this.episodes.find((episode) => String(episode?.id || "") === videoId);
      if (directMatch) {
        return directMatch;
      }
    }
    const season = Number(progress?.season);
    const episode = Number(progress?.episode || 0);
    if (Number.isFinite(season) && season >= 0 && episode > 0) {
      return (
        this.episodes.find(
          (entry) =>
            Number(entry?.season || 0) === season && Number(entry?.episode || 0) === episode
        ) || null
      );
    }
    return null;
  },

  getNextEpisodeAfter(episode = null) {
    if (!episode || !this.episodes?.length) {
      return null;
    }
    const sequence = this.getEpisodeSequence(episode);
    const currentIndex = sequence.findIndex(
      (entry) =>
        String(entry?.id || "") === String(episode?.id || "") ||
        (Number(entry?.season || 0) === Number(episode?.season || 0) &&
          Number(entry?.episode || 0) === Number(episode?.episode || 0))
    );
    return currentIndex >= 0 ? sequence[currentIndex + 1] || null : null;
  },

  getEpisodeSequence(anchorEpisode = null) {
    const episodes = Array.isArray(this.episodes) ? this.episodes : [];
    const anchorSeason = Number(anchorEpisode?.season);
    const specials = episodes.filter((episode) => Number(episode?.season) === 0);
    const regular = episodes.filter((episode) => Number(episode?.season) > 0);
    if (Number.isFinite(anchorSeason) && anchorSeason === 0) {
      return specials;
    }
    return regular.length ? regular : specials;
  },

  getLatestSeriesProgress(progress = null, progressItems = []) {
    const contentId = String(this.params?.itemId || "").trim();
    const candidates = [];
    if (progress && String(progress?.contentId || contentId) === contentId) {
      candidates.push(progress);
    }
    (Array.isArray(progressItems) ? progressItems : []).forEach((entry) => {
      if (String(entry?.contentId || "").trim() !== contentId) {
        return;
      }
      if (
        (entry?.season == null || Number(entry.season) < 0) &&
        !String(entry?.videoId || "").trim()
      ) {
        return;
      }
      candidates.push(entry);
    });
    return (
      candidates.sort(
        (left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0)
      )[0] || null
    );
  },

  resolvePreferredSeasonFromProgress(progress = null, progressItems = []) {
    const routeSeasonRaw =
      this.params?.preferredSeason ?? this.params?.resumeSeason ?? this.params?.initialSeason;
    const routeSeason = Number(routeSeasonRaw);
    if (routeSeasonRaw != null && Number.isFinite(routeSeason) && routeSeason >= 0) {
      return routeSeason;
    }

    const latestProgress = this.getLatestSeriesProgress(progress, progressItems);
    const progressEpisode = this.findEpisodeFromProgress(latestProgress);
    if (progressEpisode) {
      if (detailProgressFraction(latestProgress) >= DETAIL_PROGRESS_END_THRESHOLD) {
        return Number(
          this.getNextEpisodeAfter(progressEpisode)?.season || progressEpisode.season || 0
        );
      }
      return Number(progressEpisode.season || 0);
    }

    const progressSeason = Number(latestProgress?.season);
    return latestProgress?.season != null && Number.isFinite(progressSeason) && progressSeason >= 0
      ? progressSeason
      : null;
  },

  resolveInitialSelectedSeason(progress = null, progressItems = []) {
    const seasons = this.getAvailableSeasons();
    const currentSeason = Number(this.selectedSeason || 0);
    if (this.hasManualSeasonSelection && currentSeason >= 0 && seasons.includes(currentSeason)) {
      return currentSeason;
    }
    const preferredSeason = this.resolvePreferredSeasonFromProgress(progress, progressItems);
    if (preferredSeason != null && (!seasons.length || seasons.includes(preferredSeason))) {
      return preferredSeason;
    }

    if (currentSeason > 0 && seasons.includes(currentSeason)) {
      return currentSeason;
    }

    return seasons[0] ?? 1;
  },

  computeNextEpisodeToWatch(progress) {
    if (!this.episodes?.length) {
      return null;
    }
    const currentEpisode = this.findEpisodeFromProgress(progress);
    const episodes = this.getEpisodeSequence(currentEpisode);
    if (!episodes.length) {
      return null;
    }
    if (currentEpisode && detailProgressFraction(progress) < DETAIL_PROGRESS_END_THRESHOLD) {
      return currentEpisode;
    }
    const completedKeys =
      this.watchedEpisodeKeys instanceof Set ? new Set(this.watchedEpisodeKeys) : new Set();
    if (currentEpisode && detailProgressFraction(progress) >= DETAIL_PROGRESS_END_THRESHOLD) {
      completedKeys.add(
        `${Number(currentEpisode.season || 0)}:${Number(currentEpisode.episode || 0)}`
      );
    }
    const isEpisodeCompleted = (episode) => {
      const key = `${Number(episode?.season || 0)}:${Number(episode?.episode || 0)}`;
      if (!key || key === "0:0") {
        return false;
      }
      if (
        currentEpisode &&
        detailProgressFraction(progress) >= DETAIL_PROGRESS_END_THRESHOLD &&
        Number(episode?.season || 0) === Number(currentEpisode.season || 0) &&
        Number(episode?.episode || 0) === Number(currentEpisode.episode || 0)
      ) {
        return true;
      }
      if (this.enrichedWatchedState?.has(key)) {
        return Boolean(this.enrichedWatchedState.get(key)?.isWatched);
      }
      return completedKeys.has(key);
    };
    let latestCompletedIndex = -1;
    episodes.forEach((episode, index) => {
      if (isEpisodeCompleted(episode)) {
        latestCompletedIndex = Math.max(latestCompletedIndex, index);
      }
    });
    if (latestCompletedIndex >= 0) {
      const nextUnwatched = episodes
        .slice(latestCompletedIndex + 1)
        .find((episode) => !isEpisodeCompleted(episode));
      if (nextUnwatched) {
        return nextUnwatched;
      }
      return episodes.find((episode) => !isEpisodeCompleted(episode)) || episodes[0];
    }
    if (!currentEpisode) {
      return episodes[0];
    }
    const currentIndex = episodes.findIndex(
      (episode) =>
        String(episode?.id || "") === String(currentEpisode?.id || "") ||
        (Number(episode?.season || 0) === Number(currentEpisode?.season || 0) &&
          Number(episode?.episode || 0) === Number(currentEpisode?.episode || 0))
    );
    return episodes[currentIndex + 1] || episodes[currentIndex] || episodes[0];
  },

  buildEpisodeState(progressItems = [], watchedItems = [], remoteWatchedMap = null) {
    const progressMap = new Map();
    const watchedKeys = new Set();
    const contentId = String(this.params?.itemId || "");
    this.enrichedWatchedState = remoteWatchedMap instanceof Map ? remoteWatchedMap : null;

    (Array.isArray(progressItems) ? progressItems : []).forEach((entry) => {
      if (String(entry?.contentId || "") !== contentId) {
        return;
      }
      const season = Number(entry?.season || 0);
      const episode = Number(entry?.episode || 0);
      if (!Number.isFinite(season) || season < 0 || !Number.isFinite(episode) || episode <= 0) {
        return;
      }
      const key = `${season}:${episode}`;
      progressMap.set(key, entry);
      if (detailProgressFraction(entry) >= DETAIL_PROGRESS_END_THRESHOLD) {
        watchedKeys.add(key);
      }
    });

    (Array.isArray(watchedItems) ? watchedItems : []).forEach((entry) => {
      const season = Number(entry?.season || 0);
      const episode = Number(entry?.episode || 0);
      if (
        String(entry?.contentId || "") === contentId &&
        Number.isFinite(season) &&
        season >= 0 &&
        Number.isFinite(episode) &&
        episode > 0
      ) {
        watchedKeys.add(`${season}:${episode}`);
      }
    });

    const animeWatchedKeys = new Set(
      (Array.isArray(watchedItems) ? watchedItems : [])
        .filter((entry) => entry?.episode != null)
        .map(
          (entry) => `${String(entry.contentId || "").toLowerCase()}:${Number(entry.episode || 0)}`
        )
    );
    (this.episodes || []).forEach((video) => {
      const match = String(video?.id || "").match(/^(mal|anidb|anilist|kitsu):(\d+):(\d+)/i);
      if (
        !match ||
        !animeWatchedKeys.has(`${match[1].toLowerCase()}:${match[2]}:${Number(match[3])}`)
      ) {
        return;
      }
      const season = Number(video?.season || 0);
      const episode = Number(video?.episode || 0);
      if (season >= 0 && episode > 0) watchedKeys.add(`${season}:${episode}`);
    });

    this.episodeProgressMap = progressMap;
    this.watchedEpisodeKeys = watchedKeys;
  },

  async fetchMovieCollection(meta = {}) {
    try {
      const settings = TmdbSettingsStore.get();
      if (!settings.enabled || !settings.useCollections) {
        return { name: "", items: [] };
      }
      const collectionId =
        meta?.collectionId || meta?.belongsToCollection?.id || meta?.belongs_to_collection?.id;
      if (!collectionId) {
        return { name: "", items: [] };
      }
      const items = await TmdbMetadataService.fetchMovieCollection({
        collectionId,
        language: settings.language
      });
      const normalized = (Array.isArray(items) ? items : [])
        .map((item) => normalizePreviewItem(item, "movie"))
        .filter((item) => item.id && item.id !== String(meta.id || ""))
        .slice(0, 18);
      return {
        name:
          meta?.collectionName ||
          meta?.belongsToCollection?.name ||
          meta?.belongs_to_collection?.name ||
          "",
        items: normalized
      };
    } catch (error) {
      console.warn("Movie collection enrichment failed", error);
      return { name: "", items: [] };
    }
  },

  findContinueWatchingEpisodeTarget() {
    const resumeVideoId = String(this.params?.resumeVideoId || "").trim();
    if (resumeVideoId) {
      const directMatch = this.episodes.find((entry) => String(entry?.id || "") === resumeVideoId);
      if (directMatch) {
        return directMatch;
      }
    }
    const resumeSeasonRaw = this.params?.resumeSeason;
    const resumeSeason = Number(resumeSeasonRaw);
    const resumeEpisode = Number(this.params?.resumeEpisode || 0);
    if (
      resumeSeasonRaw != null &&
      Number.isFinite(resumeSeason) &&
      resumeSeason >= 0 &&
      resumeEpisode > 0
    ) {
      const episodeMatch = this.episodes.find(
        (entry) =>
          Number(entry?.season || 0) === resumeSeason &&
          Number(entry?.episode || 0) === resumeEpisode
      );
      if (episodeMatch) {
        return episodeMatch;
      }
    }
    return this.nextEpisodeToWatch || this.episodes[0] || null;
  },

  maybeAutoOpenContinueWatchingStream() {
    if (
      !this.params?.autoOpenContinueWatching ||
      this.autoOpenedContinueWatchingStream ||
      this.isBackNavigation
    ) {
      return;
    }
    this.autoOpenedContinueWatchingStream = true;
    const routeStartFromBeginning = Boolean(this.params?.startFromBeginning);
    const extraParams = {
      resumePositionMs: routeStartFromBeginning
        ? 0
        : Number(this.params?.resumeProgressMs || 0) || 0,
      resumeProgressPercent: routeStartFromBeginning
        ? null
        : (this.params?.resumeProgressPercent ?? this.resumeProgress?.progressPercent ?? null),
      resumeDurationMs: routeStartFromBeginning
        ? 0
        : Number(this.params?.resumeDurationMs || this.resumeProgress?.durationMs || 0) || 0,
      startFromBeginning: routeStartFromBeginning,
      manualSelection: Boolean(this.params?.manualSelection),
      returnToDetail: true,
      continueWatchingBackHome: true,
      resumeStreamIdentity: this.params?.resumeStreamIdentity || null
    };
    if (isSeriesDetailMeta(this.meta, this.episodes)) {
      const episode = this.findContinueWatchingEpisodeTarget();
      if (episode) {
        this.navigateToStreamScreenForEpisode(episode, extraParams);
        return;
      }
    }
    this.navigateToStreamScreenForMovie(extraParams);
  },

  getStreamNavigationOptions() {
    // Continue Watching mounts Detail only to resolve the Stream target. Replace
    // that transient browser-history entry too, otherwise it can resurface after
    // the user returns Home and opens a different title.
    return this.params?.autoOpenContinueWatching
      ? { skipStackPush: true, replaceHistory: true }
      : {};
  },

  navigateBackFromDetail() {
    if (this.params?.returnToSearchOnBack) {
      Router.navigate(
        "search",
        {},
        {
          isBackNavigation: true,
          skipStackPush: true,
          replaceHistory: true
        }
      );
      return true;
    }
    if (this.params?.returnHomeOnBack) {
      Router.navigate(
        "home",
        {},
        {
          isBackNavigation: true,
          skipStackPush: true,
          replaceHistory: true
        }
      );
      return true;
    }
    return false;
  },

  async enrichMeta(meta) {
    const settings = TmdbSettingsStore.get();
    if (!settings.enabled || !TMDB_API_KEY || !meta?.id) {
      return meta;
    }

    try {
      const tmdbId = await TmdbService.ensureTmdbId(meta.id, meta.type);
      if (!tmdbId) {
        return meta;
      }
      const enrichment = await TmdbMetadataService.fetchEnrichment({
        tmdbId,
        contentType: meta.type,
        language: settings.language
      });
      if (!enrichment) {
        return meta;
      }
      const isSeries = isSeriesDetailMeta(meta, meta?.videos || this.episodes);
      const episodeMap =
        settings.useEpisodes && isSeries
          ? await TmdbMetadataService.fetchEpisodeEnrichment({
              tmdbId,
              seasonNumbers: (Array.isArray(meta.videos) ? meta.videos : [])
                .map((video) => Number(video?.season || 0))
                .filter((season) => season > 0),
              language: settings.language
            })
          : new Map();
      const videos =
        episodeMap.size && Array.isArray(meta.videos)
          ? meta.videos.map((video) => {
              const key =
                Number(video?.season || 0) > 0 && Number(video?.episode || 0) > 0
                  ? `${Number(video.season)}:${Number(video.episode)}`
                  : "";
              const episode = key ? episodeMap.get(key) : null;
              if (!episode) {
                return video;
              }
              return {
                ...video,
                title: episode.title || video.title,
                overview: episode.overview || video.overview,
                released: settings.useReleaseDates
                  ? episode.airDate || video.released
                  : video.released,
                thumbnail: episode.thumbnail || video.thumbnail,
                runtime: episode.runtime || video.runtime
              };
            })
          : meta.videos;

      return {
        ...meta,
        name: settings.useBasicInfo ? enrichment.localizedTitle || meta.name : meta.name,
        description: settings.useBasicInfo
          ? enrichment.description || meta.description
          : meta.description,
        background: settings.useArtwork ? enrichment.backdrop || meta.background : meta.background,
        poster: settings.useArtwork ? enrichment.poster || meta.poster : meta.poster,
        // TMDB enrichment deliberately returns no logo when only unrelated
        // languages are available; show the localized text title in that case.
        logo: settings.useArtwork ? enrichment.logo : meta.logo,
        genres: settings.useBasicInfo
          ? mergeGenreLists(meta.genres, enrichment.genres)
          : meta.genres,
        releaseInfo: settings.useReleaseDates
          ? meta.releaseInfo || enrichment.releaseInfo
          : meta.releaseInfo,
        released: settings.useReleaseDates
          ? meta.released || meta.releaseDate || meta.release_date || enrichment.released || null
          : meta.released || meta.releaseDate || meta.release_date || null,
        runtime: settings.useDetails ? enrichment.runtime || meta.runtime : meta.runtime,
        country: settings.useDetails ? enrichment.country || meta.country : meta.country,
        language: settings.useDetails ? enrichment.language || meta.language : meta.language,
        originalLanguage:
          enrichment.originalLanguage || meta.originalLanguage || meta.original_language || null,
        imdbId: enrichment.imdbId || meta.imdbId || meta.imdb_id || null,
        tmdbRating:
          settings.useBasicInfo && typeof enrichment.rating === "number"
            ? Number(enrichment.rating.toFixed(1))
            : meta.tmdbRating || null,
        credits: settings.useCredits
          ? enrichment.credits || meta.credits || null
          : meta.credits || null,
        companies:
          settings.useProductions && Array.isArray(enrichment.companies)
            ? enrichment.companies
            : meta.companies || [],
        productionCompanies:
          settings.useProductions && Array.isArray(enrichment.productionCompanies)
            ? enrichment.productionCompanies
            : Array.isArray(meta.productionCompanies)
              ? meta.productionCompanies
              : [],
        networks:
          settings.useNetworks && Array.isArray(enrichment.networks)
            ? enrichment.networks
            : Array.isArray(meta.networks)
              ? meta.networks
              : [],
        trailers:
          Array.isArray(meta.trailers) && meta.trailers.length
            ? meta.trailers
            : settings.useTrailers && Array.isArray(enrichment.trailers)
              ? enrichment.trailers
              : [],
        trailerYtIds:
          Array.isArray(meta.trailerYtIds) && meta.trailerYtIds.length
            ? meta.trailerYtIds
            : settings.useTrailers && Array.isArray(enrichment.trailerYtIds)
              ? enrichment.trailerYtIds
              : [],
        collectionId:
          (settings.useCollections ? enrichment.collectionId : null) ||
          meta.collectionId ||
          meta?.belongsToCollection?.id ||
          meta?.belongs_to_collection?.id ||
          null,
        collectionName:
          (settings.useCollections ? enrichment.collectionName : null) ||
          meta.collectionName ||
          meta?.belongsToCollection?.name ||
          meta?.belongs_to_collection?.name ||
          "",
        belongsToCollection:
          settings.useCollections && enrichment.collectionId
            ? { id: enrichment.collectionId, name: enrichment.collectionName || "" }
            : meta.belongsToCollection || meta.belongs_to_collection || null,
        videos
      };
    } catch (error) {
      console.warn("Meta TMDB enrichment failed", error);
      return meta;
    }
  },

  async searchTmdbIdByTitle(meta = {}, contentType = "movie") {
    const settings = TmdbSettingsStore.get();
    const apiKey = String(TMDB_API_KEY || "").trim();
    if (!settings.enabled || !apiKey) {
      return null;
    }
    const name = String(meta?.name || "").trim();
    if (!name) {
      return null;
    }
    const type = contentType === "series" || contentType === "tv" ? "tv" : "movie";
    const releaseYear = String(meta?.releaseInfo || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
    const yearParam = releaseYear
      ? type === "tv"
        ? `&first_air_date_year=${encodeURIComponent(releaseYear)}`
        : `&year=${encodeURIComponent(releaseYear)}`
      : "";
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(settings.language || "en")}&query=${encodeURIComponent(name)}${yearParam}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    return first?.id ? String(first.id) : null;
  },

  async fetchTmdbCastFallback(meta = {}) {
    const settings = TmdbSettingsStore.get();
    if (!settings.enabled || !settings.useCredits) {
      return [];
    }
    const contentType = String(meta?.type || this.params?.itemType || "movie").toLowerCase();
    const normalizedType = contentType === "tv" ? "series" : contentType;
    let tmdbId = await TmdbService.ensureTmdbId(meta?.id, normalizedType);
    if (!tmdbId) {
      tmdbId = await this.searchTmdbIdByTitle(meta, normalizedType);
    }
    if (!tmdbId) {
      return [];
    }
    const enrichment = await TmdbMetadataService.fetchEnrichment({
      tmdbId,
      contentType: normalizedType,
      language: settings.language
    });
    const fallbackCast = extractCast({ credits: enrichment?.credits || null });
    return Array.isArray(fallbackCast) ? fallbackCast : [];
  },

  async fetchSeriesRatingsBySeason(meta) {
    try {
      if (!meta?.id || !this.episodes?.length) {
        return {};
      }
      const imdbId = resolveMetaImdbId(meta, this.params);
      const knownTmdbId = resolveMetaTmdbId(meta, this.params);
      const tmdbId =
        knownTmdbId ||
        (await TmdbService.ensureTmdbId(meta.id, "series", {
          // Episode IMDb ratings are independent from optional TMDB metadata
          // enrichment, matching Android TV's detail-screen behavior.
          requireEnabled: false
        }));
      if (!imdbId && !tmdbId) {
        return {};
      }
      return await imdbEpisodeRatingsRepository.getEpisodeRatings({ imdbId, tmdbId });
    } catch (error) {
      console.warn("Series ratings enrichment failed", error);
      return {};
    }
  },

  async resolvePreferredTrailerSource(meta = this.meta) {
    if (!meta) {
      return null;
    }
    return resolveTrailerSource(meta);
  },

  async refreshTrailerSource(meta = this.meta, token = this.detailLoadToken) {
    const nextSource = await this.resolvePreferredTrailerSource(meta);
    if (token !== this.detailLoadToken) {
      return;
    }
    const currentKey = JSON.stringify(this.trailerSource || null);
    const nextKey = JSON.stringify(nextSource || null);
    if (currentKey === nextKey) {
      return;
    }
    this.trailerSource = nextSource;
    if (!this.isTrailerPlaying) {
      this.updateRenderedDetailSections(this.meta || meta);
    }
  },

  flattenStreams(streamResult) {
    if (!streamResult || streamResult.status !== "success") {
      return [];
    }

    const flattened = [];
    (streamResult.data || []).forEach((group) => {
      const groupName = group.addonName || "Addon";
      (group.streams || []).forEach((stream, index) => {
        const streamOrigin = {
          ...(group.streamOrigin || {}),
          ...(stream.streamOrigin || {}),
          addonId:
            stream.addonId ||
            group.addonId ||
            group.streamOrigin?.addonId ||
            stream.streamOrigin?.addonId ||
            null,
          addonBaseUrl:
            stream.addonBaseUrl ||
            group.addonBaseUrl ||
            group.streamOrigin?.addonBaseUrl ||
            stream.streamOrigin?.addonBaseUrl ||
            null,
          addonName:
            stream.addonName ||
            group.addonName ||
            group.streamOrigin?.addonName ||
            stream.streamOrigin?.addonName ||
            groupName,
          sourceProviderId:
            stream.sourceProviderId ||
            group.sourceProviderId ||
            stream.streamOrigin?.sourceProviderId ||
            group.streamOrigin?.sourceProviderId ||
            null
        };
        const entry = {
          id: `${groupName}-${index}-${stream.url || stream.externalUrl || stream.ytId || ""}`,
          label: stream.title || stream.name || `${groupName} stream`,
          description: stream.description || stream.name || "",
          addonId: stream.addonId || group.addonId || null,
          addonBaseUrl: stream.addonBaseUrl || group.addonBaseUrl || null,
          addonName: groupName,
          addonLogo: group.addonLogo || stream.addonLogo || null,
          addonOrderIndex: Number.isFinite(Number(stream.addonOrderIndex))
            ? Number(stream.addonOrderIndex)
            : Number(group.addonOrderIndex ?? Number.MAX_SAFE_INTEGER),
          sourceProviderId: stream.sourceProviderId || group.sourceProviderId || null,
          streamOrigin,
          sourceType: stream.type || stream.source || "",
          url: stream.url || stream.externalUrl || "",
          ytId: stream.ytId || null,
          infoHash: stream.infoHash || null,
          fileIdx: stream.fileIdx ?? null,
          externalUrl: stream.externalUrl || null,
          behaviorHints: stream.behaviorHints || null,
          subtitles: Array.isArray(stream.subtitles) ? stream.subtitles : [],
          raw: stream
        };
        if (entry.url) {
          flattened.push(entry);
        }
      });
    });
    return flattened;
  },

  mergeStreamItems(existing = [], incoming = []) {
    const byKey = new Set();
    const merged = [];
    const push = (item) => {
      if (!item?.url) {
        return;
      }
      const key = [
        String(item.addonName || "Addon"),
        String(item.url || ""),
        String(item.sourceType || ""),
        String(item.label || "")
      ].join("::");
      if (byKey.has(key)) {
        return;
      }
      byKey.add(key);
      merged.push(item);
    };
    (existing || []).forEach(push);
    (incoming || []).forEach(push);
    return merged;
  },

  render(meta, _focusRestore = undefined) {
    this.renderPhone(meta);
  },

  getSeriesHeroPlayLabel() {
    const progress = this.getActiveResumeProgress();
    if (progress) {
      const season = Number(progress.season || this.nextEpisodeToWatch?.season || 0);
      const episode = Number(progress.episode || this.nextEpisodeToWatch?.episode || 0);
      return season >= 0 && episode > 0
        ? t("detail.resumeEpisodeShort", { season, episode }, "Resume S{{season}}E{{episode}}")
        : t("detail.resume", {}, "Resume");
    }
    return this.nextEpisodeToWatch
      ? t(
          "detail.nextEpisodeShort",
          { season: this.nextEpisodeToWatch.season, episode: this.nextEpisodeToWatch.episode },
          "Next S{{season}}E{{episode}}"
        )
      : t("detail.play", {}, "Play");
  },

  getMovieHeroPlayLabel() {
    return this.getActiveResumeProgress()
      ? t("detail.resume", {}, "Resume")
      : t("detail.play", {}, "Play");
  },

  async loadMdbListRatings(meta, token = this.detailLoadToken) {
    const lookupMeta = metaWithRouteExternalIds(meta, this.params);
    const ratingsResult = await mdbListRepository
      .getRatingsForMeta(lookupMeta, this.params?.itemId || "", this.params?.itemType || "movie")
      .catch(() => null);
    if (token !== this.detailLoadToken) {
      return;
    }
    this.meta = {
      ...(this.meta || meta || {}),
      mdbListRatings: ratingsResult?.ratings || null,
      showMdbListImdb: ratingsResult?.hasImdbRating === true
    };
    this.updateRenderedDetailSections(this.meta);
  },

  getActiveResumeProgress() {
    const progress = this.resumeProgress || null;
    return progress && isWatchProgressInProgress(progress) ? progress : null;
  },

  getSelectedSeasonEpisodes() {
    return this.getSelectedSeasonEpisodeState().episodes;
  },

  getSelectedSeasonEpisodeState() {
    const allEpisodes = Array.isArray(this.episodes) ? this.episodes : [];
    const season = Number(this.selectedSeason || 0);
    const cachedState = this.selectedSeasonEpisodeState;
    if (cachedState?.source === allEpisodes && cachedState.season === season) {
      return cachedState;
    }
    const seasonEpisodes = [];
    const indexByVideoId = new Map();
    for (const episode of allEpisodes) {
      if (Number(episode?.season || 0) !== season) {
        continue;
      }
      const absoluteIndex = seasonEpisodes.length;
      seasonEpisodes.push(episode);
      const videoId = String(episode?.id || "").trim();
      if (videoId && !indexByVideoId.has(videoId)) {
        indexByVideoId.set(videoId, absoluteIndex);
      }
    }
    this.selectedSeasonEpisodeState = {
      source: allEpisodes,
      season,
      episodes: seasonEpisodes,
      indexByVideoId
    };
    return this.selectedSeasonEpisodeState;
  },

  getEpisodeByVideoId(videoId) {
    const wanted = String(videoId || "").trim();
    if (!wanted) {
      return null;
    }
    return this.episodes.find((episode) => String(episode?.id || "") === wanted) || null;
  },

  getEpisodeMenuProgress(episode) {
    if (!episode) {
      return null;
    }
    return (
      this.episodeProgressMap.get(
        `${Number(episode.season || 0)}:${Number(episode.episode || 0)}`
      ) || null
    );
  },

  isEpisodeMarkedWatched(episode) {
    if (!episode) {
      return false;
    }
    const key = `${Number(episode.season || 0)}:${Number(episode.episode || 0)}`;
    if (this.enrichedWatchedState?.has(key)) {
      return Boolean(this.enrichedWatchedState.get(key)?.isWatched);
    }
    return this.watchedEpisodeKeys.has(key);
  },

  getCurrentLibraryItem() {
    return {
      itemId: this.params?.itemId || this.meta?.id || "",
      itemType: this.params?.itemType || this.meta?.type || "movie",
      title: this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
      poster: this.meta?.poster || null,
      background: this.meta?.background || this.meta?.landscapePoster || null,
      description: this.meta?.description || "",
      releaseInfo: this.meta?.releaseInfo || "",
      imdbRating: this.meta?.imdbRating == null ? null : Number(this.meta.imdbRating),
      genres: Array.isArray(this.meta?.genres) ? this.meta.genres : []
    };
  },

  getResumeParamsForProgress(
    progress = null,
    { startOver = false, useActiveFallback = true } = {}
  ) {
    if (startOver) {
      return {
        startFromBeginning: true,
        resumePositionMs: 0,
        resumeProgressPercent: null,
        resumeDurationMs: 0
      };
    }
    const resume = progress || (useActiveFallback ? this.getActiveResumeProgress() : null);
    if (!resume || !isWatchProgressInProgress(resume)) {
      return {};
    }
    const params = {
      resumePositionMs: resolveWatchProgressResumePositionMs(resume),
      resumeProgressPercent:
        Number(resume.progressPercent ?? detailProgressFraction(resume) * 100) || null,
      resumeDurationMs: Number(resume.durationMs || 0) || 0
    };
    return params;
  },

  async playDefaultFromHero(options = {}) {
    const startOver = Boolean(options?.startOver);
    const manualSelection = Boolean(options?.manualSelection);
    if (isSeriesDetailMeta(this.meta, this.episodes)) {
      const targetEpisode =
        this.nextEpisodeToWatch ||
        this.episodes?.find((entry) => entry.season === this.selectedSeason) ||
        this.episodes?.[0] ||
        null;
      if (targetEpisode?.id) {
        await this.openEpisodeStreamChooser(targetEpisode.id, { startOver, manualSelection });
      }
      return;
    }
    await this.openMovieStreamChooser({ startOver, manualSelection });
  },

  async toggleLibraryFromHero() {
    await savedLibraryRepository.toggle({
      contentId: this.params?.itemId,
      contentType: this.params?.itemType || "movie",
      title: this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
      poster: this.meta?.poster || null,
      background: this.meta?.background || null
    });
    this.isSavedInLibrary = !this.isSavedInLibrary;
  },

  // Whole-title "mark watched" toggle, extracted verbatim (ticket 02-01, mobile-parity epic)
  // from its previous home inline inside the TV click dispatcher's `action === "toggleWatched"`
  // branch — a pure move-method refactor, zero behavior change. Called from both the original
  // TV dispatch site and js/ui/screens/detail/metaDetailsScreenPhone.js's own tap dispatch, so
  // neither has to duplicate this ~45-line data-layer sequence.
  async toggleWatchedFromDetail() {
    const focusRestore = this.captureDetailFocus();
    const isSeries = isSeriesDetailMeta(this.meta, this.episodes);
    if (isSeries) {
      if (this.isMarkedWatched) {
        await watchedSeriesReconciliationService.unmarkSeriesWatched(this.params?.itemId, {
          meta: this.meta
        });
      } else {
        await watchedSeriesReconciliationService.markSeriesWatched(
          this.params?.itemId,
          this.params?.itemType || this.meta?.type || "series",
          {
            meta: this.meta,
            title: this.meta?.name || this.params?.fallbackTitle || "Untitled"
          }
        );
      }
    } else if (this.isMarkedWatched) {
      await watchedItemsRepository.unmark(this.params?.itemId);
      await watchProgressRepository.removeProgress(this.params?.itemId);
    } else {
      await watchedItemsRepository.mark({
        contentId: this.params?.itemId,
        contentType: this.params?.itemType || "movie",
        title: this.meta?.name || this.params?.fallbackTitle || "Untitled",
        watchedAt: Date.now()
      });
      await watchProgressRepository.saveProgress({
        contentId: this.params?.itemId,
        contentType: this.params?.itemType || "movie",
        videoId: null,
        positionMs: 100,
        durationMs: 100,
        updatedAt: Date.now()
      });
    }
    if (!isSeries && this.meta?.ids?.trakt) {
      const enriched = await detailWatchedEnrichmentService.enrichMovieWatchedState(
        this.params?.itemId,
        this.meta.ids.trakt
      );
      this.enrichedMovieState = enriched;
      this.isMarkedWatched = Boolean(enriched?.isWatched);
    }
    await this.refreshEpisodePlaybackState();
    this.render(this.meta, focusRestore);
  },

  getSeasonEpisodes(season) {
    const seasonNumber = Number(season || 0);
    return (this.episodes || []).filter((episode) => Number(episode?.season || 0) === seasonNumber);
  },

  isSeasonFullyWatched(season) {
    const episodes = this.getSeasonEpisodes(season);
    return episodes.length > 0 && episodes.every((episode) => this.isEpisodeMarkedWatched(episode));
  },

  getPreviousEpisodes(episode) {
    if (!episode) {
      return [];
    }
    const targetSeason = Number(episode?.season || 0);
    const targetEpisode = Number(episode?.episode || 0);
    return (this.episodes || []).filter((entry) => {
      const entrySeason = Number(entry?.season || 0);
      const entryEpisode = Number(entry?.episode || 0);
      return (
        entrySeason < targetSeason || (entrySeason === targetSeason && entryEpisode < targetEpisode)
      );
    });
  },

  async setEpisodesWatchedState(episodes = [], watched = true) {
    const targets = (episodes || []).filter((episode) => episode?.id);
    if (!targets.length) {
      return false;
    }
    for (const episode of targets) {
      if (watched) {
        await watchedItemsRepository.mark({
          contentId: this.params?.itemId,
          contentType: "series",
          title: this.meta?.name || this.params?.fallbackTitle || episode.title || "Untitled",
          season: episode.season,
          episode: episode.episode,
          videoId: episode.id,
          watchedAt: Date.now()
        });
        await watchProgressRepository.saveProgress({
          contentId: this.params?.itemId,
          contentType: "series",
          videoId: episode.id,
          season: episode.season,
          episode: episode.episode,
          positionMs: 100,
          durationMs: 100,
          updatedAt: Date.now()
        });
      } else {
        await watchedItemsRepository.unmark(this.params?.itemId, {
          season: episode.season,
          episode: episode.episode,
          videoId: episode.id
        });
        await watchProgressRepository.removeProgress(this.params?.itemId, episode.id);
      }
    }
    if (isSeriesDetailMeta(this.meta, this.episodes)) {
      await watchedSeriesReconciliationService.reconcile(
        this.params?.itemId,
        this.params?.itemType || this.meta?.type || "series",
        { meta: this.meta }
      );
    }
    await this.refreshEpisodePlaybackState();
    return true;
  },

  async setSeasonWatchedState(season, watched) {
    const episodes = this.getSeasonEpisodes(season);
    if (!episodes.length) {
      return false;
    }
    await this.setEpisodesWatchedState(episodes, watched);
    this.episodeHoldMenu = null;
    this.seasonHoldMenu = null;
    this.syncEpisodePlaybackDom(episodes);
    return true;
  },

  async markPreviousEpisodesWatched(episode) {
    const previousEpisodes = this.getPreviousEpisodes(episode);
    if (!previousEpisodes.length) {
      return false;
    }
    await this.setEpisodesWatchedState(previousEpisodes, true);
    this.episodeHoldMenu = null;
    this.syncEpisodePlaybackDom(previousEpisodes);
    return true;
  },

  async refreshEpisodePlaybackState() {
    detailWatchedEnrichmentService.invalidateCache(this.params?.itemId);
    const [progress, allProgressItems, allWatchedItems, watchedItem] = await Promise.all([
      watchProgressRepository.getResumeByContentIds(
        this.resumeContentIds?.length ? this.resumeContentIds : [this.params?.itemId]
      ),
      watchProgressRepository.getAll(),
      watchedItemsRepository.getAll(),
      watchedItemsRepository.isWatched(this.params?.itemId)
    ]);
    this.resumeProgress = progress && isWatchProgressInProgress(progress) ? progress : null;
    this.isMarkedWatched = Boolean(
      watchedItem ||
      (progress &&
        Number(progress.durationMs || 0) > 0 &&
        Number(progress.positionMs || 0) >= Number(progress.durationMs || 0))
    );
    const progressItemsForDetail = this.resumeProgress
      ? [this.resumeProgress, ...allProgressItems]
      : allProgressItems;
    this.buildEpisodeState(progressItemsForDetail, allWatchedItems, this.enrichedWatchedState);
    this.nextEpisodeToWatch = this.computeNextEpisodeToWatch(this.resumeProgress || progress);
  },

  async setEpisodeWatchedState(episode, watched) {
    if (!episode?.id) {
      return false;
    }
    if (watched) {
      await watchedItemsRepository.mark({
        contentId: this.params?.itemId,
        contentType: "series",
        title: this.meta?.name || this.params?.fallbackTitle || episode.title || "Untitled",
        season: episode.season,
        episode: episode.episode,
        videoId: episode.id,
        watchedAt: Date.now()
      });
      await watchProgressRepository.saveProgress({
        contentId: this.params?.itemId,
        contentType: "series",
        videoId: episode.id,
        season: episode.season,
        episode: episode.episode,
        positionMs: 100,
        durationMs: 100,
        updatedAt: Date.now()
      });
    } else {
      await watchedItemsRepository.unmark(this.params?.itemId, {
        season: episode.season,
        episode: episode.episode,
        videoId: episode.id
      });
      await watchProgressRepository.removeProgress(this.params?.itemId, episode.id);
    }
    if (isSeriesDetailMeta(this.meta, this.episodes)) {
      await watchedSeriesReconciliationService.reconcile(
        this.params?.itemId,
        this.params?.itemType || this.meta?.type || "series",
        {
          meta: this.meta,
          completedEpisode: watched
            ? {
                season: episode.season,
                episode: episode.episode
              }
            : null
        }
      );
    }
    await this.refreshEpisodePlaybackState();
    this.episodeHoldMenu = null;
    this.syncEpisodePlaybackDom([episode]);
    return true;
  },

  async activateEpisodeHoldMenuOption() {
    const episode = this.getEpisodeHoldMenuEpisode();
    const options = this.getEpisodeHoldMenuOptions();
    const option =
      options[
        Math.max(0, Math.min(options.length - 1, Number(this.episodeHoldMenu?.optionIndex || 0)))
      ];
    if (!episode || !option) {
      return false;
    }
    if (option.action === "play") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.startEpisodeFromHoldMenu(episode);
    }
    if (option.action === "playFromBeginning") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.startEpisodeFromHoldMenu(episode, { startOver: true });
    }
    if (option.action === "playManually") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.startEpisodeFromHoldMenu(episode, { manualSelection: true });
    }
    if (option.action === "toggleWatched") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.setEpisodeWatchedState(episode, !this.isEpisodeMarkedWatched(episode));
    }
    if (option.action === "markSeasonWatched" || option.action === "markSeasonUnwatched") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.setSeasonWatchedState(episode.season, option.action === "markSeasonWatched");
    }
    if (option.action === "markPreviousWatched") {
      this.closeEpisodeHoldMenu({ restoreFocus: false });
      return this.markPreviousEpisodesWatched(episode);
    }
    return false;
  },

  async activateSeasonHoldMenuOption() {
    const season = this.getSeasonHoldMenuSeason();
    const options = this.getSeasonHoldMenuOptions();
    const option =
      options[
        Math.max(0, Math.min(options.length - 1, Number(this.seasonHoldMenu?.optionIndex || 0)))
      ];
    if (season == null || !option) {
      return false;
    }
    if (option.action === "markSeasonWatched" || option.action === "markSeasonUnwatched") {
      this.closeSeasonHoldMenu({ restoreFocus: false });
      return this.setSeasonWatchedState(season, option.action === "markSeasonWatched");
    }
    return false;
  },

  async activateHeroOptionsMenu(actionOverride = "") {
    if (this.heroPlayMenu) {
      this.closeHeroMenus({ restoreFocus: false });
      await this.playDefaultFromHero({
        startOver: actionOverride === "playFromBeginning",
        manualSelection: actionOverride === "playManually"
      });
      return true;
    }
    if (!this.libraryListMenu) {
      return false;
    }
    const action = String(actionOverride || "");
    if (action.startsWith("toggleLibraryList:")) {
      const key = action.slice("toggleLibraryList:".length);
      const nextSelected = !this.libraryListMenu.membership?.[key];
      this.libraryListMenu.membership =
        this.libraryListMenu.sourceMode === LibrarySourceMode.SIMKL
          ? Object.fromEntries(
              this.libraryListMenu.tabs.map((tab) => [tab.key, nextSelected && tab.key === key])
            )
          : { ...(this.libraryListMenu.membership || {}), [key]: nextSelected };
      this.libraryListMenu.destructiveRemovalRequired = false;
      if (this.libraryListMenu.sourceMode === LibrarySourceMode.SIMKL) {
        this.mountLibraryListDialog();
      } else {
        this.detailHoldDialog?.setButtonSelected?.(
          action,
          Boolean(this.libraryListMenu.membership[key])
        );
      }
      return true;
    }
    if (action === "saveLibraryLists" || action === "confirmDestructiveSimklRemoval") {
      try {
        await libraryRepository.applyMembershipChanges(
          this.libraryListMenu.item,
          {
            desiredMembership: this.libraryListMenu.membership || {}
          },
          {
            destructiveRemovalConfirmed: action === "confirmDestructiveSimklRemoval"
          }
        );
        this.isSavedInLibrary = Object.values(this.libraryListMenu.membership || {}).some(Boolean);
        this.closeHeroMenus({ restoreFocus: false });
        this.syncDetailActionButtons();
      } catch (error) {
        console.warn("Failed to update library lists", error);
        this.libraryListMenu.destructiveRemovalRequired =
          error?.code === "SIMKL_DESTRUCTIVE_REMOVAL_REQUIRED";
        this.libraryListMenu.error = this.libraryListMenu.destructiveRemovalRequired
          ? "Removing this status will also clear watched history or a rating on Simkl. Confirm only if that is intended."
          : t("detail_lists_save_failed", {}, "Could not save list changes.");
        this.mountLibraryListDialog();
      }
      return true;
    }
    return false;
  },

  shouldSuppressTrailerAutoplay() {
    const content = this.getDetailContentScroller();
    const focused = this.container?.querySelector(".focusable.focused") || null;
    return Boolean(
      this.trailerHasAutoplayed ||
      !content ||
      Number(content.scrollTop || 0) > 160 ||
      !focused?.matches?.('.series-detail-actions [data-action="playDefault"]') ||
      this.seasonHoldMenu ||
      this.episodeHoldMenu ||
      this.heroPlayMenu ||
      this.libraryListMenu ||
      this.detailHoldDialog ||
      this.posterOptionsController?.dialog
    );
  },

  stopTrailerPlayback() {
    if (this.trailerAutoplayTimer) {
      clearTimeout(this.trailerAutoplayTimer);
      this.trailerAutoplayTimer = null;
    }
    this.isTrailerPlaying = false;
    this.trailerPlaybackMode = null;
    this.trailerVisualReady = false;
    this.trailerSubtitlesEnabled = false;
    this.trailerFocusRestore = null;
    this.trailerUiRefs = null;
    this.trailerControlsVisible = true;
  },

  stopTrailerPlaybackForNavigation() {
    this.stopTrailerPlayback({
      keepDom: false,
      restartAutoplay: false,
      restoreFocus: false,
      immediateClear: true
    });
  },

  async openEpisodeStreamChooser(videoId, options = {}) {
    if (!videoId || !this.meta) {
      return;
    }
    this.stopTrailerPlaybackForNavigation();
    const episode = this.episodes.find((entry) => entry.id === videoId) || null;
    if (!episode) {
      return;
    }
    const progress = this.getEpisodeMenuProgress(episode);
    this.navigateToStreamScreenForEpisode(episode, {
      ...this.getResumeParamsForProgress(progress, {
        ...options,
        useActiveFallback: false
      }),
      ...(options.manualSelection ? { manualSelection: true } : {})
    });
  },

  async openMovieStreamChooser(options = {}) {
    this.stopTrailerPlaybackForNavigation();
    this.navigateToStreamScreenForMovie({
      ...this.getResumeParamsForProgress(this.getActiveResumeProgress(), options),
      ...(options.manualSelection ? { manualSelection: true } : {})
    });
  },

  getActivePendingSelection() {
    return this.pendingEpisodeSelection || this.pendingMovieSelection || null;
  },

  getFilteredEpisodeStreams() {
    const pending = this.getActivePendingSelection();
    if (!pending || !pending.streams.length) {
      return [];
    }
    if (pending.addonFilter === "all") {
      return pending.streams;
    }
    return pending.streams.filter((stream) => stream.addonName === pending.addonFilter);
  },

  consumeBackRequest() {
    if (this.seasonHoldMenu) {
      this.closeSeasonHoldMenu();
      return true;
    }
    if (this.episodeHoldMenu) {
      this.closeEpisodeHoldMenu();
      return true;
    }
    if (this.posterOptionsController?.dialog) {
      this.closePosterOptionsMenu();
      return true;
    }
    if (this.heroPlayMenu || this.libraryListMenu) {
      this.closeHeroMenus();
      return true;
    }
    if (this.isTrailerPlaying) {
      this.stopTrailerPlayback();
      return true;
    }
    if (this.pendingEpisodeSelection || this.pendingMovieSelection) {
      this.closeEpisodeStreamChooser();
      return true;
    }
    if (this.navigateBackFromDetail()) {
      return true;
    }
    if (this.isLoadingDetail) {
      void Router.backFromPendingNavigation();
      return true;
    }
    return false;
  },

  playEpisodeFromSelectedStream(streamId) {
    const pending = this.pendingEpisodeSelection;
    if (!pending) {
      return;
    }
    const selectedStream =
      pending.streams.find((stream) => stream.id === streamId) ||
      this.getFilteredEpisodeStreams()[0];
    if (!selectedStream?.url) {
      return;
    }
    const nextEpisode = this.getNextEpisodeAfter(pending.episode);
    const imdbId = resolveMetaImdbId(this.meta, this.params);
    const tmdbId = resolveMetaTmdbId(this.meta, this.params);
    const traktId = resolveMetaTraktId(this.meta, this.params);
    const contentLanguage = resolveMetaOriginalLanguage(this.meta, this.params);
    const resumeParams = this.getResumeParamsForProgress(
      this.getEpisodeMenuProgress(pending.episode),
      { useActiveFallback: false }
    );
    this.stopTrailerPlaybackForNavigation();
    Router.navigate("player", {
      streamUrl: selectedStream.url,
      itemId: this.params?.itemId,
      itemType: this.params?.itemType || "series",
      imdbId,
      tmdbId,
      traktId,
      contentLanguage,
      returnToSearchOnBack: Boolean(this.params?.returnToSearchOnBack),
      videoId: pending.videoId,
      season: pending.episode?.season ?? null,
      episode: pending.episode?.episode ?? null,
      episodeLabel: pending.episode
        ? `S${pending.episode.season}E${pending.episode.episode}`
        : null,
      playerTitle:
        this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
      playerReleaseYear: String(this.meta?.releaseInfo || "").match(/\b(19|20)\d{2}\b/)?.[0] || "",
      playerSubtitle: pending.episode
        ? `S${pending.episode.season}E${pending.episode.episode} - ${pending.episode.title || ""}`.replace(
            /\s+-\s*$/,
            ""
          )
        : "",
      playerEpisodeTitle: pending.episode?.title || "",
      playerBackdropUrl: this.meta?.background || this.meta?.poster || null,
      playerLogoUrl: this.meta?.logo || null,
      parentalWarnings: this.meta?.parentalWarnings || null,
      parentalGuide: this.meta?.parentalGuide || null,
      episodes: this.episodes || [],
      streamCandidates: pending.streams || [],
      preferredStreamId: selectedStream.id || null,
      playbackSourceContext: selectedStream.streamOrigin || {
        addonId: selectedStream.addonId || "",
        addonBaseUrl: selectedStream.addonBaseUrl || "",
        addonName: selectedStream.addonName || "",
        addonOrderIndex: Number.isFinite(Number(selectedStream.addonOrderIndex))
          ? Number(selectedStream.addonOrderIndex)
          : null,
        sourceProviderId: selectedStream.sourceProviderId || "",
        sourceIds: Array.isArray(selectedStream.sources) ? selectedStream.sources : [],
        selectedStreamId: selectedStream.id || ""
      },
      fromDetailRoute: true,
      ...resumeParams,
      nextEpisodeVideoId: nextEpisode?.id || null,
      nextEpisodeLabel: nextEpisode ? `S${nextEpisode.season}E${nextEpisode.episode}` : null,
      nextEpisodeSeason: nextEpisode?.season ?? null,
      nextEpisodeEpisode: nextEpisode?.episode ?? null,
      nextEpisodeTitle: nextEpisode?.title || "",
      nextEpisodeReleased: nextEpisode?.released || ""
    });
  },

  navigateToStreamScreenForEpisode(episode, extraParams = {}) {
    if (!episode?.id) {
      return;
    }
    const nextEpisode = this.getNextEpisodeAfter(episode);
    const streamBackdrop =
      this.meta?.background || this.meta?.landscapePoster || this.meta?.poster || null;
    const imdbId = resolveMetaImdbId(this.meta, this.params);
    const tmdbId = resolveMetaTmdbId(this.meta, this.params);
    const traktId = resolveMetaTraktId(this.meta, this.params);
    const contentLanguage = resolveMetaOriginalLanguage(this.meta, this.params);
    const releaseYear = String(this.meta?.releaseInfo || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
    const resumeVideoId = String(this.params?.resumeVideoId || "").trim();
    const isContinueWatchingTarget = Boolean(
      this.params?.fromContinueWatching &&
      (resumeVideoId
        ? resumeVideoId === String(episode.id || "")
        : Number(this.params?.resumeSeason || 0) === Number(episode.season || 0) &&
          Number(this.params?.resumeEpisode || 0) === Number(episode.episode || 0))
    );
    this.stopTrailerPlaybackForNavigation();
    Router.navigate(
      "stream",
      {
        itemId: this.params?.itemId || null,
        itemType: "series",
        imdbId,
        tmdbId,
        traktId,
        contentLanguage,
        originalItemId: this.params?.originalItemId || null,
        returnToSearchOnBack: Boolean(this.params?.returnToSearchOnBack),
        returnToDetail: true,
        fromDetailRoute: true,
        itemTitle:
          this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
        year: releaseYear,
        backdrop: streamBackdrop,
        poster: this.meta?.poster || null,
        logo: this.meta?.logo || null,
        runtime: episode.runtimeMinutes || null,
        parentalWarnings: this.meta?.parentalWarnings || null,
        parentalGuide: this.meta?.parentalGuide || null,
        videoId: episode.id,
        preferredStreamId: StreamPreferencesStore.get(this.params?.itemId, episode.id) || null,
        season: episode.season,
        episode: episode.episode,
        episodeTitle: episode.title || "",
        episodes: this.episodes || [],
        nextEpisodeVideoId: nextEpisode?.id || null,
        nextEpisodeLabel: nextEpisode ? `S${nextEpisode.season}E${nextEpisode.episode}` : null,
        nextEpisodeSeason: nextEpisode?.season ?? null,
        nextEpisodeEpisode: nextEpisode?.episode ?? null,
        nextEpisodeTitle: nextEpisode?.title || "",
        nextEpisodeReleased: nextEpisode?.released || "",
        continueWatchingBackHome: isContinueWatchingTarget,
        resumeStreamIdentity: isContinueWatchingTarget
          ? this.params?.resumeStreamIdentity || null
          : null,
        ...extraParams
      },
      this.getStreamNavigationOptions()
    );
  },

  navigateToStreamScreenForMovie(extraParams = {}) {
    const releaseYear = String(this.meta?.releaseInfo || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
    const streamBackdrop =
      this.meta?.background || this.meta?.landscapePoster || this.meta?.poster || null;
    const itemType = resolvePlayableDetailType(this.params?.itemType || this.meta?.type, this.meta);
    const { itemId, videoId } = resolveMovieStreamIdentity(this.meta, this.params);
    const imdbId = resolveMetaImdbId(this.meta, this.params);
    const tmdbId = resolveMetaTmdbId(this.meta, this.params);
    const traktId = resolveMetaTraktId(this.meta, this.params);
    const contentLanguage = resolveMetaOriginalLanguage(this.meta, this.params);
    this.stopTrailerPlaybackForNavigation();
    Router.navigate(
      "stream",
      {
        itemId,
        itemType,
        imdbId,
        tmdbId,
        traktId,
        contentLanguage,
        originalItemId: this.params?.originalItemId || null,
        returnToSearchOnBack: Boolean(this.params?.returnToSearchOnBack),
        returnToDetail: true,
        fromDetailRoute: true,
        itemTitle:
          this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
        itemSubtitle: "",
        genres: Array.isArray(this.meta?.genres) ? this.meta.genres.slice(0, 3).join(" • ") : "",
        year: releaseYear,
        backdrop: streamBackdrop,
        poster: this.meta?.poster || null,
        logo: this.meta?.logo || null,
        parentalWarnings: this.meta?.parentalWarnings || null,
        parentalGuide: this.meta?.parentalGuide || null,
        videoId,
        preferredStreamId: StreamPreferencesStore.get(itemId, videoId) || null,
        episodes: [],
        ...extraParams
      },
      this.getStreamNavigationOptions()
    );
  },

  playMovieFromSelectedStream(streamId) {
    const pending = this.pendingMovieSelection;
    if (!pending) {
      return;
    }
    const selectedStream =
      pending.streams.find((stream) => stream.id === streamId) ||
      this.getFilteredEpisodeStreams()[0];
    if (!selectedStream?.url) {
      return;
    }
    const imdbId = resolveMetaImdbId(this.meta, this.params);
    const tmdbId = resolveMetaTmdbId(this.meta, this.params);
    const traktId = resolveMetaTraktId(this.meta, this.params);
    const contentLanguage = resolveMetaOriginalLanguage(this.meta, this.params);
    const resumeParams = this.getResumeParamsForProgress(this.getActiveResumeProgress());
    this.stopTrailerPlaybackForNavigation();
    Router.navigate("player", {
      streamUrl: selectedStream.url,
      itemId: this.params?.itemId,
      itemType: this.params?.itemType || "movie",
      imdbId,
      tmdbId,
      traktId,
      contentLanguage,
      returnToSearchOnBack: Boolean(this.params?.returnToSearchOnBack),
      season: null,
      episode: null,
      playerTitle:
        this.meta?.name || this.params?.fallbackTitle || this.params?.itemId || "Untitled",
      playerSubtitle: "",
      playerReleaseYear: String(this.meta?.releaseInfo || "").match(/\b(19|20)\d{2}\b/)?.[0] || "",
      playerBackdropUrl: this.meta?.background || this.meta?.poster || null,
      playerLogoUrl: this.meta?.logo || null,
      parentalWarnings: this.meta?.parentalWarnings || null,
      parentalGuide: this.meta?.parentalGuide || null,
      episodes: [],
      streamCandidates: pending.streams || [],
      preferredStreamId: selectedStream.id || null,
      playbackSourceContext: selectedStream.streamOrigin || {
        addonId: selectedStream.addonId || "",
        addonBaseUrl: selectedStream.addonBaseUrl || "",
        addonName: selectedStream.addonName || "",
        addonOrderIndex: Number.isFinite(Number(selectedStream.addonOrderIndex))
          ? Number(selectedStream.addonOrderIndex)
          : null,
        sourceProviderId: selectedStream.sourceProviderId || "",
        sourceIds: Array.isArray(selectedStream.sources) ? selectedStream.sources : [],
        selectedStreamId: selectedStream.id || ""
      },
      fromDetailRoute: true,
      ...resumeParams
    });
  },

  renderError(message) {
    this.isLoadingDetail = false;
    this.container.innerHTML = `
      <div class="row">
        <h2>Detail</h2>
        <p>${message}</p>
        <div class="card focusable" data-action="goBack">Back</div>
      </div>
    `;
    ScreenUtils.indexFocusables(this.container);
    ScreenUtils.setInitialFocus(this.container);
  },

  renderPhone(meta) {
    if (!this.container) {
      return;
    }
    if (meta) {
      this.meta = meta;
    }
    this.container.innerHTML = renderMetaDetailsScreenPhone(this);
    mountMetaDetailsScreenPhone(this, this.container);
  },

  onPointerActivate(target) {
    const actionTarget = target?.closest?.("[data-action]");
    const action = String(actionTarget?.dataset?.action || "");
    if (action === "toggleTrailer") {
      this.playTrailer({ muted: false, restart: true, initiatedByUser: true });
      return true;
    }
    if (action === "openSharedTrailer") {
      const ytId = String(actionTarget.dataset.trailerYtId || "").trim();
      if (!ytId) {
        return false;
      }
      this.trailerSource = {
        kind: "youtube",
        ytId,
        embedUrl: buildYoutubeEmbedUrl(ytId, { muted: false })
      };
      this.playTrailer({
        muted: false,
        restart: true,
        initiatedByUser: true,
        preserveSource: true
      });
      return true;
    }
    return handlePhoneMetaDetailsPointerActivate(this, target);
  },

  cleanup() {
    this.phoneViewportUnsubscribe?.();
    this.phoneViewportUnsubscribe = null;
    cleanupMetaDetailsScreenPhone(this);
    this.detailLoadToken = (this.detailLoadToken || 0) + 1;
    this.cancelPendingEpisodeHold();
    this.cancelPendingSeasonHold();
    this.cancelPendingPosterHold();
    this.cancelPendingHeroHold();
    this.posterOptionsController?.destroy?.({ restoreFocus: false });
    this.posterOptionsController = null;
    this.posterOptionsFocusRestore = null;
    this.destroyDetailHoldDialog();
    this.episodeHoldMenu = null;
    this.seasonHoldMenu = null;
    this.heroPlayMenu = null;
    this.libraryListMenu = null;
    if (this.episodeVirtualSyncRaf) {
      cancelAnimationFrame(this.episodeVirtualSyncRaf);
      this.episodeVirtualSyncRaf = null;
    }
    this.stopEpisodeHoldRepeat();
    this.episodeThumbnailPrefetchCache = new Set();
    if (this.episodeThumbObserver) {
      try {
        this.episodeThumbObserver.disconnect();
      } catch (_) {}
      this.episodeThumbObserver = null;
    }
    this.selectedSeasonEpisodeState = null;
    if (this.episodeTrackScrollNode && this.episodeTrackScrollHandler) {
      this.episodeTrackScrollNode.removeEventListener("scroll", this.episodeTrackScrollHandler);
    }
    this.episodeTrackScrollNode = null;
    this.episodeTrackScrollHandler = null;
    this.episodeVirtualWindow = null;
    this.episodeVirtualMetrics = null;
    this.stopTrailerPlayback({
      keepDom: false,
      restartAutoplay: false,
      restoreFocus: false,
      immediateClear: true
    });
    if (this.detailScrollHandler && this.container) {
      const content = this.container.querySelector(".series-detail-content");
      if (content) {
        content.removeEventListener("scroll", this.detailScrollHandler);
      }
      this.detailScrollHandler = null;
    }
    if (this.detailFocusHandler && this.container) {
      this.container.removeEventListener("focusin", this.detailFocusHandler, true);
      this.detailFocusHandler = null;
    }
    if (this.detailClickHandler && this.container) {
      this.container.removeEventListener("click", this.detailClickHandler, true);
      this.detailClickHandler = null;
    }
    if (this.trailerProxyMessageHandler) {
      window.removeEventListener("message", this.trailerProxyMessageHandler);
      this.trailerProxyMessageHandler = null;
    }
    ScreenUtils.hide(this.container);
  }
};
