import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { attachLongPress } from "../../navigation/gestureEngine.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../components/bottomSheet.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { isWatchProgressInProgress } from "../../../domain/model/watchProgress.js";
import { buildMagnetFallback } from "../../../core/player/externalPlayerLinks.js";
import { DebridSettingsStore } from "../../../data/local/debridSettingsStore.js";
import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";
import {
  getCachedAddonLogoDisplayUrl,
  hasFailedAddonLogo,
  normalizeAddonLogoUrl,
  requestAddonLogo,
  resolveAddonLogo
} from "../../../core/media/addonLogoCache.js";
import {
  getAddonBadgeLabel,
  getStreamDescriptionLines,
  getStreamHeadline,
  getStreamQuality,
  renderStreamBadges,
  resolveStreamBadgePlacement
} from "./streamScreen.js";

// Phone render path for js/ui/screens/stream/streamScreen.js (ticket 04-01, see
// .scratch/mobile-parity/spec.md). This module owns everything about the phone layout's
// markup/interaction; streamScreen.js's own `render()` only has a guard clause that dispatches
// here when `Platform.isPhoneViewport()` is true, and its `mount()`/`cleanup()` add a
// `Platform.watchPhoneViewport()` subscription so a live resize across the breakpoint
// re-renders. Every function below takes the `StreamScreen` singleton itself (`screen`, i.e.
// its own `this`) so it can call the screen's already-existing data/mutation methods directly
// rather than duplicating any of that logic here:
//   - `screen.playStream(streamId)` — the existing tap-to-play flow, unchanged; already
//     performs the external-player handoff (`tryOpenInExternalPlayer`) before falling through
//     to internal playback.
//   - `screen.playStreamInternal(stream)` — extracted (this same ticket) from `playStream`'s
//     tail so the long-press menu's "Open in internal player" action can skip the
//     external-player handoff explicitly.
//   - `screen.tryOpenInExternalPlayer(stream)` / `screen.launchExternalPlayerHref(href,
//     download, toastMessage)` — reused as-is for the long-press menu's "Open in external
//     player" action.
//   - `screen.resolveDirectStreamUrl(stream)` — extracted (this same ticket) from
//     `tryOpenInExternalPlayer`'s body so the long-press menu's "Copy Link"/"Download" actions
//     share the exact same header-check -> stream.url/externalUrl -> DirectDebridResolver
//     fallback chain `tryOpenInExternalPlayer` uses, instead of a second copy of that logic.
//   - `screen.setAddonFilter(name)` / `screen.loadStreams()` / `screen.getFilteredStreams()` /
//     `screen.getOrderedFilterNames()` / `screen.hasPendingSourceLoads()` /
//     `screen.showStreamToast(message)` / `screen.navigateBackFromStream()` — existing
//     read/mutation methods already used by the TV chip row and list rendering.
// `screen.streams`/`screen.sourceChips`/`screen.addonFilter`/`screen.addonLogoLookup`/
// `screen.loading`/`screen.error`/`screen.params`/`screen.autoResumeUiActive`/
// `screen.autoPlayCountdown` are populated by the screen's existing `mount()`/`loadStreams()`
// data flow, independent of layoutMode — this module only reads them, it does not fetch
// anything itself. `screen.renderContinueWatchingResumeOverlay()` / `screen.renderAutoPlayOverlay()`
// are the existing TV overlay renderers, reused verbatim for the (out-of-scope-for-this-ticket)
// auto-resume/auto-play countdown states rather than reimplementing them.

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

function iconRefresh() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0 0 14.5 3M19.5 9A8 8 0 0 0 5 6"/></svg>`;
}

function iconCopy() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>`;
}

function iconExternal() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M10 14 20 4M19 13v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>`;
}

function iconInternal() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M10 8.5v6l5-3z"/></svg>`;
}

