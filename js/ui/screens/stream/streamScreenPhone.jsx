import { useEffect, useRef } from "preact/hooks";
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

// Preact conversion of the phone render path for js/ui/screens/stream/streamScreen.js (ticket
// 04-01, see .scratch/mobile-parity/spec.md). This module owns everything about the phone
// layout's markup/interaction; streamScreen.js's own `render()` only has a guard clause that
// dispatches here (via `mountPreact`) when `Platform.isPhoneViewport()` is true, and its
// `mount()`/`cleanup()` add a `Platform.watchPhoneViewport()` subscription so a live resize
// across the breakpoint re-renders. Every component below reads off the `StreamScreen` singleton
// itself (`screen`, i.e. its own `this`) so it can call the screen's already-existing
// data/mutation methods directly rather than duplicating any of that logic here:
//   - `screen.playStream(streamId)` — the existing tap-to-play flow, unchanged; already
//     performs the external-player handoff (`tryOpenInExternalPlayer`) before falling through
//     to internal playback.
//   - `screen.playStreamInternal(stream)` — extracted from `playStream`'s tail so the long-press
//     menu's "Open in internal player" action can skip the external-player handoff explicitly.
//   - `screen.tryOpenInExternalPlayer(stream)` / `screen.launchExternalPlayerHref(href,
//     download, toastMessage)` — reused as-is for the long-press menu's "Open in external
//     player" action.
//   - `screen.resolveDirectStreamUrl(stream)` — the shared header-check -> stream.url/
//     externalUrl -> DirectDebridResolver fallback chain, reused for the long-press menu's
//     "Copy Link"/"Download" actions.
//   - `screen.setAddonFilter(name)` / `screen.loadStreams()` / `screen.getFilteredStreams()` /
//     `screen.getOrderedFilterNames()` / `screen.hasPendingSourceLoads()` /
//     `screen.showStreamToast(message)` / `screen.navigateBackFromStream()` — existing
//     read/mutation methods already used by the TV chip row and list rendering.
// `screen.streams`/`screen.sourceChips`/`screen.addonFilter`/`screen.addonLogoLookup`/
// `screen.loading`/`screen.error`/`screen.params`/`screen.autoResumeUiActive`/
// `screen.autoPlayCountdown` are populated by the screen's existing `mount()`/`loadStreams()`
// data flow, independent of layoutMode — this module only reads them, it does not fetch
// anything itself. `screen.renderContinueWatchingResumeOverlay()` / `screen.renderAutoPlayOverlay()`
// are the existing TV overlay renderers (return raw HTML strings), reused verbatim for the
// (out-of-scope-for-this-ticket) auto-resume/auto-play countdown states via
// `dangerouslySetInnerHTML` rather than reimplementing them.

