import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { streamRepository } from "../../../data/repository/streamRepository.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";
import { isWatchProgressInProgress } from "../../../domain/model/watchProgress.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";
import {
  selectAutoPlayStream,
  isAutoPlayEffectivelyEnabled
} from "../../../core/streams/streamAutoPlaySelector.js";
import { buildStreamResumeIdentity } from "../../../core/streams/streamResumeIdentity.js";
import { DirectDebridResolver } from "../../../core/debrid/directDebridResolver.js";
import {
  DISABLED_PLAYER_ID,
  isExternalPlayerSelectable,
  buildExternalPlayerLink,
  buildMagnetFallback
} from "../../../core/player/externalPlayerLinks.js";
import {
  DirectDebridStreamPreparer,
  directDebridPreparationKey
} from "../../../core/debrid/directDebridStreamPreparer.js";
import { DebridStreamPresentation } from "../../../core/debrid/directDebridStreamPresentation.js";
import { WebOsEngineFsResolver } from "../../../core/p2p/webosEngineFsResolver.js";
import { TizenStreamingServerResolver } from "../../../core/p2p/tizenStreamingServerResolver.js";
import { DebridSettingsStore } from "../../../data/local/debridSettingsStore.js";
import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";
import {
  ensureWebOsImageProxyReady,
  onWebOsImageProxyReady
} from "../../../core/media/imageProxy.js";
import {
  clearFailedAddonLogos,
  getCachedAddonLogoDisplayUrl,
  hasFailedAddonLogo,
  normalizeAddonLogoLookup,
  normalizeAddonLogoUrl,
  preloadAddonLogoImages,
  preloadAddonLogoUrls,
  rememberAddonLogoLookup,
  rememberFailedAddonLogo,
  requestAddonLogo,
  resolveAddonLogo
} from "../../../core/media/addonLogoCache.js";
import { Environment } from "../../../platform/environment.js";

import { I18n } from "../../../i18n/index.js";
import {
  matchStreamBadges,
  normalizeStreamBadgeChipColor,
  normalizeStreamBadgeRules
} from "../../../core/streams/streamBadgeRules.js";
import { normalizeMathematicalAlphanumericSymbols } from "../../../core/streams/streamDisplayText.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { mountPreact } from "../../phone/mountPreact.js";
import { attachLongPress } from "../../navigation/gestureEngine.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";

const STREAM_BADGE_LIMIT = 9;
// Number of rows on each side of the focused source to keep badge-hydrated.
// Windowing by row index (instead of measuring every card) keeps a single
// focus move O(1) in layout reads on TV browsers, where measuring every card
// forced a full list reflow on each keypress in long source lists.
const TV_STREAM_BADGE_WINDOW_ROWS = 24;
const _WEBOS_NATIVE_PLAYER_APP_IDS = [
  "com.webos.app.mediadiscovery",
  "com.webos.app.photovideo",
  "com.webos.app.smartshare"
];
const WEBOS_DLNA_PROTOCOL_SUFFIX =
  "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000";
function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isLaunchableExternalMediaUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    return (
      parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:"
    );
  } catch (_) {
    return false;
  }
}

function isLocalOnlyPlaybackUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol === "file:") {
      return false;
    }
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1"
    );
  } catch (_) {
    return false;
  }
}

function buildWebOsDlnaProtocolInfo(mimeType = "video/mp4") {
  const normalized = String(mimeType || "video/mp4").trim() || "video/mp4";
  return `http-get:*:${normalized}:${WEBOS_DLNA_PROTOCOL_SUFFIX}`;
}

function normalizeExternalLaunchFileName(value = "") {
  const trimmed = String(value || "").trim();
  return (
    trimmed
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Nuvio"
  );
}

function guessMimeTypeFromUrl(url = "") {
  const value = String(url || "")
    .trim()
    .toLowerCase();
  if (!value) {
    return null;
  }
  const extensionMatch = value.match(
    /\.(m3u8|mpd|mp4|m4v|mov|mkv|webm|ts|m2ts|mp3|aac|flac)(?=($|[/?#&]))/i
  );
  if (!extensionMatch) {
    return null;
  }
  const extension = String(extensionMatch[1] || "").toLowerCase();
  const mimeMap = {
    aac: "audio/aac",
    flac: "audio/flac",
    m2ts: "video/mp2t",
    m3u8: "application/vnd.apple.mpegurl",
    m4v: "video/mp4",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    mpd: "application/dash+xml",
    ts: "video/mp2t",
    webm: "video/webm"
  };
  return mimeMap[extension] || null;
}

function getDpadDirection(event) {
  const keyCode = Number(event?.keyCode || 0);
  const key = String(event?.key || "").toLowerCase();
  if (keyCode === 37 || key === "arrowleft" || key === "left") return "left";
  if (keyCode === 39 || key === "arrowright" || key === "right") return "right";
  if (keyCode === 38 || key === "arrowup" || key === "up") return "up";
  if (keyCode === 40 || key === "arrowdown" || key === "down") return "down";
  return null;
}

function isBackEvent(event) {
  return Environment.isBackEvent(event);
}

function normalizeType(itemType) {
  const normalized = String(itemType || "movie").toLowerCase();
  return normalized || "movie";
}

function detectQuality(text = "") {
  const value = String(text).toLowerCase();
  if (value.includes("2160") || value.includes("4k")) return "4k";
  if (value.includes("1080")) return "1080p";
  if (value.includes("720")) return "720p";
  if (value.includes("480")) return "480p";
  return "Auto";
}

function isMagnetUrl(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .startsWith("magnet:");
}

function streamDebridIdentity(item = {}) {
  const resolve = item.clientResolve || item.raw?.clientResolve || {};
  const behaviorHints = item.behaviorHints || item.raw?.behaviorHints || {};
  const infoHash = item.infoHash || item.raw?.infoHash || resolve.infoHash || "";
  const magnetUri =
    resolve.magnetUri ||
    (isMagnetUrl(item.url) ? item.url : "") ||
    (isMagnetUrl(item.externalUrl) ? item.externalUrl : "");
  const hasDebridMarker = Boolean(
    item.clientResolve ||
    item.raw?.clientResolve ||
    item.debridCacheStatus ||
    item.raw?.debridCacheStatus ||
    infoHash ||
    magnetUri
  );
  if (!hasDebridMarker) {
    return "";
  }
  const locator = infoHash || magnetUri || item.url || item.externalUrl || item.ytId || "";
  if (!locator) {
    return "";
  }
  return [
    String(item.addonName || "Addon"),
    String(
      resolve.service ||
        item.debridCacheStatus?.providerId ||
        item.raw?.debridCacheStatus?.providerId ||
        ""
    ),
    String(locator),
    String(resolve.fileIdx ?? item.fileIdx ?? item.raw?.fileIdx ?? ""),
    String(behaviorHints.filename || resolve.filename || ""),
    String(resolve.torrentName || "")
  ].join("::");
}

function streamMergeKey(item = {}) {
  const debridIdentity = streamDebridIdentity(item);
  if (debridIdentity) {
    return `debrid::${debridIdentity}`;
  }
  const locator = item.url || item.externalUrl || item.ytId || "";
  if (!locator) {
    return "";
  }
  return [
    String(item.addonName || "Addon"),
    String(locator),
    String(item.sourceType || ""),
    String(item.fileIdx ?? ""),
    String(item.behaviorHints?.filename || "")
  ].join("::");
}

function mergeStreamItem(previous = {}, next = {}) {
  const behaviorHints = {
    ...(previous.behaviorHints || {}),
    ...(next.behaviorHints || {})
  };
  return {
    ...previous,
    ...next,
    id: previous.id || next.id,
    url: next.url || previous.url || null,
    externalUrl: next.externalUrl || previous.externalUrl || null,
    ytId: next.ytId || previous.ytId || null,
    behaviorHints: Object.keys(behaviorHints).length ? behaviorHints : null,
    subtitles:
      Array.isArray(next.subtitles) && next.subtitles.length ? next.subtitles : previous.subtitles,
    sources: Array.isArray(next.sources) && next.sources.length ? next.sources : previous.sources,
    streamPresentation: next.streamPresentation || previous.streamPresentation || null
  };
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = size;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex >= 3 ? 2 : unitIndex >= 2 ? 1 : 0;
  return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

function normalizeEpisodeCode(season, episode) {
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode || 0);
  if (season == null || !Number.isFinite(seasonNumber) || seasonNumber < 0 || episodeNumber <= 0) {
    return "";
  }
  return `S${seasonNumber} E${episodeNumber}`;
}

function flattenStreams(streamResult) {
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
        id:
          stream.id ||
          `${groupName}-${index}-${stream.url || stream.externalUrl || stream.ytId || ""}`,
        name: stream.name || null,
        title: stream.title || null,
        description: stream.description || null,
        url: stream.url || null,
        ytId: stream.ytId || null,
        infoHash: stream.infoHash || null,
        fileIdx: stream.fileIdx ?? null,
        engineFs: stream.engineFs || stream.raw?.engineFs || null,
        externalUrl: stream.externalUrl || null,
        behaviorHints: stream.behaviorHints || null,
        sources: Array.isArray(stream.sources) ? stream.sources : [],
        quality: stream.quality || null,
        qualityValue: Number.isFinite(Number(stream.qualityValue))
          ? Number(stream.qualityValue)
          : -1,
        clientResolve: stream.clientResolve || null,
        debridCacheStatus: stream.debridCacheStatus || null,
        streamPresentation: stream.streamPresentation || null,
        subtitles: Array.isArray(stream.subtitles) ? stream.subtitles : [],
        addonId: stream.addonId || group.addonId || null,
        addonBaseUrl: stream.addonBaseUrl || group.addonBaseUrl || null,
        addonName: stream.addonName || groupName,
        addonLogo: stream.addonLogo || group.addonLogo || null,
        sourceProviderId:
          stream.sourceProviderId ||
          group.sourceProviderId ||
          stream.streamOrigin?.sourceProviderId ||
          group.streamOrigin?.sourceProviderId ||
          null,
        streamOrigin,
        addonOrderIndex: Number.isFinite(Number(stream.addonOrderIndex))
          ? Number(stream.addonOrderIndex)
          : Number(group.addonOrderIndex ?? Number.MAX_SAFE_INTEGER),
        mimeType: stream.mimeType || stream.raw?.mimeType || stream.type || stream.source || null,
        sourceType: stream.sourceType || stream.mimeType || stream.type || stream.source || "",
        raw: stream
      };
      if (
        DirectDebridResolver.shouldListStream(entry) ||
        WebOsEngineFsResolver.canResolveStream(entry) ||
        TizenStreamingServerResolver.canResolveStream(entry)
      ) {
        flattened.push(entry);
      }
    });
  });
  return flattened;
}

function mergeStreamItems(existing = [], incoming = []) {
  const order = [];
  const byKey = new Map();
  const push = (item) => {
    if (!item) {
      return;
    }
    const key = streamMergeKey(item);
    if (!key) {
      return;
    }
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, item);
      return;
    }
    byKey.set(key, mergeStreamItem(byKey.get(key), item));
  };
  (existing || []).forEach(push);
  (incoming || []).forEach(push);
  return order.map((key) => byKey.get(key));
}

export function getAddonBadgeLabel(name = "") {
  const cleaned = String(name || "").trim();
  if (!cleaned) {
    return "A";
  }
  if (/torrentio|torbox|torrent/i.test(cleaned)) {
    return "µ";
  }
  const letters = cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);
  return letters || cleaned.charAt(0).toUpperCase();
}

async function ensureAddonLogoImageProxyReady() {
  return false;
}

export async function preloadStreamBadgeImages(settings = StreamBadgeSettingsStore.snapshot()) {
  await ensureAddonLogoImageProxyReady();
  const rules = normalizeStreamBadgeRules(settings?.rules);
  const urls = new Set();
  rules.imports.forEach((importItem) => {
    (importItem.filters || []).forEach((filter) => {
      const url = normalizeAddonLogoUrl(filter.imageURL);
      if (url) {
        urls.add(url);
      }
    });
  });
  await preloadAddonLogoUrls(urls);
}

async function preloadMatchedStreamBadgeImages(
  streams = [],
  settings = StreamBadgeSettingsStore.snapshot()
) {
  const urls = new Set();
  (streams || []).forEach((stream) => {
    matchStreamBadges(stream, settings?.rules)
      .slice(0, STREAM_BADGE_LIMIT)
      .forEach((badge) => {
        const url = normalizeAddonLogoUrl(badge.imageURL);
        if (url) {
          urls.add(url);
        }
      });
  });
  await preloadAddonLogoUrls(urls);
}

export function getStreamHeadline(stream = {}) {
  const primary = [stream.name, stream.title, stream.description].find((value) =>
    String(value || "").trim()
  );
  if (!primary) {
    return stream.addonName || "Unknown source";
  }
  const firstLine = String(primary).split(/\r?\n/)[0].trim();
  const displayLine = Environment.isWebOS()
    ? normalizeMathematicalAlphanumericSymbols(firstLine)
    : firstLine;
  return displayLine || stream.addonName || "Unknown source";
}

export function getStreamQuality(stream = {}) {
  const qualityLines = [];
  [stream.name, stream.title, stream.description].forEach((value) => {
    String(value || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const normalized = String(line || "").trim();
        if (normalized) {
          qualityLines.push(normalized);
        }
      });
  });
  const qualityCandidate = qualityLines.find(
    (line, index) => index > 0 && /(2160|4k|1080|720|480)/i.test(line)
  );
  if (qualityCandidate) {
    return detectQuality(qualityCandidate);
  }
  return detectQuality(
    [
      stream.name || "",
      stream.title || "",
      stream.description || "",
      stream.behaviorHints?.filename || "",
      stream.sourceType || ""
    ].join(" ")
  );
}