function iconDownload() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>`;
}

/** mm:ss / h:mm:ss clock label for the "Resume from…" pill, local to this file the same way
 * every other formatting helper in this codebase is (see the file header comment). */
function formatResumeClock(positionMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(positionMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// ---------------------------------------------------------------------------------------
// Hero + resume pill
// ---------------------------------------------------------------------------------------

function renderHero(screen) {
  const { isSeries, title, subtitle, episodeLabel, detailLine } = screen.getHeaderMeta();
  const backdrop = screen.getBackdropUrl();
  const logo = screen.params?.logo || "";

  if (isSeries) {
    return `
      <section class="phone-stream-hero">
        ${
          backdrop
            ? `<img class="phone-stream-hero-thumb" src="${escapeHtml(backdrop)}" alt="" loading="eager" />`
            : `<div class="phone-stream-hero-thumb phone-stream-hero-thumb-empty" aria-hidden="true"></div>`
        }
        ${episodeLabel ? `<div class="phone-stream-hero-badge">${escapeHtml(episodeLabel)}</div>` : ""}
        <h1 class="phone-stream-hero-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="phone-stream-hero-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </section>
    `;
  }

  return `
    <section class="phone-stream-hero phone-stream-hero-movie">
      ${
        logo
          ? `<img class="phone-stream-hero-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(title)}" />`
          : `<h1 class="phone-stream-hero-title centered">${escapeHtml(title)}</h1>`
      }
      ${detailLine ? `<div class="phone-stream-hero-meta">${escapeHtml(detailLine)}</div>` : ""}
    </section>
  `;
}

/** The route-supplied resume position (from Detail/Continue Watching, `screen.params`) — the
 * same three fields `playStreamInternal` already reads via `isWatchProgressInProgress` to
 * decide whether to resume mid-playback. Reusing that exact pure predicate here (rather than
 * re-deriving "has resume" some other way) keeps the pill's visibility and the actual resume
 * behaviour on tap in sync. */
function renderResumePill(screen, filtered) {
  if (screen.params?.startFromBeginning) {
    return "";
  }
  const hasResume = isWatchProgressInProgress({
    positionMs: Number(screen.params?.resumePositionMs || 0) || 0,
    progressPercent: screen.params?.resumeProgressPercent,
    durationMs: Number(screen.params?.resumeDurationMs || 0) || 0
  });
  if (!hasResume || !filtered.length) {
    return "";
  }
  const preferredId = String(screen.params?.preferredStreamId || "").trim();
  const target =
    (preferredId && filtered.find((stream) => stream.id === preferredId)) || filtered[0];
  if (!target?.id) {
    return "";
  }
  const positionLabel = formatResumeClock(Number(screen.params?.resumePositionMs || 0));
  return `
    <button type="button" class="phone-stream-resume-pill" data-action="resumePlay" data-stream-id="${escapeHtml(target.id)}">
      ${iconPlay()}
      <span>${escapeHtml(t("stream_resume_from", [positionLabel], `Resume from ${positionLabel}`))}</span>
    </button>
  `;
}

// ---------------------------------------------------------------------------------------
// Filter chip row
// ---------------------------------------------------------------------------------------

function renderChip({ addon, label, selected, status }) {
  const chipStatus = String(status || "success");
  const classes = [
    "phone-stream-chip",
    selected ? "selected" : "",
    chipStatus !== "success" ? chipStatus : ""
  ]
    .filter(Boolean)
    .join(" ");
  const spinner =
    chipStatus === "loading"
      ? renderLoadingIndicator({ className: "phone-stream-chip-spinner" })
      : "";
  return `
    <button type="button" class="${classes}" data-action="setFilter" data-addon="${escapeHtml(addon)}">
      ${spinner}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderFilterRow(screen) {
  const ordered = screen.getOrderedFilterNames();
  const refreshChip = `
    <button type="button" class="phone-stream-chip phone-stream-chip-refresh" data-action="refreshStreams" aria-label="${escapeHtml(t("common.refresh", {}, "Refresh"))}">
      ${iconRefresh()}
    </button>
  `;
  const allChip = renderChip({
    addon: "all",
    label: t("common.all", {}, "All"),
    selected: screen.addonFilter === "all",
    status: "success"
  });
  const addonChips = ordered
    .map((name) => {
      const chip = screen.sourceChips.find((entry) => entry.name === name) || {
        name,
        status: "success"
      };
      return renderChip({
        addon: name,
        label: name,
        selected: screen.addonFilter === name,
        status: chip.status
      });
    })
    .join("");
  return `
    <div class="phone-stream-chip-row-wrap">
      <div class="phone-stream-chip-row" data-phone-stream-chip-row>${refreshChip}${allChip}${addonChips}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Grouped result list — by addon, then by source (sourceProviderId) when an addon reports
// more than one distinct source, matching the ticket's "grouped by addon, then by source-name
// subheader when >1 source per addon" spec. `sourceProviderId` is the same field
// `streamScreen.js`'s own flattening already attaches to every stream for resume/binge-group
// identity purposes — reused here as the only reliable "which source within this addon"
// signal actually present on a stream, rather than inventing a new one.
// ---------------------------------------------------------------------------------------

function buildSubgroups(streams) {
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

function buildGroups(screen, filtered) {
  const order = [];
  const byAddon = new Map();
  filtered.forEach((stream) => {
    const addonName = String(stream.addonName || "").trim() || t("common.unknown", {}, "Unknown");
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
      subgroups: buildSubgroups(streams),
      pending: false
    };
  });
  // Addons still loading with nothing to show yet get their own placeholder group so the
  // per-addon-group "fetching…" spinner has somewhere to render.
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

function renderAddonAvatar(screen, name, logoHint) {
  const logo = normalizeAddonLogoUrl(logoHint) || resolveAddonLogo(name, screen.addonLogoLookup);
  const cached = logo ? getCachedAddonLogoDisplayUrl(logo) : "";
  if (logo && !cached && !hasFailedAddonLogo(logo)) {
    requestAddonLogo(logo, () => screen.requestRender({ delayMs: 160 }));
  }
  return cached
    ? `<img src="${escapeHtml(cached)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
    : `<span>${escapeHtml(getAddonBadgeLabel(name))}</span>`;
}