function t(key, params = {}, fallback = key) {
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

function Hero({ screen }) {
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

/** The route-supplied resume position (from Detail/Continue Watching, `screen.params`) — the
 * same three fields `playStreamInternal` already reads via `isWatchProgressInProgress` to
 * decide whether to resume mid-playback. Reusing that exact pure predicate here (rather than
 * re-deriving "has resume" some other way) keeps the pill's visibility and the actual resume
 * behaviour on tap in sync. */
function ResumePill({ screen, filtered, onPlay }) {
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
      <span>{t("stream_resume_from", [positionLabel], `Resume from ${positionLabel}`)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------
// Filter chip row
// ---------------------------------------------------------------------------------------

function Chip({ addon, label, selected, status, onSelect }) {
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

function FilterRow({ screen, onSelectFilter, onRefresh }) {
  const ordered = screen.getOrderedFilterNames();
  return (
    <div class="phone-stream-chip-row-wrap">
      <div class="phone-stream-chip-row" data-phone-stream-chip-row>
        <button
          type="button"
          class="phone-stream-chip phone-stream-chip-refresh focusable"
          data-action="refreshStreams"
          aria-label={t("common.refresh", {}, "Refresh")}
          onClick={onRefresh}
        >
          <IconRefresh />
        </button>
        <Chip
          addon="all"
          label={t("common.all", {}, "All")}
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
            <Chip
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

function AddonAvatar({ screen, name, logoHint }) {
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

function StreamRow({
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
            <AddonAvatar
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

function Group({ screen, group, badgeSettings, streamBadgesEnabled, selectedStreamId, onPlay }) {
  return (
    <section class="phone-stream-group">
      <div class="phone-stream-group-header">
        <div class="phone-stream-group-avatar">
          <AddonAvatar screen={screen} name={group.addonName} logoHint={group.logo} />
        </div>
        <div class="phone-stream-group-name">{group.addonName}</div>
        {group.pending ? (
          <>
            <Html html={renderLoadingIndicator({ className: "phone-stream-group-spinner-icon" })} />
            <span class="phone-stream-group-status">{t("stream_fetching", {}, "Fetching…")}</span>
          </>
        ) : null}
      </div>
      {group.subgroups.map((subgroup, index) => (
        <div key={subgroup.label || index}>
          {subgroup.label ? <div class="phone-stream-subgroup-header">{subgroup.label}</div> : null}
          {subgroup.streams.map((stream) => (
            <StreamRow
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

// ---------------------------------------------------------------------------------------
// Loading / empty states
// ---------------------------------------------------------------------------------------

function FullListSpinner() {
  return (
    <div class="phone-stream-full-spinner">
      <Html html={renderLoadingIndicator({ className: "phone-stream-full-spinner-icon" })} />
      <span>{t("stream_loading_sources", {}, "Finding sources…")}</span>
    </div>
  );
}

function FooterSpinner() {
  return (
    <div class="phone-stream-footer-spinner">
      <Html html={renderLoadingIndicator({ className: "phone-stream-footer-spinner-icon" })} />
      <span>{t("stream_loading_more_sources", {}, "Still looking for more sources…")}</span>
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div class="phone-stream-empty-state">
      <div class="phone-stream-empty-title">{title}</div>
      <div class="phone-stream-empty-message">{message}</div>
    </div>
  );
}

function Body({ screen, filtered, badgeSettings, streamBadgesEnabled, selectedStreamId, onPlay }) {
  const hasAnyStreams = screen.streams.length > 0;
  const hasPendingForFilter = screen.hasPendingSourceLoads();

  if (screen.error) {
    return (
      <EmptyState
        title={t("stream_fetch_failed_title", {}, "Couldn't load streams")}
        message={String(screen.error)}
      />
    );
  }
  if (screen.loading && !hasAnyStreams) {
    return <FullListSpinner />;
  }
  if (!filtered.length) {
    if (!hasAnyStreams && !screen.loading) {
      const installedAddons = addonRepository.getCachedInstalledAddons() || [];
      if (!installedAddons.length) {
        return (
          <EmptyState
            title={t("stream_no_addons_title", {}, "No addons installed")}
            message={t(
              "stream_no_addons_message",
              {},
              "Install a content addon in Settings to see sources here."
            )}
          />
        );
      }
      if (!screen.sourceChips.length) {
        return (
          <EmptyState
            title={t("stream_no_compatible_title", {}, "No compatible addons")}
            message={t(
              "stream_no_compatible_message",
              {},
              "None of your installed addons support this title."
            )}
          />
        );
      }
    }
    if (hasPendingForFilter) {
      return <FullListSpinner />;
    }
    return (
      <EmptyState
        title={t("stream_no_streams_title", {}, "No sources found")}
        message={t("stream_no_streams_message", {}, "Try a different filter, or check back later.")}
      />
    );
  }

  const groups = buildGroups(screen, filtered);
  return (
    <>
      {groups.map((group) => (
        <Group
          key={group.addonName}
          screen={screen}
          group={group}
          badgeSettings={badgeSettings}
          streamBadgesEnabled={streamBadgesEnabled}
          selectedStreamId={selectedStreamId}
          onPlay={onPlay}
        />
      ))}
      {hasPendingForFilter ? <FooterSpinner /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Long-press action sheet — unchanged behaviour, ported verbatim from the vanilla module.
// ---------------------------------------------------------------------------------------

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
        icon: iconCopyHtml(),
        title: t("stream_action_copy_link", {}, "Copy Link"),
        onSelect: () => void copyStreamLink(screen, stream)
      },
      {
        icon: iconExternalHtml(),
        title: t("stream_action_open_external", {}, "Open in External Player"),
        onSelect: () => void openStreamExternally(screen, stream)
      },
      {
        icon: iconInternalHtml(),
        title: t("stream_action_open_internal", {}, "Open in Internal Player"),
        onSelect: () => void screen.playStreamInternal(stream)
      },
      {
        icon: iconDownloadHtml(),
        title: t("stream_action_download", {}, "Download as File"),
        onSelect: () => void downloadStream(screen, stream)
      }
    ]
  });
}

// ---------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------

/** Renders the full phone streams-picker screen. Reads `screen.streams`/`screen.sourceChips`/
 * `screen.addonFilter`/`screen.params`/`screen.loading`/`screen.error` directly — all populated
 * by `streamScreen.js`'s existing `mount()`/`loadStreams()` data flow. Mirrors the TV shell's
 * own `autoResumeUiActive` short-circuit (reusing the same two TV overlay renderers verbatim via
 * `dangerouslySetInnerHTML`) so the "resuming a remembered source" and auto-play-countdown states
 * are identical to TV rather than reimplemented here.
 *
 * Long-press-to-open-action-sheet is imperative DOM behaviour (`attachLongPress` on the rendered
 * `.phone-stream-row` buttons) that doesn't map cleanly onto a single Preact event handler, so it
 * is (re)bound in an effect after every render — mirroring what the old `mountStreamScreenPhone`
 * did after each `innerHTML` assignment. */
export function StreamScreenPhone({ screen }) {
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
            openStreamActionSheet(screen, stream);
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
              aria-label={t("common.back", {}, "Back")}
              onClick={handleBack}
            >
              <IconBack />
            </button>
          </header>
          <Hero screen={screen} />
          <ResumePill screen={screen} filtered={filtered} onPlay={handlePlay} />
          <FilterRow
            screen={screen}
            onSelectFilter={handleSelectFilter}
            onRefresh={handleRefresh}
          />
          <div class="phone-stream-list" data-phone-stream-list>
            <Body
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