export function getStreamDescriptionLines(stream = {}) {
  const displayDescription = String(stream.description || stream.title || "").trim();
  const displayName = String(stream.name || stream.title || stream.description || "").trim();
  if (!displayDescription || displayDescription === displayName) {
    return [];
  }
  return displayDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function renderImageBadgeChip(badge = {}) {
  const imageUrl = normalizeAddonLogoUrl(badge.imageURL);
  if (!imageUrl) {
    return "";
  }
  let displayImageUrl = getCachedAddonLogoDisplayUrl(imageUrl);
  if (imageUrl && !displayImageUrl && !hasFailedAddonLogo(imageUrl)) {
    requestAddonLogo(imageUrl);
    if (Environment.isWebOS()) {
      displayImageUrl = getCachedAddonLogoDisplayUrl(imageUrl);
    }
  }
  const backgroundColor = normalizeStreamBadgeChipColor(badge.tagColor);
  const outlineColor = normalizeStreamBadgeChipColor(badge.borderColor);
  const textColor = normalizeStreamBadgeChipColor(badge.textColor);
  const filled =
    String(badge.tagStyle || "")
      .trim()
      .toLowerCase() === "filled";
  const fallbackImageUrl = Environment.isWebOS() ? "" : imageUrl;
  const safeImageUrl = displayImageUrl || fallbackImageUrl;
  if (!safeImageUrl) {
    return "";
  }
  const style = [
    filled && backgroundColor ? `background:${backgroundColor};` : "",
    outlineColor ? `border-color:${outlineColor};` : "",
    textColor ? `color:${textColor};` : ""
  ].join("");
  return `
    <span class="stream-route-stream-badge image${filled ? " filled" : ""}"${style ? ` style="${escapeHtml(style)}"` : ""}>
      <img src="${escapeHtml(safeImageUrl)}" alt="${escapeHtml(badge.name || "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
    </span>
  `;
}

function renderImportedStreamBadgeChipContents(
  stream = {},
  badges = [],
  showFileSizeBadges = true
) {
  const sizeBytes = stream.behaviorHints?.videoSize;
  const chips = [];
  badges.slice(0, STREAM_BADGE_LIMIT).forEach((badge) => {
    const chip = renderImageBadgeChip(badge);
    if (chip) {
      chips.push(chip);
    }
  });
  if (showFileSizeBadges && sizeBytes != null) {
    chips.push(
      `<span class="stream-route-stream-badge size">${escapeHtml(t("streams_size", [formatBytes(sizeBytes)], `SIZE ${formatBytes(sizeBytes)}`))}</span>`
    );
  }
  return chips.join("");
}

function renderImportedStreamBadgeChips(stream = {}, badges = [], showFileSizeBadges = true) {
  const contents = renderImportedStreamBadgeChipContents(stream, badges, showFileSizeBadges);
  return contents
    ? `<div class="stream-route-card-badges" aria-label="${escapeHtml(t("settings_stream_badges_section", {}, "Fusion Style"))}">${contents}</div>`
    : "";
}

export function renderStreamBadges(stream = {}, enabled = true, badgeSettings = null) {
  if (!enabled) {
    return "";
  }
  const currentBadgeSettings = badgeSettings || StreamBadgeSettingsStore.snapshot();
  const importedBadges = matchStreamBadges(stream, currentBadgeSettings.rules);
  return renderImportedStreamBadgeChips(
    stream,
    importedBadges,
    currentBadgeSettings.showFileSizeBadges !== false
  );
}

function hasStreamBadges(stream = {}, enabled = true, badgeSettings = null) {
  if (!enabled) {
    return false;
  }
  const currentBadgeSettings = badgeSettings || StreamBadgeSettingsStore.snapshot();
  if (
    currentBadgeSettings.showFileSizeBadges !== false &&
    stream.behaviorHints?.videoSize != null
  ) {
    return true;
  }
  return matchStreamBadges(stream, currentBadgeSettings.rules).some((badge) =>
    normalizeAddonLogoUrl(badge.imageURL)
  );
}

function renderStreamBadgeContents(stream = {}, enabled = true, badgeSettings = null) {
  if (!enabled) {
    return "";
  }
  const currentBadgeSettings = badgeSettings || StreamBadgeSettingsStore.snapshot();
  return renderImportedStreamBadgeChipContents(
    stream,
    matchStreamBadges(stream, currentBadgeSettings.rules),
    currentBadgeSettings.showFileSizeBadges !== false
  );
}

export function resolveStreamBadgePlacement(badgeSettings = null) {
  const placement = String(
    (badgeSettings || StreamBadgeSettingsStore.snapshot()).badgePlacement || "BOTTOM"
  )
    .trim()
    .toUpperCase();
  return placement === "TOP" ? "TOP" : "BOTTOM";
}

function getOrderedFilterNames(sourceChips = [], streams = []) {
  const ordered = [];
  const sortedChips = (sourceChips || [])
    .slice()
    .sort(
      (left, right) =>
        Number(left?.orderIndex ?? Number.MAX_SAFE_INTEGER) -
        Number(right?.orderIndex ?? Number.MAX_SAFE_INTEGER)
    );
  sortedChips.forEach((chip) => {
    if (chip?.name && !ordered.includes(chip.name)) {
      ordered.push(chip.name);
    }
  });
  const sortedStreams = (streams || [])
    .map((stream, index) => ({ stream, index }))
    .sort((left, right) => {
      const leftOrder = Number(left.stream?.addonOrderIndex ?? Number.MAX_SAFE_INTEGER);
      const rightOrder = Number(right.stream?.addonOrderIndex ?? Number.MAX_SAFE_INTEGER);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.stream);
  sortedStreams.forEach((stream) => {
    const addonName = String(stream?.addonName || "").trim();
    if (addonName && !ordered.includes(addonName)) {
      ordered.push(addonName);
    }
  });
  return ordered;
}

function sortStreamsByAddonOrder(streams = [], sourceChips = []) {
  const order = new Map();
  (sourceChips || []).forEach((chip, index) => {
    const name = String(chip?.name || "").trim();
    if (name && !order.has(name)) {
      order.set(name, index);
    }
  });
  return (streams || [])
    .map((stream, index) => ({ stream, index }))
    .sort((left, right) => {
      const leftOrder = order.has(left.stream?.addonName)
        ? order.get(left.stream.addonName)
        : Number(left.stream?.addonOrderIndex ?? Number.MAX_SAFE_INTEGER);
      const rightOrder = order.has(right.stream?.addonName)
        ? order.get(right.stream.addonName)
        : Number(right.stream?.addonOrderIndex ?? Number.MAX_SAFE_INTEGER);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.stream);
}

export const StreamScreen = {
  cancelScheduledRender() {
    if (this.renderDelayTimer) {
      clearTimeout(this.renderDelayTimer);
      this.renderDelayTimer = null;
    }
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    if (this.streamBadgeHydrationFrame) {
      cancelAnimationFrame(this.streamBadgeHydrationFrame);
      this.streamBadgeHydrationFrame = null;
    }
  },

  requestRender({ delayMs = 0 } = {}) {
    if (!this.container || Router.getCurrent() !== "stream") {
      return;
    }
    const delay = Math.max(0, Number(delayMs || 0));
    if (delay > 0) {
      if (this.renderFrame || this.renderDelayTimer) {
        return;
      }
      this.renderDelayTimer = setTimeout(() => {
        this.renderDelayTimer = null;
        this.requestRender();
      }, delay);
      return;
    }
    if (this.renderFrame) {
      return;
    }
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      if (!this.container || Router.getCurrent() !== "stream") {
        return;
      }
      this.render();
    });
  },

  applyAddonLogos(streams = []) {
    const lookup = this.addonLogoLookup || {};
    return (streams || []).map((stream) => {
      const currentLogo = normalizeAddonLogoUrl(stream?.addonLogo);
      if (currentLogo) {
        return stream;
      }
      const addonLogo = resolveAddonLogo(stream?.addonName, lookup);
      return addonLogo ? { ...stream, addonLogo } : stream;
    });
  },

  areAddonLogosReady(streams = []) {
    if (StreamBadgeSettingsStore.snapshot().showAddonLogo !== true) {
      return true;
    }
    return (streams || []).every((stream) => {
      const addonLogoUrl =
        normalizeAddonLogoUrl(stream?.addonLogo) ||
        resolveAddonLogo(stream?.addonName, this.addonLogoLookup);
      if (!addonLogoUrl || hasFailedAddonLogo(addonLogoUrl)) {
        return true;
      }
      return Boolean(getCachedAddonLogoDisplayUrl(addonLogoUrl));
    });
  },

  requestAddonLogoPrerender(streams = []) {
    if (StreamBadgeSettingsStore.snapshot().showAddonLogo !== true) {
      return;
    }
    const urls = Array.from(
      new Set(
        (streams || [])
          .map(
            (stream) =>
              normalizeAddonLogoUrl(stream?.addonLogo) ||
              resolveAddonLogo(stream?.addonName, this.addonLogoLookup)
          )
          .filter((url) => url && !hasFailedAddonLogo(url) && !getCachedAddonLogoDisplayUrl(url))
      )
    );
    if (!urls.length) {
      return;
    }
    const key = urls.sort().join("|");
    if (this.pendingAddonLogoPrerenderKey === key) {
      return;
    }
    const token = this.loadToken || 0;
    this.pendingAddonLogoPrerenderKey = key;
    void preloadAddonLogoImages(streams, this.addonLogoLookup).finally(() => {
      if (this.pendingAddonLogoPrerenderKey === key) {
        this.pendingAddonLogoPrerenderKey = "";
      }
      if (this.container && Router.getCurrent() === "stream" && token === this.loadToken) {
        this.requestRender();
      }
    });
  },

  scheduleDebridPreparation() {
    const token = this.loadToken || 0;
    if (this.debridPreparationScheduled) {
      return;
    }
    this.debridPreparationScheduled = true;
    setTimeout(() => {
      this.debridPreparationScheduled = false;
      if (!this.container || Router.getCurrent() !== "stream" || token !== this.loadToken) {
        return;
      }
      const season = this.params?.season == null ? null : Number(this.params.season);
      const episode = this.params?.episode == null ? null : Number(this.params.episode);
      const playerSettings = PlayerSettingsStore.get();
      const installedAddonNames = new Set(
        (addonRepository.getCachedInstalledAddons() || [])
          .map((addon) => String(addon?.displayName || addon?.name || "").trim())
          .filter(Boolean)
      );
      void DirectDebridStreamPreparer.prepare(this.streams, {
        season,
        episode,
        playerSettings,
        installedAddonNames,
        onPrepared: (original, prepared) => {
          if (!this.container || Router.getCurrent() !== "stream" || token !== this.loadToken) {
            return;
          }
          const originalKey = directDebridPreparationKey(original);
          this.streams = this.streams.map((stream) =>
            directDebridPreparationKey(stream) === originalKey
              ? {
                  ...stream,
                  ...prepared,
                  addonName: stream.addonName,
                  addonLogo: stream.addonLogo,
                  badges: stream.badges
                }
              : stream
          );
          this.requestRender();
        }
      });
    }, 0);
  },

  getBackdropUrl() {
    return this.params?.backdrop || this.params?.landscapePoster || this.params?.poster || "";
  },

  getRouteStateKey(params = {}) {
    const itemType = normalizeType(params?.itemType);
    const itemId = String(params?.itemId || "").trim();
    const videoId = String(params?.videoId || "").trim();
    if (!itemId && !videoId) {
      return null;
    }
    return `stream:${itemType}:${itemId}:${videoId}`;
  },

  navigateBackFromStream() {
    const itemId = String(this.params?.itemId || "").trim();
    if (!itemId) {
      return false;
    }
    const itemType = normalizeType(this.params?.itemType);
    const isSeries = itemType === "series" || itemType === "tv";
    if (this.params?.continueWatchingBackHome && !isSeries) {
      // Android returns movies opened from Continue Watching straight Home;
      // only episodic content reconstructs a Detail route on Back.
      void Router.navigate(
        "home",
        {},
        {
          skipStackPush: true,
          replaceHistory: true,
          isBackNavigation: true
        }
      );
      return true;
    }
    void Router.navigate(
      "detail",
      {
        itemId,
        itemType,
        imdbId: this.params?.imdbId || null,
        tmdbId: this.params?.tmdbId || null,
        traktId: this.params?.traktId || null,
        originalItemId: this.params?.originalItemId || null,
        fallbackTitle: this.params?.itemTitle || this.params?.playerTitle || "Untitled",
        returnToSearchOnBack: Boolean(this.params?.returnToSearchOnBack),
        returnHomeOnBack: Boolean(
          !this.params?.returnToSearchOnBack &&
          (this.params?.continueWatchingBackHome ||
            this.params?.returnHomeOnBack ||
            this.params?.returnToDetail ||
            this.params?.fromDetailRoute)
        )
      },
      {
        skipStackPush: true,
        replaceHistory: true,
        isBackNavigation: true
      }
    );
    return true;
  },

  consumeBackRequest() {
    return this.navigateBackFromStream();
  },

  captureRouteState() {
    const list = this.container?.querySelector(".stream-route-list");
    return {
      params: this.params ? { ...this.params } : {},
      loading: Boolean(this.loading),
      error: String(this.error || ""),
      streams: Array.isArray(this.streams) ? this.streams.map((stream) => ({ ...stream })) : [],
      addonFilter: String(this.addonFilter || "all"),
      focusState: this.focusState ? { ...this.focusState } : { zone: "filter", index: 0 },
      sourceChips: Array.isArray(this.sourceChips)
        ? this.sourceChips.map((chip) => ({ ...chip }))
        : [],
      addonLogoLookup: this.addonLogoLookup ? { ...this.addonLogoLookup } : {},
      listScrollTop: this.getListScrollTop(list)
    };
  },

  async mount(params = {}, navigationContext = {}) {
    this.container = document.getElementById("stream");
    this.phoneViewportUnsubscribe?.();
    ScreenUtils.show(this.container);
    this.params = params || {};
    this.loadToken = (this.loadToken || 0) + 1;
    const token = this.loadToken;
    this.focusState = { zone: "filter", index: 0 };
    this.listScrollTop = 0;
    this.error = "";
    this.loading = true;
    this.streams = [];
    this.sourceChips = [];
    this.addonLogoLookup = {};
    this.addonFilter = "all";
    this.hasRenderedStreamRouteShell = false;
    // Returning here from the player is a back navigation, not a fresh open, so
    // do not auto-resume or auto-play again. Otherwise exiting the player drops
    // back onto the stream list and immediately relaunches, looping forever.
    const returningFromPlayer = Boolean(navigationContext?.isBackNavigation);
    this.autoResumeAttempted = returningFromPlayer;
    const playerSettings = PlayerSettingsStore.get();
    const reusableStream = playerSettings.streamReuseLastLinkEnabled
      ? StreamPreferencesStore.getValid(
          this.params?.itemId,
          this.params?.videoId || this.params?.itemId,
          Number(playerSettings.streamReuseLastLinkCacheHours || 24) * 60 * 60 * 1000
        )
      : null;
    this.autoResumeUiActive = Boolean(
      !navigationContext?.isBackNavigation &&
      this.params?.continueWatchingBackHome &&
      !this.params?.manualSelection &&
      reusableStream?.streamId &&
      (String(this.params?.resumeStreamIdentity || "").trim() ||
        String(this.params?.preferredStreamId || "").trim())
    );
    this.autoPlayAttempted = returningFromPlayer;
    this.cancelAutoPlayCountdown();
    this.cancelAutoPlaySelectionWait();
    const autoPlayWaitSeconds = Math.max(
      0,
      Math.trunc(Number(playerSettings.streamAutoPlayTimeoutSeconds || 0))
    );
    this.autoPlaySelectionReady = autoPlayWaitSeconds === 0;
    if (autoPlayWaitSeconds > 0 && autoPlayWaitSeconds !== 2147483647) {
      this.autoPlaySelectionWaitTimer = setTimeout(() => {
        this.autoPlaySelectionWaitTimer = null;
        this.autoPlaySelectionReady = true;
        this.maybeAutoResumeStream();
        this.maybeAutoPlayStream();
      }, autoPlayWaitSeconds * 1000);
    }
    this.webOsNativePlayerAppId = "";
    this.nativePlayerPendingStreamId = "";
    this.nativePlayerRequestToken = 0;
    if (this.releaseImageProxyReadyListener) {
      this.releaseImageProxyReadyListener();
      this.releaseImageProxyReadyListener = null;
    }
    if (Environment.isWebOS()) {
      this.releaseImageProxyReadyListener = onWebOsImageProxyReady(() => {
        clearFailedAddonLogos();
        this.requestRender({ delayMs: 0 });
      });
      void ensureWebOsImageProxyReady();
      void this.detectWebOsNativePlayerApp();
    }

    // Match Android TV: restore the selected source only when returning from
    // playback. A fresh open of the same item must start from the first source
    // instead of inheriting an old list scroll/focus snapshot.
    const restored =
      navigationContext?.isBackNavigation &&
      navigationContext?.restoredState &&
      typeof navigationContext.restoredState === "object"
        ? navigationContext.restoredState
        : null;
    if (restored) {
      this.loading = Boolean(restored.loading);
      this.error = String(restored.error || "");
      this.streams = Array.isArray(restored.streams)
        ? restored.streams.map((stream) => ({ ...stream }))
        : [];
      this.addonFilter = String(restored.addonFilter || "all");
      this.focusState = restored.focusState
        ? { ...restored.focusState }
        : { zone: "filter", index: 0 };
      this.sourceChips = Array.isArray(restored.sourceChips)
        ? restored.sourceChips.map((chip) => ({ ...chip }))
        : [];
      this.addonLogoLookup =
        restored.addonLogoLookup && typeof restored.addonLogoLookup === "object"
          ? normalizeAddonLogoLookup(restored.addonLogoLookup)
          : {};
      this.listScrollTop = Number(restored.listScrollTop || 0);
    }

    const showAddonLogo = StreamBadgeSettingsStore.snapshot().showAddonLogo === true;
    if (restored && this.streams.length && showAddonLogo) {
      await ensureAddonLogoImageProxyReady();
      if (token !== this.loadToken || Router.getCurrent() !== "stream") {
        return;
      }
      this.streams = this.applyAddonLogos(this.streams);
      await preloadAddonLogoImages(this.streams, this.addonLogoLookup);
      if (token !== this.loadToken || Router.getCurrent() !== "stream") {
        return;
      }
    }

    // A restored snapshot already holds the finished list, so settle `loading`
    // before the first paint. Flipping it afterwards used to force a second
    // full render of an identical list - ~170ms on a 180-stream result.
    const restoringFromBack = Boolean(
      restored && navigationContext?.isBackNavigation && this.streams.length
    );
    if (restoringFromBack) {
      this.loading = false;
    }

    this.render();

    if (restoringFromBack) {
      return;
    }

    void this.loadStreams();
  },

  async loadStreams() {
    const token = this.loadToken;
    const itemType = normalizeType(this.params?.itemType);
    const videoId = String(this.params?.videoId || this.params?.itemId || "");

    this.loading = true;
    this.error = "";
    this.streams = [];
    this.addonFilter = "all";
    this.focusState = { zone: "filter", index: 0 };
    this.listScrollTop = 0;
    this.addonLogoLookup = {};

    this.sourceChips = [];
    if (!this.hasRenderedStreamRouteShell) {
      this.requestRender();
    }
    const pendingChunkTasks = new Set();
    const badgeSettings = StreamBadgeSettingsStore.snapshot();
    const showAddonLogo = badgeSettings.showAddonLogo === true;
    if (showAddonLogo) {
      await ensureAddonLogoImageProxyReady();
      if (token !== this.loadToken) {
        return;
      }
    }

    const upsertSourceChip = (addon, status = "loading") => {
      const name = String(addon?.displayName || addon?.name || "").trim();
      if (!name) {
        return;
      }
      const orderIndex = Number(addon?.orderIndex);
      const nextChip = {
        name,
        logo: normalizeAddonLogoUrl(addon.logo),
        status,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : Number.MAX_SAFE_INTEGER
      };
      const existingIndex = this.sourceChips.findIndex((chip) => chip.name === name);
      if (existingIndex >= 0) {
        this.sourceChips[existingIndex] = { ...this.sourceChips[existingIndex], ...nextChip };
      } else {
        this.sourceChips.push(nextChip);
      }
      rememberAddonLogoLookup(this.addonLogoLookup, name, addon.logo || nextChip.logo);
      this.sourceChips = this.sourceChips
        .slice()
        .sort((left, right) => Number(left.orderIndex || 0) - Number(right.orderIndex || 0));
    };

    const markSuccessfulSources = (names = []) => {
      if (!Array.isArray(names) || !names.length) {
        return;
      }
      const entries = names
        .map((entry) => {
          if (entry && typeof entry === "object") {
            return {
              name: String(entry.name || entry.addonName || "").trim(),
              logo: normalizeAddonLogoUrl(entry.logo || entry.addonLogo),
              orderIndex: Number(entry.orderIndex ?? entry.addonOrderIndex)
            };
          }
          const name = String(entry || "").trim();
          const existingStream = this.streams.find((stream) => stream.addonName === name);
          return {
            name,
            logo: resolveAddonLogo(name, this.addonLogoLookup),
            orderIndex: Number(existingStream?.addonOrderIndex)
          };
        })
        .filter((entry) => entry.name);
      const successSet = new Set(entries.map((entry) => entry.name));
      const known = new Set(this.sourceChips.map((chip) => chip.name));
      this.sourceChips = this.sourceChips.map((chip) =>
        successSet.has(chip.name) ? { ...chip, status: "success" } : chip
      );
      entries.forEach((entry) => {
        if (!known.has(entry.name)) {
          const orderIndex = Number.isFinite(entry.orderIndex)
            ? entry.orderIndex
            : Number.MAX_SAFE_INTEGER;
          this.sourceChips.push({
            name: entry.name,
            logo: entry.logo || resolveAddonLogo(entry.name, this.addonLogoLookup),
            status: "success",
            orderIndex
          });
        }
      });
      this.sourceChips = this.sourceChips
        .slice()
        .sort(
          (left, right) =>
            Number(left.orderIndex ?? Number.MAX_SAFE_INTEGER) -
            Number(right.orderIndex ?? Number.MAX_SAFE_INTEGER)
        );
    };

    const displayChunkGroups = async (groups = []) => {
      if (token !== this.loadToken) {
        return;
      }
      const chunkStreams = mergeStreamItems(
        [],
        this.applyAddonLogos(flattenStreams({ status: "success", data: groups }))
      );
      if (!chunkStreams.length) {
        return;
      }
      await Promise.all([
        preloadMatchedStreamBadgeImages(chunkStreams, badgeSettings),
        ...(showAddonLogo ? [preloadAddonLogoImages(chunkStreams, this.addonLogoLookup)] : [])
      ]);
      if (token !== this.loadToken) {
        return;
      }
      this.streams = mergeStreamItems(this.streams, chunkStreams);
      this.scheduleDebridPreparation();
      markSuccessfulSources(
        groups.map((group) => ({
          name: group?.addonName || "",
          logo: group?.addonLogo || "",
          orderIndex: group?.addonOrderIndex
        }))
      );
      if (this.streams.length && this.focusState?.zone !== "card") {
        this.focusState = { zone: "card", row: 0, action: "play" };
      }
      this.requestRender({ delayMs: 120 });
      this.maybeAutoResumeStream();
      this.maybeAutoPlayStream();
    };

    const queueChunkGroups = (groups = []) => {
      const task = displayChunkGroups(groups)
        .catch((error) => {
          console.warn("Stream chunk prerender failed", error);
        })
        .finally(() => {
          pendingChunkTasks.delete(task);
        });
      pendingChunkTasks.add(task);
      return task;
    };

    const options = {
      itemId: String(this.params?.itemId || ""),
      season: this.params?.season ?? null,
      episode: this.params?.episode ?? null,
      onAddon: (addon) => {
        if (token !== this.loadToken) {
          return;
        }
        upsertSourceChip(addon, "loading");
        this.requestRender({ delayMs: 120 });
      },
      onChunk: (chunkResult) => {
        if (token !== this.loadToken || chunkResult?.status !== "success") {
          return;
        }
        const groups = Array.isArray(chunkResult.data) ? chunkResult.data : [];
        queueChunkGroups(groups);
      }
    };

    try {
      const streamResult = await streamRepository.getStreamsFromAllAddons(
        itemType,
        videoId,
        options
      );
      if (token !== this.loadToken) {
        return;
      }
      const loadedStreams = mergeStreamItems(
        [],
        this.applyAddonLogos(flattenStreams(streamResult))
      );
      await Promise.allSettled(Array.from(pendingChunkTasks));
      if (token !== this.loadToken) {
        return;
      }
      const existingKeys = new Set(
        this.streams.map((stream) => streamMergeKey(stream)).filter(Boolean)
      );
      const missingStreams = loadedStreams.filter((stream) => {
        const key = streamMergeKey(stream);
        return key && !existingKeys.has(key);
      });
      if (missingStreams.length) {
        await Promise.all([
          preloadMatchedStreamBadgeImages(missingStreams, badgeSettings),
          ...(showAddonLogo ? [preloadAddonLogoImages(missingStreams, this.addonLogoLookup)] : [])
        ]);
        if (token !== this.loadToken) {
          return;
        }
        this.streams = mergeStreamItems(this.streams, missingStreams);
      }
      this.scheduleDebridPreparation();
      markSuccessfulSources(this.streams.map((stream) => stream.addonName));
      if (this.streams.length && showAddonLogo) {
        await preloadAddonLogoImages(this.streams, this.addonLogoLookup);
      }
      this.sourceChips = this.sourceChips.map((chip) =>
        chip.status === "loading" ? { ...chip, status: "error" } : chip
      );
      this.loading = false;
      if (this.streams.length) {
        const visibleStreams = this.getFilteredStreams();
        const maxCardIndex = Math.max(0, visibleStreams.length - 1);
        let initialIndex = clamp(Number(this.focusState?.index || 0), 0, maxCardIndex);
        const preferred = String(this.params?.preferredStreamId || "").trim();
        if (preferred) {
          const prefIdx = visibleStreams.findIndex((s) => String(s?.id || "") === preferred);
          if (prefIdx >= 0) {
            initialIndex = prefIdx;
          }
        }
        const rowIndex = clamp(initialIndex, 0, this.streams.length - 1);
        this.focusState = {
          zone: "card",
          index: clamp(initialIndex, 0, maxCardIndex),
          row: rowIndex,
          action: String(this.focusState?.action || "play")
        };
      } else {
        this.focusState = { zone: "filter", index: 0 };
      }
      this.requestRender();
      this.scheduleErrorChipCleanup();
      this.maybeAutoResumeStream({ allLoaded: true });
      this.maybeAutoPlayStream({ allLoaded: true });
    } catch (error) {
      if (token !== this.loadToken) {
        return;
      }
      this.loading = false;
      this.autoResumeUiActive = false;
      this.error = error?.message || "Failed to load streams.";
      this.sourceChips = this.sourceChips.map((chip) =>
        chip.status === "loading" ? { ...chip, status: "error" } : chip
      );
      this.requestRender();
      this.scheduleErrorChipCleanup();
    }
  },

  // Continue Watching can pass the identity of the stream that was playing.
  // If that same source shows up again, resume it directly.
  maybeAutoResumeStream({ allLoaded = false } = {}) {
    if (this.autoResumeAttempted) {
      return;
    }
    const settings = PlayerSettingsStore.get();
    const reusableStream = settings.streamReuseLastLinkEnabled
      ? StreamPreferencesStore.getValid(
          this.params?.itemId,
          this.params?.videoId || this.params?.itemId,
          Number(settings.streamReuseLastLinkCacheHours || 24) * 60 * 60 * 1000
        )
      : null;
    const progressIdentity = reusableStream
      ? String(this.params?.resumeStreamIdentity || "").trim()
      : "";
    const preferredStreamId = String(reusableStream?.streamId || "").trim();
    const canReuseStoredStream = Boolean(
      this.params?.continueWatchingBackHome && !this.params?.manualSelection && reusableStream
    );
    const cachedIdentity = canReuseStoredStream
      ? String(reusableStream?.resumeIdentity || "").trim()
      : "";
    const canReusePreferredStream = Boolean(canReuseStoredStream && preferredStreamId);
    if (!progressIdentity && !cachedIdentity && !canReusePreferredStream) {
      this.autoResumeUiActive = false;
      return;
    }
    if (!this.streams.length) {
      if (!this.loading) {
        this.autoResumeAttempted = true;
        this.autoResumeUiActive = false;
        this.requestRender({ delayMs: 0 });
      }
      return;
    }
    const identityMatch =
      this.streams.find((stream) => {
        const stableIdentity = buildStreamResumeIdentity(stream);
        return Boolean(
          (cachedIdentity && stableIdentity === cachedIdentity) ||
          (progressIdentity &&
            (stableIdentity === progressIdentity || streamMergeKey(stream) === progressIdentity))
        );
      }) || null;
    // Stream preferences are stored per profile and per video. They are the
    // Web equivalent of Android's local stream-link cache and remain available
    // even when the selected progress source cannot carry stream metadata.
    const match =
      identityMatch ||
      (canReusePreferredStream
        ? this.streams.find((stream) => String(stream?.id || "") === preferredStreamId)
        : null);
    if (match?.id) {
      this.autoResumeAttempted = true;
      void this.playStream(match.id);
      return;
    }
    if (!allLoaded && this.loading) {
      return;
    }
    // The remembered source is no longer available. Fall back to the normal
    // source panel instead of leaving the direct-resume loading state visible.
    this.autoResumeAttempted = true;
    this.autoResumeUiActive = false;
    this.requestRender({ delayMs: 0 });
  },

  maybeAutoPlayStream({ allLoaded = false } = {}) {
    if (this.autoResumeUiActive || this.autoPlayAttempted || this.autoPlayCountdown) {
      return;
    }
    // Resume already navigated away, or there is nothing to play.
    if (Router.getCurrent() !== "stream" || !this.streams.length) {
      return;
    }
    const settings = PlayerSettingsStore.get();
    if (this.params?.manualSelection) {
      return;
    }
    if (!allLoaded && !this.autoPlaySelectionReady) {
      return;
    }
    // "Manual (choose stream)" is authoritative for a fresh stream screen.
    // Persisted binge groups may still guide an enabled auto-play mode and the
    // next-episode player flow, but must not turn Continue Watching or Details
    // into an implicit auto-play entry point.
    const autoPlayMode = String(settings.streamAutoPlayMode || "MANUAL").toUpperCase();
    if (autoPlayMode === "MANUAL" || !isAutoPlayEffectivelyEnabled(settings)) {
      return;
    }
    const savedPreference =
      settings.streamAutoPlayPreferBingeGroupForNextEpisode &&
      settings.streamAutoPlayReuseBingeGroup
        ? StreamPreferencesStore.getEntry(
            this.params?.itemId,
            this.params?.videoId || this.params?.itemId
          )
        : null;
    const preferredBingeGroup = String(savedPreference?.bingeGroup || "").trim();
    const installedAddonNames = new Set(
      (addonRepository.getCachedInstalledAddons() || [])
        .map((addon) => String(addon?.displayName || addon?.name || "").trim())
        .filter(Boolean)
    );
    const selected = selectAutoPlayStream(this.getFilteredStreams(), {
      mode: settings.streamAutoPlayMode,
      source: settings.streamAutoPlaySource,
      regexPattern: settings.streamAutoPlayRegex,
      installedAddonNames,
      selectedAddons: settings.streamAutoPlaySelectedAddons,
      selectedPlugins: settings.streamAutoPlaySelectedPlugins,
      preferredBingeGroup,
      preferBingeGroupInSelection: Boolean(preferredBingeGroup)
    });
    if (!selected?.id) {
      if (allLoaded) {
        this.autoPlayAttempted = true;
      }
      return;
    }
    this.autoPlayAttempted = true;
    this.cancelAutoPlaySelectionWait();
    void this.playStream(selected.id);
  },

  cancelAutoPlaySelectionWait() {
    if (this.autoPlaySelectionWaitTimer) {
      clearTimeout(this.autoPlaySelectionWaitTimer);
      this.autoPlaySelectionWaitTimer = null;
    }
  },

  startAutoPlayCountdown(stream, seconds) {
    this.cancelAutoPlayCountdown();
    // Focus the chosen stream so cancelling leaves the user on it.
    const visible = this.getFilteredStreams();
    const idx = visible.findIndex((entry) => String(entry?.id || "") === String(stream.id || ""));
    if (idx >= 0) {
      this.focusState = { zone: "card", index: idx, row: idx, action: "play" };
    }
    const total = Math.max(0, Math.trunc(Number(seconds) || 0));
    if (total <= 0) {
      void this.playStream(stream.id);
      return;
    }
    this.autoPlayCountdown = {
      streamId: stream.id,
      label: getStreamHeadline(stream) || stream.addonName || "stream",
      secondsLeft: total
    };
    this.requestRender({ delayMs: 0 });
    this.autoPlayTimer = setInterval(() => {
      if (!this.autoPlayCountdown) {
        return;
      }
      this.autoPlayCountdown.secondsLeft -= 1;
      if (this.autoPlayCountdown.secondsLeft <= 0) {
        const targetId = this.autoPlayCountdown.streamId;
        this.cancelAutoPlayCountdown();
        void this.playStream(targetId);
        return;
      }
      this.requestRender({ delayMs: 0 });
    }, 1000);
  },

  cancelAutoPlayCountdown() {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    if (this.autoPlayCountdown) {
      this.autoPlayCountdown = null;
      this.requestRender({ delayMs: 0 });
    }
  },

  renderAutoPlayOverlay() {
    if (!this.autoPlayCountdown) {
      return "";
    }
    const { label, secondsLeft } = this.autoPlayCountdown;
    return `
      <div class="stream-route-autoplay">
        <div class="stream-route-autoplay-card">
          <div class="stream-route-autoplay-title">${escapeHtml(t("stream_autoplay_title", {}, "Auto-playing"))}</div>
          <div class="stream-route-autoplay-name">${escapeHtml(label)}</div>
          <div class="stream-route-autoplay-count">${escapeHtml(t("stream_autoplay_countdown", [secondsLeft], `Starting in ${secondsLeft}s`))}</div>
          <div class="stream-route-autoplay-hint">${escapeHtml(t("stream_autoplay_hint", {}, "Press OK to play now, or any key to choose manually"))}</div>
        </div>
      </div>`;
  },

  renderContinueWatchingResumeOverlay() {
    if (!this.autoResumeUiActive) {
      return "";
    }
    const title = String(
      this.params?.episodeTitle || this.params?.itemTitle || this.params?.playerTitle || ""
    ).trim();
    return `
      <div class="stream-route-autoplay">
        <div class="stream-route-autoplay-card">
          <div class="stream-route-autoplay-title">${escapeHtml(
            t("stream_finding_source", {}, "Finding stream source")
          )}</div>
          ${title ? `<div class="stream-route-autoplay-name">${escapeHtml(title)}</div>` : ""}
        </div>
      </div>`;
  },

  scheduleErrorChipCleanup() {
    if (this.errorChipTimer) {
      clearTimeout(this.errorChipTimer);
      this.errorChipTimer = null;
    }
    if (!this.sourceChips.some((chip) => chip.status === "error")) {
      return;
    }
    this.errorChipTimer = setTimeout(() => {
      this.sourceChips = this.sourceChips.filter((chip) => chip.status !== "error");
      this.requestRender();
    }, 1600);
  },

  getOrderedFilterNames() {
    return getOrderedFilterNames(this.sourceChips, this.streams);
  },

  getFilteredStreams(filter = this.addonFilter) {
    // Cache the sorted/filtered result so focus navigation (which re-requests
    // this on every move via badge hydration) does not re-sort and re-parse
    // the whole source list each keypress. The cache is keyed on the inputs
    // that affect the result and is cleared in render() when data changes.
    const cache = this._filteredStreamsCache;
    if (
      cache &&
      cache.streams === this.streams &&
      cache.chips === this.sourceChips &&
      cache.filter === filter
    ) {
      return cache.result;
    }
    const orderedStreams = sortStreamsByAddonOrder(this.streams, this.sourceChips);
    const result =
      filter === "all"
        ? DebridStreamPresentation.sortForDisplay(orderedStreams, DebridSettingsStore.get())
        : orderedStreams.filter((stream) => stream.addonName === filter);
    this._filteredStreamsCache = {
      streams: this.streams,
      chips: this.sourceChips,
      filter,
      result
    };
    return result;
  },

  hasPendingSourceLoads(filter = this.addonFilter) {
    if (!Array.isArray(this.sourceChips) || !this.sourceChips.length) {
      return Boolean(this.loading);
    }
    if (filter === "all") {
      return this.sourceChips.some((chip) => chip.status === "loading");
    }
    return this.sourceChips.some((chip) => chip.name === filter && chip.status === "loading");
  },

  setAddonFilter(nextFilter, preferredZone = "filter", preferredIndex = 0) {
    const targetFilter = String(nextFilter || "all");
    this.addonFilter = targetFilter;
    const filtered = this.getFilteredStreams(targetFilter);
    if (preferredZone === "card" && filtered.length) {
      this.focusState = {
        zone: "card",
        row: clamp(preferredIndex, 0, filtered.length - 1),
        action: "play"
      };
    } else {
      const ordered = ["all", ...this.getOrderedFilterNames()];
      this.focusState = {
        zone: "filter",
        index: clamp(ordered.indexOf(targetFilter), 0, Math.max(0, ordered.length - 1))
      };
    }
    this.listScrollTop = 0;
    this.render();
  },

  resolveCardActionForRow(row = null, preferredAction = "play") {
    if (!row) {
      return null;
    }
    if (preferredAction === "native" && row.native) {
      return row.native;
    }
    return row.play || row.native || null;
  },

  getCardRows() {
    return Array.from(
      this.container?.querySelectorAll(".stream-route-card-row[data-stream-row]") || []
    )
      .map((rowNode) => ({
        row: Number(rowNode.dataset.streamRow || 0),
        play: rowNode.querySelector('[data-card-action="play"]'),
        native: rowNode.querySelector('[data-card-action="native"]')
      }))
      .filter((row) => row.play || row.native);
  },

  isCardActionFocused(rowIndex, action) {
    return (
      this.focusState?.zone === "card" &&
      Number(this.focusState?.row || 0) === Number(rowIndex) &&
      String(this.focusState?.action || "play") === String(action || "play")
    );
  },

  focusElement(target) {
    if (!target) {
      return false;
    }
    // Long source lists used to scan every focusable node on every D-pad
    // press just to clear one class. Keep the active node instead: focus
    // movement now updates only the previous and next cards, matching the
    // bounded work Android gets from LazyColumn focus navigation.
    const previous =
      this.focusedElement && this.container?.contains(this.focusedElement)
        ? this.focusedElement
        : this.container?.querySelector(".focusable.focused");
    if (previous && previous !== target) {
      previous.classList.remove("focused");
    }
    target.classList.add("focused");
    this.focusedElement = target;
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }

    const chipTrack = target.closest(".stream-route-chip-track");
    if (chipTrack) {
      const left = target.offsetLeft;
      const right = left + target.offsetWidth;
      const viewLeft = chipTrack.scrollLeft;
      const viewRight = viewLeft + chipTrack.clientWidth;
      const pad = 24;
      if (right > viewRight - pad) {
        chipTrack.scrollLeft = Math.max(0, right - chipTrack.clientWidth + pad);
      } else if (left < viewLeft + pad) {
        chipTrack.scrollLeft = Math.max(0, left - pad);
      }
    }

    const listNode = target.closest(".stream-route-list");
    if (listNode) {
      this.ensureListItemVisible(listNode, target);
      this.listScrollTop = this.getListScrollTop(listNode);
      this.scheduleFocusedListItemVisibilityCheck(listNode, target);
    }
    return true;
  },

  focusList(list, index) {
    if (!Array.isArray(list) || !list.length) {
      return false;
    }
    const targetIndex = clamp(index, 0, list.length - 1);
    const target = list[targetIndex];
    if (!target) {
      return false;
    }
    return this.focusElement(target);
  },

  isLegacyWebOsRoute() {
    return Boolean(
      document.documentElement?.classList?.contains("legacy-webos") ||
      document.body?.classList?.contains("legacy-webos")
    );
  },

  shouldUseManualListScroll(listNode) {
    if (!listNode || !Environment.isWebOS()) {
      return false;
    }
    return Number(listNode.scrollHeight || 0) > Number(listNode.clientHeight || 0);
  },

  getListScrollTop(listNode) {
    if (!listNode) {
      return 0;
    }
    if (listNode.classList?.contains("manual-scroll")) {
      return Number(listNode.dataset?.manualScrollTop || 0);
    }
    return Number(listNode.scrollTop || 0);
  },

  updateManualListScrollTransform(listNode, scrollTop) {
    if (!listNode) {
      return;
    }
    const normalized = Math.max(0, Number(scrollTop || 0));
    const transform = normalized > 0 ? `translateY(${-normalized}px)` : "";
    Array.from(listNode.children || []).forEach((child) => {
      if (child instanceof HTMLElement) {
        child.style.transform = transform;
      }
    });
  },

  applyManualListScroll(listNode, scrollTop) {
    if (!listNode) {
      return;
    }
    const normalized = Math.max(0, Number(scrollTop || 0));
    listNode.classList.add("manual-scroll");
    listNode.dataset.manualScrollTop = String(normalized);
    listNode.style.setProperty("--stream-route-manual-scroll", `${-normalized}px`);
    try {
      listNode.scrollTop = 0;
    } catch (_) {
      // Ignore webOS scrollTop assignment failures; the manual transform is authoritative.
    }
    this.updateManualListScrollTransform(listNode, normalized);
    this.listScrollTop = normalized;
  },

  setListScrollTop(listNode, nextScrollTop) {
    if (!listNode) {
      return;
    }
    const maxScrollTop = Math.max(
      0,
      Number(listNode.scrollHeight || 0) - Number(listNode.clientHeight || 0)
    );
    const normalized = clamp(Number(nextScrollTop || 0), 0, maxScrollTop);
    if (listNode.classList?.contains("manual-scroll")) {
      this.applyManualListScroll(listNode, normalized);
      return;
    }
    if (this.shouldUseManualListScroll(listNode)) {
      this.applyManualListScroll(listNode, normalized);
      return;
    }
    listNode.scrollTop = normalized;
    if (typeof listNode.scrollTo === "function") {
      try {
        listNode.scrollTo(0, normalized);
      } catch (_) {
        listNode.scrollTop = normalized;
      }
    }
    const applied = Number(listNode.scrollTop || 0);
    if (
      this.isLegacyWebOsRoute() &&
      maxScrollTop > 0 &&
      normalized > 0 &&
      Math.abs(applied - normalized) > 2
    ) {
      this.applyManualListScroll(listNode, normalized);
      return;
    }
    this.listScrollTop = Number(applied || normalized || 0);
  },

  ensureListItemVisible(listNode, target) {
    if (!listNode || !target) {
      return;
    }
    const viewTop = this.getListScrollTop(listNode);
    let itemTop = Number(target.offsetTop || 0);
    let itemBottom = itemTop + Number(target.offsetHeight || 0);
    if (
      typeof listNode.getBoundingClientRect === "function" &&
      typeof target.getBoundingClientRect === "function"
    ) {
      const listRect = listNode.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (
        listRect &&
        targetRect &&
        Number.isFinite(targetRect.top) &&
        Number.isFinite(listRect.top)
      ) {
        itemTop = viewTop + (targetRect.top - listRect.top);
        itemBottom = viewTop + (targetRect.bottom - listRect.top);
      }
    }
    const viewHeight = Number(listNode.clientHeight || 0);
    if (!viewHeight) {
      return;
    }
    const viewBottom = viewTop + viewHeight;
    const pad = 16;
    if (itemBottom > viewBottom - pad) {
      this.setListScrollTop(listNode, itemBottom - viewHeight + pad);
    } else if (itemTop < viewTop + pad) {
      this.setListScrollTop(listNode, itemTop - pad);
    }
  },

  scheduleFocusedListItemVisibilityCheck(listNode, target) {
    if (!listNode || !target) {
      return;
    }
    const run = () => {
      const root = document.documentElement || document.body;
      if (!this.container || !root?.contains?.(listNode) || !root?.contains?.(target)) {
        return;
      }
      this.ensureListItemVisible(listNode, target);
      this.requestStreamBadgeHydration();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
      return;
    }
    setTimeout(run, 0);
  },

  getFocusLists() {
    const listNode = this.container?.querySelector(".stream-route-list") || null;
    if (this.streamFocusDomCache?.listNode === listNode) {
      return this.streamFocusDomCache.value;
    }
    const chips = Array.from(this.container.querySelectorAll(".stream-route-chip.focusable"));
    const rows = this.getCardRows();
    const value = { chips, rows };
    this.streamFocusDomCache = { listNode, value };
    return value;
  },

  applyFocus() {
    const { chips, rows } = this.getFocusLists();
    if (!chips.length && !rows.length) {
      return;
    }
    const zone = this.focusState?.zone || (rows.length ? "card" : "filter");
    const index = Number(this.focusState?.index || 0);
    if (zone === "card" && rows.length) {
      const rowIndex = clamp(Number(this.focusState?.row || 0), 0, rows.length - 1);
      const preferredAction = String(this.focusState?.action || "play");
      const target = this.resolveCardActionForRow(rows[rowIndex], preferredAction);
      const resolvedAction = target?.dataset?.cardAction || "play";
      this.focusState = { zone: "card", row: rowIndex, action: resolvedAction };
      this.focusElement(target);
      return;
    }
    this.focusState = { zone: "filter", index: clamp(index, 0, Math.max(0, chips.length - 1)) };
    this.focusList(chips, this.focusState.index);
  },

  restoreScrollPosition() {
    const list = this.container?.querySelector(".stream-route-list");
    if (!list) {
      return;
    }
    this.setListScrollTop(list, Number(this.listScrollTop || 0));
  },

  getHeaderMeta() {
    const isSeries = normalizeType(this.params?.itemType) === "series";
    const title = String(this.params?.itemTitle || this.params?.playerTitle || "Untitled");
    const subtitle = isSeries
      ? String(this.params?.episodeTitle || this.params?.playerSubtitle || "").trim()
      : String(this.params?.itemSubtitle || "").trim();
    const episodeLabel = normalizeEpisodeCode(this.params?.season, this.params?.episode);
    const detailLine = isSeries
      ? ""
      : [String(this.params?.genres || "").trim(), String(this.params?.year || "").trim()]
          .filter(Boolean)
          .join(" • ");
    return { isSeries, title, subtitle, episodeLabel, detailLine };
  },

  async detectWebOsNativePlayerApp() {
    this.webOsNativePlayerAppId = "";
    return "";
  },

  showStreamToast(message) {
    if (!this.container) {
      return;
    }
    const shell = this.container.querySelector(".stream-route-shell");
    if (!shell) {
      return;
    }
    let toast = shell.querySelector(".stream-route-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "stream-route-toast";
      shell.appendChild(toast);
    }
    toast.textContent = String(message || "").trim();
    toast.classList.add("visible");
    if (this.streamToastTimer) {
      clearTimeout(this.streamToastTimer);
    }
    this.streamToastTimer = setTimeout(() => {
      toast?.classList.remove("visible");
    }, 2600);
  },

  getStreamRequestHeaders(stream = {}) {
    const raw = stream?.raw || stream || {};
    const requestHeaders =
      raw?.behaviorHints?.proxyHeaders?.request || stream?.behaviorHints?.proxyHeaders?.request;
    return requestHeaders && typeof requestHeaders === "object" ? { ...requestHeaders } : {};
  },

  async resolveDirectStreamUrl(stream = {}) {
    const requestHeaders = this.getStreamRequestHeaders(stream);
    if (Object.keys(requestHeaders).length) {
      return null;
    }
    let streamUrl = stream?.url || stream?.externalUrl || "";
    if (
      !streamUrl &&
      DirectDebridResolver.canResolveStream(stream, {
        season: this.params?.season ?? null,
        episode: this.params?.episode ?? null
      })
    ) {
      const result = await DirectDebridResolver.resolve(stream, {
        season: this.params?.season ?? null,
        episode: this.params?.episode ?? null
      }).catch(() => null);
      if (result?.status === "success" && result.stream) {
        streamUrl = result.stream.url || result.stream.externalUrl || "";
      }
    }
    return streamUrl || null;
  },

  resolveStreamMimeType(stream = {}, fallbackUrl = "") {
    const raw = stream?.raw || stream || {};
    const candidates = [
      stream?.mimeType,
      raw?.mimeType,
      stream?.sourceType,
      raw?.sourceType,
      raw?.type,
      raw?.source
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const explicit = candidates.find((value) => value.includes("/"));
    if (explicit) {
      return explicit;
    }
    const alias = String(candidates[0] || "").toLowerCase();
    const aliasMap = {
      dash: "application/dash+xml",
      hls: "application/vnd.apple.mpegurl",
      m3u8: "application/vnd.apple.mpegurl",
      m4v: "video/mp4",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      mp4: "video/mp4",
      mpd: "application/dash+xml",
      ts: "video/mp2t",
      webm: "video/webm"
    };
    return aliasMap[alias] || guessMimeTypeFromUrl(fallbackUrl) || "video/mp4";
  },

  getWebOsNativeLaunchUrl(stream = {}) {
    const requestHeaders = this.getStreamRequestHeaders(stream);
    if (Object.keys(requestHeaders).length) {
      return "";
    }
    const candidates = [
      stream?.engineFs?.publicPlaybackUrl,
      stream?.raw?.engineFs?.publicPlaybackUrl,
      stream?.externalUrl,
      stream?.url,
      stream?.raw?.externalUrl,
      stream?.raw?.url
    ].filter(Boolean);
    return (
      candidates.find(
        (value) => isLaunchableExternalMediaUrl(value) && !isLocalOnlyPlaybackUrl(value)
      ) || ""
    );
  },

  canOfferNativePlayerForStream(stream = {}) {
    if (!Environment.isWebOS() || !this.webOsNativePlayerAppId) {
      return false;
    }
    if (this.getWebOsNativeLaunchUrl(stream)) {
      return true;
    }
    if (WebOsEngineFsResolver.canResolveStream(stream)) {
      return true;
    }
    return DirectDebridResolver.canResolveStream(stream, {
      season: this.params?.season ?? null,
      episode: this.params?.episode ?? null
    });
  },

  replaceStreamInList(streamId, nextStream = null) {
    if (!streamId || !nextStream) {
      return;
    }
    this.streams = this.streams.map((stream) =>
      stream.id === streamId ? { ...stream, ...nextStream } : stream
    );
  },

  async resolveStreamForNativePlayer(stream = {}) {
    const directUrl = this.getWebOsNativeLaunchUrl(stream);
    if (directUrl) {
      return { status: "success", stream };
    }
    if (WebOsEngineFsResolver.canResolveStream(stream)) {
      const result = await WebOsEngineFsResolver.resolve(stream, {});
      if (result?.status === "success" && result.stream) {
        return result;
      }
    }
    if (
      DirectDebridResolver.canResolveStream(stream, {
        season: this.params?.season ?? null,
        episode: this.params?.episode ?? null
      })
    ) {
      const result = await DirectDebridResolver.resolve(stream, {
        season: this.params?.season ?? null,
        episode: this.params?.episode ?? null
      });
      if (result?.status === "success" && result.stream) {
        return result;
      }
      return result || { status: "unavailable" };
    }
    return { status: "unavailable" };
  },

  buildWebOsNativePlayerLaunchParameters(stream = {}) {
    const appId = String(this.webOsNativePlayerAppId || "").trim();
    const launchUrl = this.getWebOsNativeLaunchUrl(stream);
    if (!appId || !launchUrl) {
      return null;
    }
    const filename = normalizeExternalLaunchFileName(
      stream?.behaviorHints?.filename ||
        stream?.raw?.behaviorHints?.filename ||
        stream?.title ||
        stream?.name ||
        this.params?.itemTitle ||
        this.params?.playerTitle
    );
    const mimeType = this.resolveStreamMimeType(stream, launchUrl);
    return {
      id: appId,
      params: {
        payload: [
          {
            fullPath: launchUrl,
            artist: "",
            subtitle: "",
            dlnaInfo: {
              flagVal: 4096,
              cleartextSize: "-1",
              contentLength: "-1",
              opVal: 1,
              protocolInfo: buildWebOsDlnaProtocolInfo(mimeType),
              duration: 0
            },
            mediaType: "VIDEO",
            thumbnail: "",
            deviceType: "DMR",
            album: "",
            fileName: filename,
            lastPlayPosition: -1
          }
        ]
      }
    };
  },

  async openStreamInNativePlayer(_streamId) {},

  renderPhone() {
    if (!this.container) {
      return;
    }
    if (this._unmountPhone) {
      this._unmountPhone();
    }
    this._unmountPhone = mountPreact(h(StreamScreenPhone, { screen: this }), this.container);
  },

  renderChip(name, selected, status) {
    const chipStatus = String(status || "success");
    const classes = [
      "stream-route-chip",
      "focusable",
      selected ? "selected" : "",
      chipStatus !== "success" ? chipStatus : ""
    ]
      .filter(Boolean)
      .join(" ");
    const spinner =
      chipStatus === "loading"
        ? renderLoadingIndicator({ className: "stream-route-chip-spinner" })
        : "";
    return `
      <button class="${classes}" data-action="setFilter" data-addon="${escapeHtml(name)}">
        ${spinner}
        <span>${escapeHtml(name === "all" ? t("common.all", {}, "All") : name)}</span>
      </button>
    `;
  },

  renderStreamCard(stream, index, streamBadgesEnabled = true, badgeSettings = null) {
    const headline = getStreamHeadline(stream);
    const quality = getStreamQuality(stream);
    const lazyBadges =
      (Environment.isWebOS() || Environment.isTizen()) &&
      hasStreamBadges(stream, streamBadgesEnabled, badgeSettings);
    const badges = lazyBadges
      ? `<div class="stream-route-card-badges stream-route-card-badges-lazy" data-lazy-stream-badges data-stream-badge-row="${index}" data-badges-hydrated="false" aria-label="${escapeHtml(t("settings_stream_badges_section", {}, "Fusion Style"))}"></div>`
      : renderStreamBadges(stream, streamBadgesEnabled, badgeSettings);
    const showAddonLogo = badgeSettings?.showAddonLogo === true;
    const badgePlacement = resolveStreamBadgePlacement(badgeSettings);
    const topBadges = badgePlacement === "TOP" ? badges : "";
    const bottomBadges = badgePlacement === "BOTTOM" ? badges : "";
    const descriptionLines = getStreamDescriptionLines(stream);
    let addonIdentity = "";
    if (showAddonLogo) {
      const addonLogoUrl =
        normalizeAddonLogoUrl(stream.addonLogo) ||
        resolveAddonLogo(stream.addonName, this.addonLogoLookup);
      const cachedAddonLogoUrl = getCachedAddonLogoDisplayUrl(addonLogoUrl);
      let displayAddonLogoUrl = cachedAddonLogoUrl || "";
      if (addonLogoUrl && !displayAddonLogoUrl && !hasFailedAddonLogo(addonLogoUrl)) {
        requestAddonLogo(addonLogoUrl, () => this.requestRender({ delayMs: 160 }));
        if (Environment.isWebOS()) {
          displayAddonLogoUrl = getCachedAddonLogoDisplayUrl(addonLogoUrl);
        }
      }
      const addonBadgeLabel = escapeHtml(getAddonBadgeLabel(stream.addonName || ""));
      const addonLogoLoading = Environment.isWebOS() || Environment.isTizen() ? "eager" : "lazy";
      const addonLogoDecoding = Environment.isWebOS() || Environment.isTizen() ? "sync" : "async";
      const addonBadge = displayAddonLogoUrl
        ? `<img src="${escapeHtml(displayAddonLogoUrl)}" alt="${escapeHtml(stream.addonName || "Addon")}" data-addon-logo="${escapeHtml(addonLogoUrl)}" decoding="${addonLogoDecoding}" loading="${addonLogoLoading}" referrerpolicy="no-referrer" /><span hidden>${addonBadgeLabel}</span>`
        : `<span>${addonBadgeLabel}</span>`;
      addonIdentity = `
          <div class="stream-route-card-side">
            <div class="stream-route-addon-badge">${addonBadge}</div>
            <div class="stream-route-addon-name">${escapeHtml(stream.addonName || "Addon")}</div>
          </div>`;
    }

    return `
      <div class="stream-route-card-row" data-stream-row="${index}">
        <article class="stream-route-card stream-route-card-action focusable${this.isCardActionFocused(index, "play") ? " focused" : ""}"
                 data-action="playStream"
                 data-card-action="play"
                 data-stream-id="${escapeHtml(stream.id)}"
                 data-stream-row="${index}">
          <div class="stream-route-card-copy">
            <div class="stream-route-card-heading">${escapeHtml(headline)}</div>
            ${topBadges || ""}
            ${!badges ? `<div class="stream-route-card-quality">${escapeHtml(quality)}</div>` : ""}
            ${descriptionLines.map((line, lineIndex) => `<div class="stream-route-card-line${lineIndex > 0 ? " secondary" : ""}">${escapeHtml(line)}</div>`).join("")}
            ${bottomBadges || ""}
          </div>
          ${addonIdentity}
        </article>
      </div>
    `;
  },

  renderLoadingCards(count = 3) {
    return `
      <div class="stream-route-card-row">
        <div class="stream-route-card skeleton">
          <div class="stream-route-card-copy">
            <div class="stream-route-skeleton-line"></div>
            <div class="stream-route-skeleton-line"></div>
            <div class="stream-route-skeleton-line"></div>
            <div class="stream-route-skeleton-line"></div>
          </div>
        </div>
      </div>
    `.repeat(count);
  },

  render() {
    this.renderPhone();
  },

  bindListScrollState() {
    const list = this.container?.querySelector(".stream-route-list");
    if (!list) {
      return;
    }
    // A full innerHTML write used to discard this node along with its listeners.
    // Now that an unchanged render keeps the node alive, re-binding would stack
    // a duplicate scroll handler on every render.
    if (this.boundStreamListNode === list) {
      return;
    }
    this.boundStreamListNode = list;
    list.addEventListener(
      "scroll",
      () => {
        this.listScrollTop = this.getListScrollTop(list);
        this.requestStreamBadgeHydration();
      },
      { passive: true }
    );
    if (Environment.isWebOS()) {
      list.addEventListener(
        "wheel",
        (event) => {
          const deltaMode = Number(event?.deltaMode || 0);
          const multiplier = deltaMode === 1 ? 40 : deltaMode === 2 ? list.clientHeight : 1;
          const deltaY = Number(event?.deltaY || 0) * multiplier;
          if (!deltaY) {
            return;
          }
          event?.preventDefault?.();
          this.setListScrollTop(list, this.getListScrollTop(list) + deltaY);
          this.requestStreamBadgeHydration();
        },
        { passive: false }
      );
    }
  },

  requestStreamBadgeHydration() {
    if (
      (!Environment.isWebOS() && !Environment.isTizen()) ||
      Router.getCurrent() !== "stream" ||
      this.streamBadgeHydrationFrame
    ) {
      return;
    }
    this.streamBadgeHydrationFrame = requestAnimationFrame(() => {
      this.streamBadgeHydrationFrame = null;
      this.hydrateVisibleStreamBadges();
    });
  },

  hydrateVisibleStreamBadges() {
    if (
      (!Environment.isWebOS() && !Environment.isTizen()) ||
      Router.getCurrent() !== "stream" ||
      !this.container
    ) {
      return;
    }
    const list = this.container.querySelector(".stream-route-list");
    const placeholders = Array.from(this.container.querySelectorAll("[data-lazy-stream-badges]"));
    if (!list || !placeholders.length) {
      return;
    }
    const filtered = this.getFilteredStreams();
    const streamBadgesEnabled = DebridSettingsStore.get().streamBadgesEnabled !== false;
    const badgeSettings = StreamBadgeSettingsStore.snapshot();
    const focusedRow = this.focusState?.zone === "card" ? Number(this.focusState?.row || 0) : -1;

    // Android's LazyColumn only composes badge images near the viewport. Keep
    // the complete Web card list for existing remote/pointer navigation, but
    // apply the same bounded image/DOM lifetime on webOS and Tizen. Window by
    // row index around the focus (the focused row is always scrolled into view)
    // instead of measuring every card: per-card geometry reads forced a full
    // list reflow on every focus move on constrained TV browsers.
    const anchorRow = focusedRow >= 0 ? focusedRow : 0;
    const windowStart = anchorRow - TV_STREAM_BADGE_WINDOW_ROWS;
    const windowEnd = anchorRow + TV_STREAM_BADGE_WINDOW_ROWS;
    placeholders.forEach((placeholder) => {
      const rowIndex = Number(placeholder.dataset.streamBadgeRow || -1);
      const shouldHydrate =
        rowIndex === focusedRow || (rowIndex >= windowStart && rowIndex <= windowEnd);
      const hydrated = placeholder.dataset.badgesHydrated === "true";
      if (shouldHydrate && !hydrated) {
        placeholder.innerHTML = renderStreamBadgeContents(
          filtered[rowIndex],
          streamBadgesEnabled,
          badgeSettings
        );
        // webOS already uses the fixed-height lazy badge row. Tizen must drop
        // that placeholder-only class once hydrated so its visible wrapping
        // and card geometry remain byte-for-byte CSS-equivalent to the eager
        // rendering path.
        if (Environment.isTizen()) {
          placeholder.classList.remove("stream-route-card-badges-lazy");
        }
        placeholder.dataset.badgesHydrated = "true";
        // Keep already-visited Tizen rows hydrated. Removing a wrapped badge row
        // above the viewport could change list geometry and move the focused card.
      } else if (!shouldHydrate && hydrated && !Environment.isTizen()) {
        placeholder.textContent = "";
        placeholder.dataset.badgesHydrated = "false";
      }
    });
  },

  bindAddonLogoFallbacks() {
    this.container
      ?.querySelectorAll(".stream-route-addon-badge img[data-addon-logo]")
      .forEach((node) => {
        if (!(node instanceof HTMLImageElement) || node.dataset.fallbackBound === "true") {
          return;
        }
        node.dataset.fallbackBound = "true";
        const fallback = node.nextElementSibling;
        const applyFallback = () => {
          rememberFailedAddonLogo(node.dataset.addonLogo || node.getAttribute("src") || "");
          node.hidden = true;
          if (fallback instanceof HTMLElement) {
            fallback.hidden = false;
          }
        };
        node.addEventListener("error", applyFallback, { once: true });
      });
  },

  // Hands playback off to another app on this phone instead of the in-app
  // player, when the profile has an external player configured. Returns
  // true when it handled playback (caller should not also navigate to the
  // in-app player screen).
  async tryOpenInExternalPlayer(stream = {}) {
    const mobileOs = Environment.getMobileOs();
    if (!Environment.isBrowser() || mobileOs === "other") {
      return false;
    }
    const playerType = PlayerSettingsStore.get().externalPlayerType;
    if (
      !playerType ||
      playerType === DISABLED_PLAYER_ID ||
      !isExternalPlayerSelectable(playerType, mobileOs)
    ) {
      return false;
    }

    const magnetFallback = buildMagnetFallback(stream);
    // resolveDirectStreamUrl() returns null both when the stream needs custom request headers
    // (no deep-link scheme can carry those — same rule the (currently unused) webOS
    // native-player path already applies) and when nothing resolvable was found, so both of
    // the original two "fall back to magnet, else bail" branches collapse into this one check.
    const streamUrl = await this.resolveDirectStreamUrl(stream);

    if (!streamUrl) {
      if (magnetFallback) {
        this.launchExternalPlayerHref(magnetFallback);
        return true;
      }
      return false;
    }

    const link = buildExternalPlayerLink({ playerId: playerType, mobileOs, streamUrl });
    if (!link) {
      return false;
    }
    this.launchExternalPlayerHref(link.href, link.download);
    return true;
  },

  launchExternalPlayerHref(
    href,
    download = null,
    toastMessage = t("player_external_player_opened", {}, "Opened in external player")
  ) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.rel = "noopener";
    if (download) {
      anchor.download = download;
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (toastMessage) {
      this.showStreamToast(toastMessage);
    }
  },

  async playStream(streamId) {
    this.cancelAutoPlayCountdown();
    this.cancelAutoPlaySelectionWait();
    const filtered = this.getFilteredStreams();
    const selected = filtered.find((stream) => stream.id === streamId) || filtered[0];
    if (!selected) {
      return;
    }
    if (await this.tryOpenInExternalPlayer(selected)) {
      return;
    }
    return this.playStreamInternal(selected);
  },

  async playStreamInternal(selected) {
    const playerStreamCandidates = this.getFilteredStreams();
    const itemType = normalizeType(this.params?.itemType);
    const startFromBeginning = Boolean(this.params?.startFromBeginning);
    const routeResumeProgress = {
      positionMs: Number(this.params?.resumePositionMs || 0) || 0,
      progressPercent: this.params?.resumeProgressPercent,
      durationMs: Number(this.params?.resumeDurationMs || 0) || 0
    };
    const hasRouteResume = !startFromBeginning && isWatchProgressInProgress(routeResumeProgress);
    let resumePositionMs = hasRouteResume ? routeResumeProgress.positionMs : 0;
    let resumeProgressPercent = hasRouteResume ? routeResumeProgress.progressPercent : null;
    let resumeDurationMs = hasRouteResume ? routeResumeProgress.durationMs : 0;
    if (!startFromBeginning && resumePositionMs <= 0 && !(Number(resumeProgressPercent) > 0)) {
      const resumeTarget =
        itemType === "series" || itemType === "tv"
          ? {
              videoId: this.params?.videoId || null,
              season: this.params?.season,
              episode: this.params?.episode
            }
          : {};
      const resumeProgress = await watchProgressRepository
        .getResumeByContentId(this.params?.itemId, resumeTarget)
        .catch((error) => {
          console.warn("Stream resume lookup failed", error);
          return null;
        });
      resumePositionMs = Number(resumeProgress?.positionMs || 0) || 0;
      resumeProgressPercent = resumeProgress?.progressPercent ?? resumeProgressPercent;
      resumeDurationMs = Number(resumeProgress?.durationMs || 0) || resumeDurationMs;
    }

    Router.navigate("player", {
      streamUrl: selected.url || selected.externalUrl || null,
      itemId: this.params?.itemId || null,
      itemType: itemType || "movie",
      imdbId: this.params?.imdbId || null,
      tmdbId: this.params?.tmdbId || this.params?.tmdb_id || null,
      traktId: this.params?.traktId || this.params?.trakt_id || null,
      contentLanguage:
        this.params?.contentLanguage ||
        this.params?.originalLanguage ||
        this.params?.original_language ||
        null,
      videoId: this.params?.videoId || null,
      resumePositionMs,
      resumeProgressPercent,
      resumeDurationMs,
      startFromBeginning,
      episodeLabel:
        this.params?.season && this.params?.episode
          ? `S${this.params.season}E${this.params.episode}`
          : null,
      playerTitle: this.params?.itemTitle || this.params?.playerTitle || "Untitled",
      playerSubtitle: this.params?.episodeTitle || this.params?.playerSubtitle || "",
      playerEpisodeTitle: this.params?.episodeTitle || "",
      playerReleaseYear: this.params?.year || "",
      playerBackdropUrl: this.getBackdropUrl() || null,
      playerLogoUrl: this.params?.logo || null,
      parentalWarnings: this.params?.parentalWarnings || null,
      parentalGuide: this.params?.parentalGuide || null,
      season: this.params?.season == null ? null : Number(this.params.season),
      episode: this.params?.episode == null ? null : Number(this.params.episode),
      episodes: Array.isArray(this.params?.episodes) ? this.params.episodes : [],
      streamCandidates: playerStreamCandidates,
      preferredStreamId: selected.id,
      playbackSourceContext: selected.streamOrigin || {
        addonId: selected.addonId || "",
        addonBaseUrl: selected.addonBaseUrl || "",
        addonName: selected.addonName || "",
        addonOrderIndex: Number.isFinite(Number(selected.addonOrderIndex))
          ? Number(selected.addonOrderIndex)
          : null,
        sourceProviderId: selected.sourceProviderId || "",
        sourceIds: Array.isArray(selected.sources) ? selected.sources : [],
        selectedStreamId: selected.id || ""
      },
      returnToStreamOnBack: true,
      streamRouteParams: this.params ? { ...this.params } : null,
      fromDetailRoute: Boolean(this.params?.fromDetailRoute),
      nextEpisodeVideoId: this.params?.nextEpisodeVideoId || null,
      nextEpisodeLabel: this.params?.nextEpisodeLabel || null,
      nextEpisodeSeason: this.params?.nextEpisodeSeason ?? null,
      nextEpisodeEpisode: this.params?.nextEpisodeEpisode ?? null,
      nextEpisodeTitle: this.params?.nextEpisodeTitle || "",
      nextEpisodeReleased: this.params?.nextEpisodeReleased || ""
    });
  },

  onPointerFocus(target) {
    if (!target || !this.container?.contains(target)) {
      return false;
    }
    const { chips } = this.getFocusLists();
    const chipTarget = target.closest?.(".stream-route-chip.focusable") || target;
    const chipIndex = chips.indexOf(chipTarget);
    if (chipIndex >= 0) {
      this.focusState = { zone: "filter", index: chipIndex };
      this.focusList(chips, chipIndex);
      return true;
    }
    const cardAction = target.closest?.("[data-stream-row][data-card-action]");
    if (cardAction) {
      this.focusState = {
        zone: "card",
        row: Math.max(0, Number(cardAction.dataset.streamRow || 0)),
        action: String(cardAction.dataset.cardAction || "play")
      };
      this.focusElement(cardAction);
      return true;
    }
    return false;
  },

  onPointerActivate() {
    return false;
  },

  onKeyDown(event) {
    // Any key during the auto-play countdown hands control back to the user.
    // Back just cancels and stays on the picker; other keys cancel and then do
    // their normal thing (OK on the highlighted stream plays it right away).
    if (this.autoPlayCountdown) {
      this.cancelAutoPlayCountdown();
      if (isBackEvent(event)) {
        event?.preventDefault?.();
        return;
      }
    }

    if (isBackEvent(event)) {
      event?.preventDefault?.();
      if (!this.navigateBackFromStream()) {
        Router.back();
      }
      return;
    }

    const direction = getDpadDirection(event);
    if (direction) {
      const { chips, rows } = this.getFocusLists();
      const zone = this.focusState?.zone || (rows.length ? "card" : "filter");
      let index = Number(this.focusState?.index || 0);
      event?.preventDefault?.();

      if (zone === "filter") {
        if (direction === "left") {
          if (chips.length) {
            const ordered = ["all", ...this.getOrderedFilterNames()];
            const currentFilter = ordered[clamp(index, 0, ordered.length - 1)] || "all";
            const currentPosition = ordered.indexOf(currentFilter);
            const nextFilter = ordered[clamp(currentPosition - 1, 0, ordered.length - 1)];
            this.setAddonFilter(
              nextFilter,
              "filter",
              clamp(index - 1, 0, Math.max(0, chips.length - 1))
            );
          }
          return;
        }
        if (direction === "right") {
          if (chips.length) {
            const ordered = ["all", ...this.getOrderedFilterNames()];
            const currentFilter = ordered[clamp(index, 0, ordered.length - 1)] || "all";
            const currentPosition = ordered.indexOf(currentFilter);
            const nextFilter = ordered[clamp(currentPosition + 1, 0, ordered.length - 1)];
            this.setAddonFilter(
              nextFilter,
              "filter",
              clamp(index + 1, 0, Math.max(0, chips.length - 1))
            );
          }
          return;
        }
        if (direction === "down" && rows.length) {
          this.focusState = { zone: "card", row: 0, action: "play" };
          this.applyFocus();
        }
        return;
      }

      if (zone === "card") {
        const rowIndex = clamp(Number(this.focusState?.row || 0), 0, Math.max(0, rows.length - 1));
        const currentRow = rows[rowIndex] || null;
        const currentAction = String(this.focusState?.action || "play");
        if (direction === "up") {
          if (rowIndex > 0) {
            const previousRow = rows[rowIndex - 1] || null;
            const target = this.resolveCardActionForRow(previousRow, currentAction);
            this.focusState = {
              zone: "card",
              row: rowIndex - 1,
              action: String(target?.dataset?.cardAction || "play")
            };
            this.applyFocus();
            return;
          }
          this.focusState = {
            zone: "filter",
            index: clamp(
              ["all", ...this.getOrderedFilterNames()].indexOf(this.addonFilter),
              0,
              Math.max(0, chips.length - 1)
            )
          };
          this.applyFocus();
          return;
        }
        if (direction === "down") {
          const nextRowIndex = clamp(rowIndex + 1, 0, Math.max(0, rows.length - 1));
          const nextRow = rows[nextRowIndex] || null;
          const target = this.resolveCardActionForRow(nextRow, currentAction);
          this.focusState = {
            zone: "card",
            row: nextRowIndex,
            action: String(target?.dataset?.cardAction || "play")
          };
          this.applyFocus();
          return;
        }
        if (direction === "left") {
          if (currentAction === "native" && currentRow?.play) {
            this.focusState = { zone: "card", row: rowIndex, action: "play" };
            this.applyFocus();
            return;
          }
          const ordered = ["all", ...this.getOrderedFilterNames()];
          const currentIndex = Math.max(0, ordered.indexOf(this.addonFilter));
          const nextFilter = ordered[clamp(currentIndex - 1, 0, ordered.length - 1)] || "all";
          this.setAddonFilter(nextFilter, "card", rowIndex);
          return;
        }
        if (direction === "right") {
          if (currentAction === "play" && currentRow?.native) {
            this.focusState = { zone: "card", row: rowIndex, action: "native" };
            this.applyFocus();
            return;
          }
          const ordered = ["all", ...this.getOrderedFilterNames()];
          const currentIndex = Math.max(0, ordered.indexOf(this.addonFilter));
          const nextFilter = ordered[clamp(currentIndex + 1, 0, ordered.length - 1)] || "all";
          this.setAddonFilter(nextFilter, "card", rowIndex);
          return;
        }
      }
      return;
    }

    if (Number(event?.keyCode || 0) !== 13) {
      return;
    }

    const current = this.container.querySelector(".focusable.focused");
    if (!current) {
      return;
    }
    const action = String(current.dataset.action || "");
    if (action === "setFilter") {
      const addon = String(current.dataset.addon || "all");
      this.setAddonFilter(
        addon,
        "filter",
        Array.from(this.container.querySelectorAll(".stream-route-chip.focusable")).indexOf(current)
      );
      return;
    }
    if (action === "playStream") {
      this.playStream(current.dataset.streamId);
      return;
    }
    if (action === "openNativePlayer") {
      void this.openStreamInNativePlayer(current.dataset.streamId);
    }
  },

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    this.cancelAutoPlayCountdown();
    this.cancelAutoPlaySelectionWait();
    this.loadToken = (this.loadToken || 0) + 1;
    this.playResolveToken = Number(this.playResolveToken || 0) + 1;
    this.nativePlayerRequestToken = Number(this.nativePlayerRequestToken || 0) + 1;
    this.cancelScheduledRender();
    if (this.errorChipTimer) {
      clearTimeout(this.errorChipTimer);
      this.errorChipTimer = null;
    }
    if (this.streamToastTimer) {
      clearTimeout(this.streamToastTimer);
      this.streamToastTimer = null;
    }
    if (this.releaseImageProxyReadyListener) {
      this.releaseImageProxyReadyListener();
      this.releaseImageProxyReadyListener = null;
    }
    this.renderedMarkup = null;
    this.boundStreamListNode = null;
    this.streamFocusDomCache = null;
    this.focusedElement = null;
    ScreenUtils.hide(this.container);
  }
};