function renderStreamRow(screen, stream, badgeSettings, streamBadgesEnabled, selectedStreamId) {
  const headline = getStreamHeadline(stream);
  const quality = getStreamQuality(stream);
  const badges = renderStreamBadges(stream, streamBadgesEnabled, badgeSettings);
  const badgePlacement = resolveStreamBadgePlacement(badgeSettings);
  const topBadges = badgePlacement === "TOP" ? badges : "";
  const bottomBadges = badgePlacement === "BOTTOM" ? badges : "";
  const descriptionLines = getStreamDescriptionLines(stream);
  const isSelected = Boolean(selectedStreamId) && String(stream.id || "") === selectedStreamId;
  const showAddonLogo = badgeSettings?.showAddonLogo === true;

  const side = showAddonLogo
    ? `
        <div class="phone-stream-row-side">
          <div class="phone-stream-row-badge">${renderAddonAvatar(screen, stream.addonName || "Addon", stream.addonLogo)}</div>
          <div class="phone-stream-row-addon-name">${escapeHtml(stream.addonName || "Addon")}</div>
        </div>`
    : "";

  return `
    <button type="button"
            class="phone-stream-row focusable${isSelected ? " selected" : ""}"
            data-action="playStream"
            data-stream-id="${escapeHtml(stream.id)}">
      <div class="phone-stream-row-main">
        <div class="phone-stream-row-heading">${escapeHtml(headline)}</div>
        ${topBadges || ""}
        ${!badges ? `<div class="phone-stream-row-quality">${escapeHtml(quality)}</div>` : ""}
        ${descriptionLines
          .map(
            (line, index) =>
              `<div class="phone-stream-row-line${index > 0 ? " secondary" : ""}">${escapeHtml(line)}</div>`
          )
          .join("")}
        ${bottomBadges || ""}
      </div>
      ${side}
    </button>
  `;
}

function renderGroup(screen, group, badgeSettings, streamBadgesEnabled, selectedStreamId) {
  const header = `
    <div class="phone-stream-group-header">
      <div class="phone-stream-group-avatar">${renderAddonAvatar(screen, group.addonName, group.logo)}</div>
      <div class="phone-stream-group-name">${escapeHtml(group.addonName)}</div>
      ${
        group.pending
          ? `${renderLoadingIndicator({ className: "phone-stream-group-spinner-icon" })}<span class="phone-stream-group-status">${escapeHtml(t("stream_fetching", {}, "Fetching…"))}</span>`
          : ""
      }
    </div>
  `;
  const rowsMarkup = group.subgroups
    .map(
      (subgroup) => `
        ${subgroup.label ? `<div class="phone-stream-subgroup-header">${escapeHtml(subgroup.label)}</div>` : ""}
        ${subgroup.streams
          .map((stream) =>
            renderStreamRow(screen, stream, badgeSettings, streamBadgesEnabled, selectedStreamId)
          )
          .join("")}
      `
    )
    .join("");
  return `<section class="phone-stream-group">${header}${rowsMarkup}</section>`;
}

// ---------------------------------------------------------------------------------------
// Loading / empty states
// ---------------------------------------------------------------------------------------

function renderFullListSpinner() {
  return `
    <div class="phone-stream-full-spinner">
      ${renderLoadingIndicator({ className: "phone-stream-full-spinner-icon" })}
      <span>${escapeHtml(t("stream_loading_sources", {}, "Finding sources…"))}</span>
    </div>
  `;
}

function renderFooterSpinner() {
  return `
    <div class="phone-stream-footer-spinner">
      ${renderLoadingIndicator({ className: "phone-stream-footer-spinner-icon" })}
      <span>${escapeHtml(t("stream_loading_more_sources", {}, "Still looking for more sources…"))}</span>
    </div>
  `;
}

function renderEmptyState(title, message) {
  return `
    <div class="phone-stream-empty-state">
      <div class="phone-stream-empty-title">${escapeHtml(title)}</div>
      <div class="phone-stream-empty-message">${escapeHtml(message)}</div>
    </div>
  `;
}

function renderBody(screen, filtered, badgeSettings, streamBadgesEnabled, selectedStreamId) {
  const hasAnyStreams = screen.streams.length > 0;
  const hasPendingForFilter = screen.hasPendingSourceLoads();

  if (screen.error) {
    return renderEmptyState(
      t("stream_fetch_failed_title", {}, "Couldn't load streams"),
      String(screen.error)
    );
  }
  if (screen.loading && !hasAnyStreams) {
    return renderFullListSpinner();
  }
  if (!filtered.length) {
    if (!hasAnyStreams && !screen.loading) {
      const installedAddons = addonRepository.getCachedInstalledAddons() || [];
      if (!installedAddons.length) {
        return renderEmptyState(
          t("stream_no_addons_title", {}, "No addons installed"),
          t(
            "stream_no_addons_message",
            {},
            "Install a content addon in Settings to see sources here."
          )
        );
      }
      if (!screen.sourceChips.length) {
        return renderEmptyState(
          t("stream_no_compatible_title", {}, "No compatible addons"),
          t("stream_no_compatible_message", {}, "None of your installed addons support this title.")
        );
      }
    }
    if (hasPendingForFilter) {
      return renderFullListSpinner();
    }
    return renderEmptyState(
      t("stream_no_streams_title", {}, "No sources found"),
      t("stream_no_streams_message", {}, "Try a different filter, or check back later.")
    );
  }

  const groups = buildGroups(screen, filtered);
  const groupsMarkup = groups
    .map((group) =>
      renderGroup(screen, group, badgeSettings, streamBadgesEnabled, selectedStreamId)
    )
    .join("");
  const footerSpinner = hasPendingForFilter ? renderFooterSpinner() : "";
  return `${groupsMarkup}${footerSpinner}`;
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone streams-picker screen markup. Reads `screen.streams`/
 * `screen.sourceChips`/`screen.addonFilter`/`screen.params`/`screen.loading`/`screen.error`
 * directly — all populated by `streamScreen.js`'s existing `mount()`/`loadStreams()` data
 * flow. Mirrors the TV shell's own `autoResumeUiActive` short-circuit (reusing the same two
 * TV overlay renderers verbatim) so the "resuming a remembered source" and auto-play-countdown
 * states are identical to TV rather than reimplemented here. */
export function renderStreamScreenPhone(screen) {
  const backdrop = screen.getBackdropUrl();
  const backdropStyle = backdrop
    ? ` style="background-image:url('${escapeHtml(backdrop).replace(/'/g, "%27")}')"`
    : "";

  const routeContent = screen.autoResumeUiActive
    ? ""
    : (() => {
        const filtered = screen.getFilteredStreams();
        const badgeSettings = StreamBadgeSettingsStore.snapshot();
        const streamBadgesEnabled = DebridSettingsStore.get().streamBadgesEnabled !== false;
        return `
          <div class="phone-stream-scroll" data-phone-stream-scroll>
            <header class="phone-stream-topbar">
              <button type="button" class="phone-stream-back-btn" data-action="back" aria-label="${escapeHtml(t("common.back", {}, "Back"))}">
                ${iconBack()}
              </button>
            </header>
            ${renderHero(screen)}
            ${renderResumePill(screen, filtered)}
            ${renderFilterRow(screen)}
            <div class="phone-stream-list" data-phone-stream-list>
              ${renderBody(
                screen,
                filtered,
                badgeSettings,
                streamBadgesEnabled,
                String(screen.params?.preferredStreamId || "").trim()
              )}
            </div>
          </div>
        `;
      })();

  return `
    <div class="phone-stream-shell" data-phone-stream-shell>
      <div class="phone-stream-backdrop"${backdropStyle}></div>
      <div class="phone-stream-backdrop-dim"></div>
      ${routeContent}
      ${screen.renderContinueWatchingResumeOverlay()}
      ${screen.renderAutoPlayOverlay()}
    </div>
  `;
}

function bindRowLongPress(container, screen) {
  const rows = Array.from(container.querySelectorAll(".phone-stream-row"));
  const filtered = screen.getFilteredStreams();
  const detachers = rows.map((row) =>
    attachLongPress(row, {
      onLongPress: () => {
        const streamId = String(row.dataset.streamId || "");
        const stream = filtered.find((entry) => String(entry.id) === streamId);
        if (stream) {
          openStreamActionSheet(screen, stream);
        }
      }
    })
  );
  return () => detachers.forEach((detach) => detach());
}