// ---------------------------------------------------------------------------
// Phone stream screen component
// ---------------------------------------------------------------------------

function phoneT(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function Html({ html, tag = "span", ...rest }) {
  const Tag = tag;
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15 18l-6-6 6-6"
      />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0 0 14.5 3M19.5 9A8 8 0 0 0 5 6"
      />
    </svg>
  );
}

function iconCopyHtml() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;
}

function iconExternalHtml() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M10 14 20 4M19 13v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>`;
}

function iconInternalHtml() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M10 8.5v6l5-3z"/></svg>`;
}

function iconDownloadHtml() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>`;
}

function formatResumeClock(positionMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(positionMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function PhoneHero({ screen }) {
  const { isSeries, title, subtitle, episodeLabel, detailLine } = screen.getHeaderMeta();
  const backdrop = screen.getBackdropUrl();
  const logo = screen.params?.logo || "";

  if (isSeries) {
    return (
      <section class="phone-stream-hero">
        {backdrop ? (
          <img class="phone-stream-hero-thumb" src={backdrop} alt="" loading="eager" />
        ) : (
          <div class="phone-stream-hero-thumb phone-stream-hero-thumb-empty" aria-hidden="true" />
        )}
        {episodeLabel ? <div class="phone-stream-hero-badge">{episodeLabel}</div> : null}
        <h1 class="phone-stream-hero-title">{title}</h1>
        {subtitle ? <div class="phone-stream-hero-subtitle">{subtitle}</div> : null}
      </section>
    );
  }

  return (
    <section class="phone-stream-hero phone-stream-hero-movie">
      {logo ? (
        <img class="phone-stream-hero-logo" src={logo} alt={title} />
      ) : (
        <h1 class="phone-stream-hero-title centered">{title}</h1>
      )}
      {detailLine ? <div class="phone-stream-hero-meta">{detailLine}</div> : null}
    </section>
  );
}

function PhoneResumePill({ screen, filtered, onPlay }) {
  if (screen.params?.startFromBeginning) {
    return null;
  }
  const hasResume = isWatchProgressInProgress({
    positionMs: Number(screen.params?.resumePositionMs || 0) || 0,
    progressPercent: screen.params?.resumeProgressPercent,
    durationMs: Number(screen.params?.resumeDurationMs || 0) || 0
  });
  if (!hasResume || !filtered.length) {
    return null;
  }
  const preferredId = String(screen.params?.preferredStreamId || "").trim();
  const target =
    (preferredId && filtered.find((stream) => stream.id === preferredId)) || filtered[0];
  if (!target?.id) {
    return null;
  }
  const positionLabel = formatResumeClock(Number(screen.params?.resumePositionMs || 0));
  return (
    <button
      type="button"
      class="phone-stream-resume-pill focusable"
      data-action="resumePlay"
      data-stream-id={target.id}
      onClick={() => onPlay(target.id)}
    >
      <IconPlay />
      <span>{phoneT("stream_resume_from", [positionLabel], `Resume from ${positionLabel}`)}</span>
    </button>
  );
}

function PhoneChip({ addon, label, selected, status, onSelect }) {
  const chipStatus = String(status || "success");
  const classes = [
    "phone-stream-chip",
    "focusable",
    selected ? "selected" : "",
    chipStatus !== "success" ? chipStatus : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      class={classes}
      data-action="setFilter"
      data-addon={addon}
      onClick={() => onSelect(addon)}
    >
      {chipStatus === "loading" ? (
        <Html
          tag="span"
          html={renderLoadingIndicator({ className: "phone-stream-chip-spinner" })}
        />
      ) : null}
      <span>{label}</span>
    </button>
  );
}

function PhoneFilterRow({ screen, onSelectFilter, onRefresh }) {
  const ordered = screen.getOrderedFilterNames();
  return (
    <div class="phone-stream-chip-row-wrap">
      <div class="phone-stream-chip-row" data-phone-stream-chip-row>
        <button
          type="button"
          class="phone-stream-chip phone-stream-chip-refresh focusable"
          data-action="refreshStreams"
          aria-label={phoneT("common.refresh", {}, "Refresh")}
          onClick={onRefresh}
        >
          <IconRefresh />
        </button>
        <PhoneChip
          addon="all"
          label={phoneT("common.all", {}, "All")}
          selected={screen.addonFilter === "all"}
          status="success"
          onSelect={onSelectFilter}
        />
        {ordered.map((name) => {
          const chip = screen.sourceChips.find((entry) => entry.name === name) || {
            name,
            status: "success"
          };
          return (
            <PhoneChip
              key={name}
              addon={name}
              label={name}
              selected={screen.addonFilter === name}
              status={chip.status}
              onSelect={onSelectFilter}
            />
          );
        })}
      </div>
    </div>
  );
}

function buildPhoneSubgroups(streams) {
  const distinct = new Set(
    streams.map((stream) => String(stream.sourceProviderId || "").trim()).filter(Boolean)
  );
  if (distinct.size < 2) {
    return [{ label: "", streams }];
  }
  const order = [];
  const bySource = new Map();
  streams.forEach((stream) => {
    const key = String(stream.sourceProviderId || "").trim() || "__other__";
    if (!bySource.has(key)) {
      bySource.set(key, []);
      order.push(key);
    }
    bySource.get(key).push(stream);
  });
  return order.map((key) => ({
    label: key === "__other__" ? "" : key,
    streams: bySource.get(key)
  }));
}

function buildPhoneGroups(screen, filtered) {
  const order = [];
  const byAddon = new Map();
  filtered.forEach((stream) => {
    const addonName =
      String(stream.addonName || "").trim() || phoneT("common.unknown", {}, "Unknown");
    if (!byAddon.has(addonName)) {
      byAddon.set(addonName, []);
      order.push(addonName);
    }
    byAddon.get(addonName).push(stream);
  });
  const groups = order.map((addonName) => {
    const streams = byAddon.get(addonName);
    const chip = screen.sourceChips.find((entry) => entry.name === addonName);
    return {
      addonName,
      logo: chip?.logo || streams[0]?.addonLogo || "",
      streams,
      subgroups: buildPhoneSubgroups(streams),
      pending: false
    };
  });
  const includedNames = new Set(order);
  screen.sourceChips.forEach((chip) => {
    if (chip.status === "loading" && !includedNames.has(chip.name)) {
      groups.push({
        addonName: chip.name,
        logo: chip.logo || "",
        streams: [],
        subgroups: [],
        pending: true
      });
    }
  });
  return groups;
}

function PhoneAddonAvatar({ screen, name, logoHint }) {
  const logo = normalizeAddonLogoUrl(logoHint) || resolveAddonLogo(name, screen.addonLogoLookup);
  const cached = logo ? getCachedAddonLogoDisplayUrl(logo) : "";
  if (logo && !cached && !hasFailedAddonLogo(logo)) {
    requestAddonLogo(logo, () => screen.requestRender({ delayMs: 160 }));
  }
  return cached ? (
    <img src={cached} alt={name} loading="lazy" decoding="async" referrerpolicy="no-referrer" />
  ) : (
    <span>{getAddonBadgeLabel(name)}</span>
  );
}

function PhoneStreamRow({
  screen,
  stream,
  badgeSettings,
  streamBadgesEnabled,
  selectedStreamId,
  onPlay
}) {
  const headline = getStreamHeadline(stream);
  const quality = getStreamQuality(stream);
  const badges = renderStreamBadges(stream, streamBadgesEnabled, badgeSettings);
  const badgePlacement = resolveStreamBadgePlacement(badgeSettings);
  const topBadges = badgePlacement === "TOP" ? badges : "";
  const bottomBadges = badgePlacement === "BOTTOM" ? badges : "";
  const descriptionLines = getStreamDescriptionLines(stream);
  const isSelected = Boolean(selectedStreamId) && String(stream.id || "") === selectedStreamId;
  const showAddonLogo = badgeSettings?.showAddonLogo === true;

  return (
    <button
      type="button"
      class={`phone-stream-row focusable${isSelected ? " selected" : ""}`}
      data-action="playStream"
      data-stream-id={stream.id}
      onClick={() => onPlay(stream.id)}
    >
      <div class="phone-stream-row-main">
        <div class="phone-stream-row-heading">{headline}</div>
        {topBadges ? <Html html={topBadges} /> : null}
        {!badges ? <div class="phone-stream-row-quality">{quality}</div> : null}
        {descriptionLines.map((line, index) => (
          <div key={index} class={`phone-stream-row-line${index > 0 ? " secondary" : ""}`}>
            {line}
          </div>
        ))}
        {bottomBadges ? <Html html={bottomBadges} /> : null}
      </div>
      {showAddonLogo ? (
        <div class="phone-stream-row-side">
          <div class="phone-stream-row-badge">
            <PhoneAddonAvatar
              screen={screen}
              name={stream.addonName || "Addon"}
              logoHint={stream.addonLogo}
            />
          </div>
          <div class="phone-stream-row-addon-name">{stream.addonName || "Addon"}</div>
        </div>
      ) : null}
    </button>
  );
}

function PhoneGroup({
  screen,
  group,
  badgeSettings,
  streamBadgesEnabled,
  selectedStreamId,
  onPlay
}) {
  return (
    <section class="phone-stream-group">
      <div class="phone-stream-group-header">
        <div class="phone-stream-group-avatar">
          <PhoneAddonAvatar screen={screen} name={group.addonName} logoHint={group.logo} />
        </div>
        <div class="phone-stream-group-name">{group.addonName}</div>
        {group.pending ? (
          <>
            <Html html={renderLoadingIndicator({ className: "phone-stream-group-spinner-icon" })} />
            <span class="phone-stream-group-status">
              {phoneT("stream_fetching", {}, "Fetching…")}
            </span>
          </>
        ) : null}
      </div>
      {group.subgroups.map((subgroup, index) => (
        <div key={subgroup.label || index}>
          {subgroup.label ? <div class="phone-stream-subgroup-header">{subgroup.label}</div> : null}
          {subgroup.streams.map((stream) => (
            <PhoneStreamRow
              key={stream.id}
              screen={screen}
              stream={stream}
              badgeSettings={badgeSettings}
              streamBadgesEnabled={streamBadgesEnabled}
              selectedStreamId={selectedStreamId}
              onPlay={onPlay}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function PhoneFullListSpinner() {
  return (
    <div class="phone-stream-full-spinner">
      <Html html={renderLoadingIndicator({ className: "phone-stream-full-spinner-icon" })} />
      <span>{phoneT("stream_loading_sources", {}, "Finding sources…")}</span>
    </div>
  );
}

function PhoneFooterSpinner() {
  return (
    <div class="phone-stream-footer-spinner">
      <Html html={renderLoadingIndicator({ className: "phone-stream-footer-spinner-icon" })} />
      <span>{phoneT("stream_loading_more_sources", {}, "Still looking for more sources…")}</span>
    </div>
  );
}

function PhoneEmptyState({ title, message }) {
  return (
    <div class="phone-stream-empty-state">
      <div class="phone-stream-empty-title">{title}</div>
      <div class="phone-stream-empty-message">{message}</div>
    </div>
  );
}

function PhoneBody({
  screen,
  filtered,
  badgeSettings,
  streamBadgesEnabled,
  selectedStreamId,
  onPlay
}) {
  const hasAnyStreams = screen.streams.length > 0;
  const hasPendingForFilter = screen.hasPendingSourceLoads();

  if (screen.error) {
    return (
      <PhoneEmptyState
        title={phoneT("stream_fetch_failed_title", {}, "Couldn't load streams")}
        message={String(screen.error)}
      />
    );
  }
  if (screen.loading && !hasAnyStreams) {
    return <PhoneFullListSpinner />;
  }
  if (!filtered.length) {
    if (!hasAnyStreams && !screen.loading) {
      const installedAddons = addonRepository.getCachedInstalledAddons() || [];
      if (!installedAddons.length) {
        return (
          <PhoneEmptyState
            title={phoneT("stream_no_addons_title", {}, "No addons installed")}
            message={phoneT(
              "stream_no_addons_message",
              {},
              "Install a content addon in Settings to see sources here."
            )}
          />
        );
      }
      if (!screen.sourceChips.length) {
        return (
          <PhoneEmptyState
            title={phoneT("stream_no_compatible_title", {}, "No compatible addons")}
            message={phoneT(
              "stream_no_compatible_message",
              {},
              "None of your installed addons support this title."
            )}
          />
        );
      }
    }
    if (hasPendingForFilter) {
      return <PhoneFullListSpinner />;
    }
    return (
      <PhoneEmptyState
        title={phoneT("stream_no_streams_title", {}, "No sources found")}
        message={phoneT(
          "stream_no_streams_message",
          {},
          "Try a different filter, or check back later."
        )}
      />
    );
  }

  const groups = buildPhoneGroups(screen, filtered);
  return (
    <>
      {groups.map((group) => (
        <PhoneGroup
          key={group.addonName}
          screen={screen}
          group={group}
          badgeSettings={badgeSettings}
          streamBadgesEnabled={streamBadgesEnabled}
          selectedStreamId={selectedStreamId}
          onPlay={onPlay}
        />
      ))}
      {hasPendingForFilter ? <PhoneFooterSpinner /> : null}
    </>
  );
}

async function copyPhoneStreamLink(screen, stream) {
  const url = (await screen.resolveDirectStreamUrl(stream)) || buildMagnetFallback(stream) || "";
  if (!url) {
    screen.showStreamToast(
      phoneT("stream_link_unavailable", {}, "No link available for this stream")
    );
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    screen.showStreamToast(phoneT("stream_link_copied", {}, "Link copied"));
  } catch (_) {
    screen.showStreamToast(phoneT("stream_link_copy_failed", {}, "Could not copy link"));
  }
}

async function openPhoneStreamExternally(screen, stream) {
  const opened = await screen.tryOpenInExternalPlayer(stream);
  if (!opened) {
    screen.showStreamToast(
      phoneT("stream_no_external_player", {}, "No external player configured — set one in Settings")
    );
  }
}

async function downloadPhoneStream(screen, stream) {
  const url = await screen.resolveDirectStreamUrl(stream);
  if (!url) {
    screen.showStreamToast(
      phoneT("stream_download_unavailable", {}, "This stream can't be downloaded")
    );
    return;
  }
  const filename = `${getStreamHeadline(stream) || "Nuvio"}`.trim();
  screen.launchExternalPlayerHref(
    url,
    filename,
    phoneT("stream_download_started", {}, "Download started")
  );
}

function openPhoneStreamActionSheet(screen, stream) {
  openBottomSheet({
    items: [
      {
        icon: iconCopyHtml(),
        title: phoneT("stream_action_copy_link", {}, "Copy Link"),
        onSelect: () => void copyPhoneStreamLink(screen, stream)
      },
      {
        icon: iconExternalHtml(),
        title: phoneT("stream_action_open_external", {}, "Open in External Player"),
        onSelect: () => void openPhoneStreamExternally(screen, stream)
      },
      {
        icon: iconInternalHtml(),
        title: phoneT("stream_action_open_internal", {}, "Open in Internal Player"),
        onSelect: () => void screen.playStreamInternal(stream)
      },
      {
        icon: iconDownloadHtml(),
        title: phoneT("stream_action_download", {}, "Download as File"),
        onSelect: () => void downloadPhoneStream(screen, stream)
      }
    ]
  });
}

function StreamScreenPhone({ screen }) {
  const containerRef = useRef(null);

  const backdrop = screen.getBackdropUrl();
  const backdropStyle = backdrop
    ? { backgroundImage: `url('${String(backdrop).replace(/'/g, "%27")}')` }
    : undefined;

  const filtered = screen.autoResumeUiActive ? [] : screen.getFilteredStreams();
  const badgeSettings = StreamBadgeSettingsStore.snapshot();
  const streamBadgesEnabled = DebridSettingsStore.get().streamBadgesEnabled !== false;
  const selectedStreamId = String(screen.params?.preferredStreamId || "").trim();

  const handlePlay = (streamId) => {
    void screen.playStream(streamId);
  };
  const handleSelectFilter = (addon) => {
    screen.setAddonFilter(addon);
  };
  const handleRefresh = () => {
    void screen.loadStreams();
  };
  const handleBack = () => {
    if (!screen.navigateBackFromStream()) {
      Router.back();
    }
  };

  useEffect(() => {
    closeActiveBottomSheet();
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const rows = Array.from(container.querySelectorAll(".phone-stream-row"));
    const currentFiltered = screen.getFilteredStreams();
    const detachers = rows.map((row) =>
      attachLongPress(row, {
        onLongPress: () => {
          const streamId = String(row.dataset.streamId || "");
          const stream = currentFiltered.find((entry) => String(entry.id) === streamId);
          if (stream) {
            openPhoneStreamActionSheet(screen, stream);
          }
        }
      })
    );
    return () => detachers.forEach((detach) => detach());
  });

  useEffect(() => {
    return () => closeActiveBottomSheet();
  }, []);

  return (
    <div class="phone-stream-shell" data-phone-stream-shell ref={containerRef}>
      <div class="phone-stream-backdrop" style={backdropStyle} />
      <div class="phone-stream-backdrop-dim" />
      {!screen.autoResumeUiActive ? (
        <div class="phone-stream-scroll" data-phone-stream-scroll>
          <header class="phone-stream-topbar">
            <button
              type="button"
              class="phone-stream-back-btn focusable"
              data-action="back"
              aria-label={phoneT("common.back", {}, "Back")}
              onClick={handleBack}
            >
              <IconBack />
            </button>
          </header>
          <PhoneHero screen={screen} />
          <PhoneResumePill screen={screen} filtered={filtered} onPlay={handlePlay} />
          <PhoneFilterRow
            screen={screen}
            onSelectFilter={handleSelectFilter}
            onRefresh={handleRefresh}
          />
          <div class="phone-stream-list" data-phone-stream-list>
            <PhoneBody
              screen={screen}
              filtered={filtered}
              badgeSettings={badgeSettings}
              streamBadgesEnabled={streamBadgesEnabled}
              selectedStreamId={selectedStreamId}
              onPlay={handlePlay}
            />
          </div>
        </div>
      ) : null}
      {screen.renderContinueWatchingResumeOverlay() ? (
        <Html tag="div" html={screen.renderContinueWatchingResumeOverlay()} />
      ) : null}
      {screen.renderAutoPlayOverlay() ? (
        <Html tag="div" html={screen.renderAutoPlayOverlay()} />
      ) : null}
    </div>
  );
}