async function copyStreamLink(screen, stream) {
  const url = (await screen.resolveDirectStreamUrl(stream)) || buildMagnetFallback(stream) || "";
  if (!url) {
    screen.showStreamToast(t("stream_link_unavailable", {}, "No link available for this stream"));
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    screen.showStreamToast(t("stream_link_copied", {}, "Link copied"));
  } catch (_) {
    screen.showStreamToast(t("stream_link_copy_failed", {}, "Could not copy link"));
  }
}

async function openStreamExternally(screen, stream) {
  const opened = await screen.tryOpenInExternalPlayer(stream);
  if (!opened) {
    screen.showStreamToast(
      t("stream_no_external_player", {}, "No external player configured — set one in Settings")
    );
  }
}

async function downloadStream(screen, stream) {
  const url = await screen.resolveDirectStreamUrl(stream);
  if (!url) {
    screen.showStreamToast(t("stream_download_unavailable", {}, "This stream can't be downloaded"));
    return;
  }
  const filename = `${getStreamHeadline(stream) || "Nuvio"}`.trim();
  screen.launchExternalPlayerHref(
    url,
    filename,
    t("stream_download_started", {}, "Download started")
  );
}

function openStreamActionSheet(screen, stream) {
  openBottomSheet({
    items: [
      {
        icon: iconCopy(),
        title: t("stream_action_copy_link", {}, "Copy Link"),
        onSelect: () => void copyStreamLink(screen, stream)
      },
      {
        icon: iconExternal(),
        title: t("stream_action_open_external", {}, "Open in External Player"),
        onSelect: () => void openStreamExternally(screen, stream)
      },
      {
        icon: iconInternal(),
        title: t("stream_action_open_internal", {}, "Open in Internal Player"),
        onSelect: () => void screen.playStreamInternal(stream)
      },
      {
        icon: iconDownload(),
        title: t("stream_action_download", {}, "Download as File"),
        onSelect: () => void downloadStream(screen, stream)
      }
    ]
  });
}

/** Wires the phone streams screen's interactivity after `renderStreamScreenPhone`'s markup has
 * been inserted into `container`. Returns a teardown function; also stores it on
 * `screen._phoneStreamTeardown` so `cleanupStreamScreenPhone(screen)` can call it without the
 * caller needing to keep the reference itself. */
export function mountStreamScreenPhone(screen, container) {
  cleanupStreamScreenPhone(screen);
  closeActiveBottomSheet();

  const detachRowLongPress = bindRowLongPress(container, screen);

  const teardown = () => {
    detachRowLongPress();
  };

  screen._phoneStreamTeardown = teardown;
  return teardown;
}

/** Handles a tap on any `[data-action]` target inside the phone streams screen — dispatched
 * from `streamScreen.js`'s own `onPointerActivate(target)`, which delegates here (instead of
 * its TV dispatch) whenever `Platform.isPhoneViewport()` is true. Returns whether the tap was
 * handled. Deliberately does not reuse the TV dispatch's own `onPointerFocus`/`getFocusLists`
 * calls — those walk TV-only DOM selectors (`.stream-route-chip`, `[data-stream-row]`) that
 * don't exist in this module's markup, so calling them here would be dead code, not reuse. */
export function handlePhoneStreamPointerActivate(screen, target) {
  const actionTarget = target?.closest?.("[data-action]");
  const action = String(actionTarget?.dataset?.action || "");
  if (!action) {
    return false;
  }
  if (action === "back") {
    if (!screen.navigateBackFromStream()) {
      Router.back();
    }
    return true;
  }
  if (action === "refreshStreams") {
    void screen.loadStreams();
    return true;
  }
  if (action === "setFilter") {
    screen.setAddonFilter(String(actionTarget.dataset.addon || "all"));
    return true;
  }
  if (action === "playStream" || action === "resumePlay") {
    void screen.playStream(actionTarget.dataset.streamId);
    return true;
  }
  return false;
}

/** Tears down whatever `mountStreamScreenPhone` last wired up, if anything, and closes any
 * open long-press action sheet. Safe to call when nothing is mounted (e.g. the screen has
 * never rendered in phone mode). */
export function cleanupStreamScreenPhone(screen) {
  closeActiveBottomSheet();
  screen._phoneStreamTeardown?.();
  screen._phoneStreamTeardown = null;
}
