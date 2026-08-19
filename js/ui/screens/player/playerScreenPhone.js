import { I18n } from "../../../i18n/index.js";
import { Router } from "../../navigation/router.js";
import { attachLongPress } from "../../navigation/gestureEngine.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import { openPickerRail, closeActivePickerRail } from "./pickerRail.js";

// Phone overlay chrome for js/ui/screens/player/playerScreen.js (ticket 04-03, mobile-parity
// epic — see .scratch/mobile-parity/spec.md and
// .scratch/mobile-parity/issues/04-03-player-overlay-chrome.md). This is the visual layer
// 04-02's gesture layer (playerGestures.js) drives and that phone users tap through.
//
// Design note on how this plugs into playerScreen.js: unlike the other phone screens in this
// epic (home/detail/search/library/...), playerScreen.js has no single `render()` a guard
// clause can dispatch out of — its TV markup (`renderPlayerUi()`) is rebuilt by dozens of
// already-existing state-changing call sites (`togglePause`, `seekPlaybackSeconds`,
// `openSubtitleDialog`, `updateUiTick`'s 1s ticker, ...) that this ticket must not touch. So
// instead of replacing the TV render tree, this module's markup is appended as an *additional*
// sibling layer inside `#playerUiRoot` (`#phonePlayerUi`), built/torn down by a single new
// `syncPhonePlayerChrome()` method on the screen (mirroring `syncPhoneGestureLayer()`'s own
// build/teardown shape from 04-02) that playerScreen.js calls from the same handful of
// lifecycle/render hook points already used to keep the TV UI in sync — see the comment above
// `syncPhonePlayerChrome()` in playerScreen.js for the exact call sites. TV markup, TV CSS, and
// TV `onKeyDown` are completely untouched; the two trees simply coexist in the DOM, and
// `css/phone.css`'s existing `max-width: 600px` breakpoint is what actually hides the TV
// controls/pause-overlay/skip-intro/next-episode-card chrome and shows this one instead — there
// is no JS-side "phone vs TV" branch inside any of the TV render methods themselves.
//
// Every function below takes the `PlayerScreen` singleton itself (`screen`, i.e. its own
// `this`) and only ever calls the screen's already-existing playback primitives/data getters
// (`togglePause`/`seekPlaybackSeconds`/`skipActiveInterval`/`playNextEpisode`/
// `cycleAspectMode`/`applyPlaybackSpeed`/`applyAudioTrack`/`applySubtitleEntry`/
// `getSubtitleLanguageRailItems`/`getAudioEntries`/`resolveNextEpisodeInfo`/
// `buildPauseOverlayMeta`/`consumeBackRequest`) rather than duplicating any of that logic here.
// Where a TV render method already emits `data-player-pointer-action="..."` +`.focusable`
// markup that `onPointerActivate`'s generic (non-phone-specific) delegation already handles
// unconditionally (skip-intro, next-episode card, still-watching prompt buttons — see
// `onPointerActivate`'s top-of-function checks in playerScreen.js), this module's phone markup
// reuses those exact same attributes so those taps are handled for free with zero changes to
// `onPointerActivate`. Every other phone-only control (header buttons, center transport
// buttons, bottom capsule bar, lock button) is bound with a direct `element.onclick` handler in
// `mountPhonePlayerChrome` instead — the same convention `phoneNavBar.js`/`phoneShelf.js` use —
// so none of it needs an `onPointerActivate` phone-dispatch branch either.

const SEEK_STEP_SECONDS = 10;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPhoneTime(secondsValue) {
  const total = Math.max(0, Math.floor(Number(secondsValue) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Display-text mapping only (no interval math) — mirrors playerScreen.js's own
// `buildSkipIntervalLabel`, which is a module-private function there and not exported.
function skipIntervalLabel(interval = {}) {
  const type = String(interval?.type || "")
    .trim()
    .toLowerCase();
  if (type === "recap") {
    return t("skip_recap", {}, "Skip Recap");
  }
  if (type === "outro" || type === "ed" || type === "mixed-ed") {
    return t("skip_outro", {}, "Skip Outro");
  }
  return t("skip_intro", {}, "Skip Intro");
}

const ICONS = {
  replay10: `<svg viewBox="0 0 24 24" width="26" height="26" focusable="false"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"></path><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor">10</text></svg>`,
  forward10: `<svg viewBox="0 0 24 24" width="26" height="26" focusable="false"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" fill="currentColor"></path><text x="12" y="15.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor">10</text></svg>`,
  play: `<svg viewBox="0 0 24 24" width="34" height="34" focusable="false"><path d="M8 5v14l11-7z" fill="currentColor"></path></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="34" height="34" focusable="false"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"></path></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="20" height="20" focusable="false"><path d="M12 17a2 2 0 002-2 2 2 0 00-4 0 2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-7-2a3 3 0 016 0v2H9V6zm7 14H6V10h12v10z" fill="currentColor"></path></svg>`,
  unlock: `<svg viewBox="0 0 24 24" width="28" height="28" focusable="false"><path d="M12 17a2 2 0 002-2 2 2 0 00-4 0 2 2 0 002 2zm6-9h-1V6a5 5 0 00-9.6-2h2.2A3 3 0 0115 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm0 12H6V10h12v10z" fill="currentColor"></path></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="18" height="18" focusable="false"><path d="M19.14 12.94a7.14 7.14 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.63-.94l-.36-2.54A.5.5 0 0014 2h-4a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.14.56-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.6 8.84a.5.5 0 00.12.64l2.03 1.58a7.14 7.14 0 000 1.88L2.72 14.5a.5.5 0 00-.12.64l1.92 3.32c.14.24.42.34.6.22l2.39-.96c.49.38 1.04.7 1.63.94l.36 2.54c.05.28.28.42.5.42h4c.24 0 .46-.14.5-.42l.36-2.54c.59-.24 1.14-.55 1.63-.94l2.39.96c.24.1.48 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.56zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" fill="currentColor"></path></svg>`,
  handoff: `<svg viewBox="0 0 24 24" width="18" height="18" focusable="false"><path d="M14 3v2h3.59L7.76 14.83l1.41 1.41L19 6.41V10h2V3zM19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2z" fill="currentColor"></path></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" focusable="false"><path d="M18.3 5.71L12 12.01l-6.3-6.3-1.41 1.41L10.59 13.4l-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z" fill="currentColor"></path></svg>`,
  aspect: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V5h14v14zM8 8h2v2H8zM14 14h2v2h-2z" fill="currentColor"></path></svg>`,
  speed: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M13 3a9 9 0 00-9 9H2l3.89 3.89.07.14L10 12H8a5 5 0 015-5c2.76 0 5 2.24 5 5s-2.24 5-5 5c-1.38 0-2.63-.56-3.54-1.46l-1.41 1.41A6.98 6.98 0 0013 19a7 7 0 000-14z" fill="currentColor"></path></svg>`,
  subtitles: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H4V6h16v12zM6 10h4v2H6zm6 0h6v2h-6zM6 13h8v2H6zm10 0h2v2h-2z" fill="currentColor"></path></svg>`,
  audio: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0014 7.97v8.05a4.48 4.48 0 002.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"></path></svg>`,
  sources: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" fill="currentColor"></path></svg>`,
  episodes: `<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path d="M4 4h16v2H4zm2 4h12v10H6zm2 2v6h8v-6z" fill="currentColor"></path></svg>`
};

// ---------------------------------------------------------------------------------------
// Data shaping helpers — read the screen's existing state/getters, never mutate anything.
// ---------------------------------------------------------------------------------------

function getSourceName(screen) {
  const candidate = screen.getCurrentStreamCandidate?.();
  return String(candidate?.addonName || candidate?.label || candidate?.name || "").trim();
}

function isPlayPauseBusy(screen) {
  return Boolean(screen.loadingVisible || screen.seekLoading);
}

function buildCapsuleItems(screen) {
  const aspectMode = screen.aspectModes?.[screen.aspectModeIndex] || { label: "" };
  const speedOptions = screen.getPlaybackSpeedOptions?.() || [];
  const speed = screen.getPlaybackSpeed?.() || 1;
  const items = [
    {
      action: "aspect",
      icon: ICONS.aspect,
      label: aspectMode.label || t("player_aspect_fit", {}, "Fit")
    }
  ];
  if (speedOptions.length > 1) {
    items.push({
      action: "speed",
      icon: ICONS.speed,
      label: `${speed.toFixed(speed % 1 ? 2 : 0)}x`
    });
  }
  items.push({
    action: "subtitles",
    icon: ICONS.subtitles,
    label: t("subtitle_dialog_title", {}, "Subtitles")
  });
  items.push({
    action: "audio",
    icon: ICONS.audio,
    label: t("audio_dialog_title", {}, "Audio")
  });
  items.push({
    action: "sources",
    icon: ICONS.sources,
    label: t("sources_title", {}, "Sources")
  });
  if (Array.isArray(screen.episodes) && screen.episodes.length) {
    items.push({
      action: "episodes",
      icon: ICONS.episodes,
      label: t("episodes_panel_title", {}, "Episodes")
    });
  }
  return items;
}

// ---------------------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------------------

function renderHeader(screen) {
  const header = screen.getPlayerHeaderData();
  const sourceName = getSourceName(screen);
  const subtitleLine = [header.subtitle, sourceName].filter(Boolean).join("  •  ");
  return `
    <div class="phone-player-header" data-phone-player-header>
      <div class="phone-player-header-meta">
        <div class="phone-player-header-title">${escapeHtml(header.title)}</div>
        ${subtitleLine ? `<div class="phone-player-header-subtitle">${escapeHtml(subtitleLine)}</div>` : ""}
      </div>
      <div class="phone-player-header-actions">
        <button type="button" class="phone-player-icon-btn" data-phone-player-action="handoff" aria-label="${escapeHtml(t("player_open_external", {}, "Open externally"))}">${ICONS.handoff}</button>
        <button type="button" class="phone-player-icon-btn" data-phone-player-action="lock" aria-label="${escapeHtml(t("player_lock_controls", {}, "Lock"))}">${ICONS.lock}</button>
        <button type="button" class="phone-player-icon-btn" data-phone-player-action="settings" aria-label="${escapeHtml(t("player_settings_title", {}, "Settings"))}">${ICONS.settings}</button>
        <button type="button" class="phone-player-icon-btn" data-phone-player-action="close" aria-label="${escapeHtml(t("player_go_back", {}, "Back"))}">${ICONS.close}</button>
      </div>
    </div>
  `;
}

function renderCenterControls(screen) {
  const busy = isPlayPauseBusy(screen);
  return `
    <div class="phone-player-center" data-phone-player-center>
      <button type="button" class="phone-player-transport-btn" data-phone-player-action="replay10" aria-label="${escapeHtml(t("player_seek_back_10", {}, "Replay 10 seconds"))}">${ICONS.replay10}</button>
      <button type="button" class="phone-player-transport-btn phone-player-transport-btn-primary" data-phone-player-action="playPause" aria-label="${escapeHtml(t("player_play_pause", {}, "Play/Pause"))}">
        <span class="phone-player-playpause-icon${busy ? " hidden" : ""}">${screen.paused ? ICONS.play : ICONS.pause}</span>
        <span class="phone-player-playpause-spinner${busy ? "" : " hidden"}">${renderLoadingIndicator({ className: "phone-player-spinner-ring" })}</span>
      </button>
      <button type="button" class="phone-player-transport-btn" data-phone-player-action="forward10" aria-label="${escapeHtml(t("player_seek_forward_10", {}, "Forward 10 seconds"))}">${ICONS.forward10}</button>
    </div>
  `;
}

function renderBottomBar(screen) {
  const duration = screen.getPlaybackDurationSeconds?.() || 0;
  const current = screen.getPlaybackCurrentSeconds?.() || 0;
  const capsuleItems = buildCapsuleItems(screen);
  return `
    <div class="phone-player-bottom" data-phone-player-bottom>
      <div class="phone-player-scrub-row">
        <span class="phone-player-time phone-player-time-elapsed" data-phone-player-elapsed>${escapeHtml(formatPhoneTime(current))}</span>
        <input type="range" class="phone-player-scrubber" data-phone-player-scrubber
               min="0" max="${Math.max(0, Math.floor(duration))}" step="1"
               value="${Math.max(0, Math.floor(current))}"
               ${duration > 0 ? "" : "disabled"} />
        <span class="phone-player-time phone-player-time-duration" data-phone-player-duration>${escapeHtml(formatPhoneTime(duration))}</span>
      </div>
      <div class="phone-player-capsule-bar" data-phone-player-capsule-bar>
        ${capsuleItems
          .map(
            (item) => `
          <button type="button" class="phone-player-capsule-pill" data-phone-player-action="${item.action}">
            <span class="phone-player-capsule-pill-icon" aria-hidden="true">${item.icon}</span>
            <span class="phone-player-capsule-pill-label">${escapeHtml(item.label)}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderLockOverlay() {
  return `
    <div class="phone-player-lock-overlay" data-phone-player-lock-overlay>
      <div class="phone-player-lock-scrim"></div>
      <button type="button" class="phone-player-lock-btn" data-phone-player-unlock-btn aria-label="${escapeHtml(t("player_unlock_controls", {}, "Hold to unlock"))}">
        ${ICONS.unlock}
      </button>
      <div class="phone-player-lock-hint">${escapeHtml(t("player_unlock_hint", {}, "Hold to unlock"))}</div>
      <div class="phone-player-lock-bottom">
        <span class="phone-player-time" data-phone-player-lock-elapsed>0:00</span>
        <div class="phone-player-lock-track"><div class="phone-player-lock-fill" data-phone-player-lock-fill></div></div>
        <span class="phone-player-time" data-phone-player-lock-duration>0:00</span>
      </div>
    </div>
  `;
}

function renderSkipIntroPill() {
  return `<div class="phone-player-skip-pill hidden" data-phone-player-skip></div>`;
}

function renderPauseOverlaySlot() {
  return `<div class="phone-player-pause-overlay hidden" data-phone-player-pause-overlay></div>`;
}

function renderNextEpisodeSlot() {
  return `<div class="phone-player-next-episode hidden" data-phone-player-next-episode></div>`;
}

/** Returns the full phone player chrome markup, appended once into `#phonePlayerUi` by
 * `playerScreen.js`'s `syncPhonePlayerChrome()`. Dynamic bits (time, progress, pause overlay
 * content, skip pill, next-episode card, lock state) are filled in by `updatePhonePlayerChrome`
 * afterward and on every subsequent state change — this only lays out the static structure. */
export function renderPhonePlayerChrome(screen) {
  return `
    ${renderHeader(screen)}
    ${renderCenterControls(screen)}
    ${renderBottomBar(screen)}
    ${renderSkipIntroPill()}
    ${renderNextEpisodeSlot()}
    ${renderPauseOverlaySlot()}
    ${renderLockOverlay()}
  `;
}

// ---------------------------------------------------------------------------------------
// Dynamic refresh — re-reads the same screen state every call, cheap enough to run from
// `updateUiTick()`'s 1s ticker and every relevant render* hook (see playerScreen.js).
// ---------------------------------------------------------------------------------------

function updateHeaderVisibility(screen, container) {
  container
    .querySelector("[data-phone-player-header]")
    ?.classList.toggle("hidden", !screen.controlsVisible);
  container
    .querySelector("[data-phone-player-center]")
    ?.classList.toggle("hidden", !screen.controlsVisible);
  container
    .querySelector("[data-phone-player-bottom]")
    ?.classList.toggle("hidden", !screen.controlsVisible);
}

function updatePlayPauseButton(screen, container) {
  const btn = container.querySelector('[data-phone-player-action="playPause"]');
  if (!btn) {
    return;
  }
  const busy = isPlayPauseBusy(screen);
  const iconEl = btn.querySelector(".phone-player-playpause-icon");
  const spinnerEl = btn.querySelector(".phone-player-playpause-spinner");
  if (iconEl) {
    iconEl.classList.toggle("hidden", busy);
    iconEl.innerHTML = screen.paused ? ICONS.play : ICONS.pause;
  }
  spinnerEl?.classList.toggle("hidden", !busy);
}

function updateScrubber(screen, container) {
  const duration = screen.getPlaybackDurationSeconds?.() || 0;
  const current = screen.getPlaybackCurrentSeconds?.() || 0;
  const input = container.querySelector("[data-phone-player-scrubber]");
  if (input && document.activeElement !== input && !input.dataset.dragging) {
    input.max = String(Math.max(0, Math.floor(duration)));
    input.value = String(Math.max(0, Math.floor(current)));
    input.disabled = !(duration > 0);
  }
  const elapsedEl = container.querySelector("[data-phone-player-elapsed]");
  const durationEl = container.querySelector("[data-phone-player-duration]");
  if (elapsedEl) {
    elapsedEl.textContent = formatPhoneTime(current);
  }
  if (durationEl) {
    durationEl.textContent = formatPhoneTime(duration);
  }
  const lockElapsed = container.querySelector("[data-phone-player-lock-elapsed]");
  const lockDuration = container.querySelector("[data-phone-player-lock-duration]");
  const lockFill = container.querySelector("[data-phone-player-lock-fill]");
  if (lockElapsed) {
    lockElapsed.textContent = formatPhoneTime(current);
  }
  if (lockDuration) {
    lockDuration.textContent = formatPhoneTime(duration);
  }
  if (lockFill) {
    const ratio = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    lockFill.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }
}

function updateCapsuleBar(screen, container) {
  const bar = container.querySelector("[data-phone-player-capsule-bar]");
  if (!bar) {
    return;
  }
  bar.innerHTML = buildCapsuleItems(screen)
    .map(
      (item) => `
    <button type="button" class="phone-player-capsule-pill" data-phone-player-action="${item.action}">
      <span class="phone-player-capsule-pill-icon" aria-hidden="true">${item.icon}</span>
      <span class="phone-player-capsule-pill-label">${escapeHtml(item.label)}</span>
    </button>
  `
    )
    .join("");
  bindCapsuleBar(screen, container);
}

function updateSkipIntroPill(screen, container) {
  const pill = container.querySelector("[data-phone-player-skip]");
  if (!pill) {
    return;
  }
  const activeInterval = screen.activeSkipInterval;
  const shouldShow =
    Boolean(activeInterval) &&
    (typeof screen.isSkipIntroPlaybackReady !== "function" || screen.isSkipIntroPlaybackReady()) &&
    !screen.skipIntervalDismissed;
  pill.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    pill.innerHTML = "";
    return;
  }
  const progress = clamp(Number(screen.skipIntroCountdownProgress || 0), 0, 1);
  pill.innerHTML = `
    <button type="button" class="phone-player-skip-btn focusable" data-player-pointer-action="skipIntro">
      <span class="phone-player-skip-label">${escapeHtml(skipIntervalLabel(activeInterval))}</span>
      <span class="phone-player-skip-progress" aria-hidden="true">
        <span class="phone-player-skip-progress-fill" style="transform:scaleX(${progress.toFixed(4)})"></span>
      </span>
    </button>
  `;
}

function updatePauseOverlay(screen, container) {
  const overlay = container.querySelector("[data-phone-player-pause-overlay]");
  if (!overlay) {
    return;
  }
  const hidden = !screen.pauseOverlayVisible || screen.loadingVisible;
  overlay.classList.toggle("hidden", hidden);
  if (hidden) {
    overlay.innerHTML = "";
    return;
  }

  if (screen.stillWatchingPromptVisible) {
    const nextEpisode = screen.resolveNextEpisodeInfo?.();
    const titleLine = [nextEpisode?.episodeLabel, nextEpisode?.episodeTitle]
      .filter(Boolean)
      .join(" • ");
    const episode = (screen.episodes || []).find(
      (entry) => String(entry?.id || "") === String(nextEpisode?.videoId || "")
    );
    const thumbnail = String(episode?.thumbnail || "").trim();
    overlay.innerHTML = `
      <div class="phone-player-pause-scrim"></div>
      <div class="phone-player-pause-content phone-player-still-watching">
        ${thumbnail ? `<img class="phone-player-still-watching-thumb" src="${escapeHtml(thumbnail)}" alt="" aria-hidden="true" />` : ""}
        <div class="phone-player-still-watching-kicker">${escapeHtml(t("still_watching_title", {}, "Are you still watching?"))}</div>
        <div class="phone-player-still-watching-title">${escapeHtml(titleLine || t("next_episode_label", {}, "Next episode"))}</div>
        <div class="phone-player-still-watching-status">${escapeHtml(t("still_watching_countdown", [screen.stillWatchingPromptCountdownSec], `Stopping in ${screen.stillWatchingPromptCountdownSec}s`))}</div>
        <div class="phone-player-still-watching-actions">
          <button type="button" class="phone-player-still-watching-btn focusable" data-player-pointer-action="stillWatchingContinue">${escapeHtml(t("still_watching_continue", {}, "Play"))}</button>
          <button type="button" class="phone-player-still-watching-btn is-secondary focusable" data-player-pointer-action="stillWatchingExit">${escapeHtml(t("still_watching_exit", {}, "Exit"))}</button>
        </div>
      </div>
    `;
    return;
  }

  const meta = screen.pauseOverlayMeta || screen.buildPauseOverlayMeta?.() || {};
  overlay.innerHTML = `
    <div class="phone-player-pause-scrim"></div>
    <div class="phone-player-pause-content">
      <div class="phone-player-pause-kicker">${escapeHtml(t("pause_you_are_watching", {}, "You're watching"))}</div>
      ${meta.logoUrl ? `<img class="phone-player-pause-logo" src="${escapeHtml(meta.logoUrl)}" alt="${escapeHtml(meta.title || "")}" />` : `<div class="phone-player-pause-title">${escapeHtml(meta.title || "")}</div>`}
      ${meta.releaseYear || meta.episodeCode ? `<div class="phone-player-pause-meta-line">${escapeHtml([meta.releaseYear, meta.episodeCode].filter(Boolean).join(" • "))}</div>` : ""}
      ${meta.episodeTitle ? `<div class="phone-player-pause-episode-title">${escapeHtml(meta.episodeTitle)}</div>` : ""}
      ${meta.description ? `<div class="phone-player-pause-description">${escapeHtml(meta.description)}</div>` : ""}
    </div>
  `;
}

function updateNextEpisodeCard(screen, container) {
  const card = container.querySelector("[data-phone-player-next-episode]");
  if (!card) {
    return;
  }
  const hidden = !screen.isNextEpisodeCardVisible?.();
  card.classList.toggle("hidden", hidden);
  if (hidden) {
    card.innerHTML = "";
    return;
  }
  const nextEpisode = screen.resolveNextEpisodeInfo();
  const titleLine = [nextEpisode.episodeLabel, nextEpisode.episodeTitle]
    .filter(Boolean)
    .join(" • ");
  const statusText = nextEpisode.hasAired
    ? t("next_episode_play", {}, "Play")
    : t("next_episode_unaired", {}, "Unaired");
  const progressText = screen.nextEpisodeCardSearching
    ? t("next_episode_finding_source", {}, "Finding source…")
    : screen.nextEpisodeCardSourceName && screen.nextEpisodeCardCountdownSec != null
      ? t(
          "next_episode_playing_via",
          [screen.nextEpisodeCardSourceName, screen.nextEpisodeCardCountdownSec],
          `Playing via ${screen.nextEpisodeCardSourceName} in ${screen.nextEpisodeCardCountdownSec}s`
        )
      : "";
  const thumb = (screen.episodes || []).find(
    (entry) => String(entry?.id || "") === String(nextEpisode.videoId || "")
  )?.thumbnail;
  card.innerHTML = `
    <div class="phone-player-next-episode-inner${nextEpisode.hasAired ? " focusable is-playable" : ""}"${nextEpisode.hasAired ? ' data-player-pointer-action="nextEpisode"' : ""}>
      ${thumb ? `<img class="phone-player-next-episode-thumb" src="${escapeHtml(thumb)}" alt="" aria-hidden="true" />` : `<div class="phone-player-next-episode-thumb phone-player-next-episode-thumb-fallback"></div>`}
      <div class="phone-player-next-episode-copy">
        <div class="phone-player-next-episode-kicker">${escapeHtml(t("next_episode_label", {}, "Next episode"))}</div>
        <div class="phone-player-next-episode-title">${escapeHtml(titleLine || t("next_episode_label", {}, "Next episode"))}</div>
        ${progressText ? `<div class="phone-player-next-episode-status">${escapeHtml(progressText)}</div>` : ""}
      </div>
      <div class="phone-player-next-episode-badge${nextEpisode.hasAired ? " is-playable" : ""}">${escapeHtml(statusText)}</div>
    </div>
  `;
}

function updateLockMode(screen, container) {
  container.classList.toggle("is-locked", Boolean(screen.phoneLockActive));
}

/** Refreshes every dynamic bit of the phone chrome from the screen's current state. Cheap and
 * idempotent — safe to call on every tick/render hook (see playerScreen.js). */
export function updatePhonePlayerChrome(screen, container) {
  if (!container) {
    return;
  }
  updateHeaderVisibility(screen, container);
  updatePlayPauseButton(screen, container);
  updateScrubber(screen, container);
  updateCapsuleBar(screen, container);
  updateSkipIntroPill(screen, container);
  updatePauseOverlay(screen, container);
  updateNextEpisodeCard(screen, container);
  updateLockMode(screen, container);
}

// ---------------------------------------------------------------------------------------
// Track/speed pickers — bottom-anchored rails, backed by the screen's existing track data +
// selection logic (see pickerRail.js's own header comment on why this isn't a bottomSheet).
// ---------------------------------------------------------------------------------------

function openSubtitlePickerRail(screen) {
  screen.cancelSeekPreview?.({ commit: false });
  screen.syncTrackState?.();
  const languageItems = screen.getSubtitleLanguageRailItems();
  openPickerRail({
    title: t("subtitle_dialog_title", {}, "Subtitles"),
    items: languageItems.map((item) => ({
      id: item.key,
      label: item.label,
      selected: item.selected
    })),
    onSelect: (languageKey) => {
      // "__off__" matches playerScreen.js's own SUBTITLE_LANGUAGE_OFF_KEY sentinel (see
      // getSubtitleLanguageRailItems()'s Off entry) — module-private there, so mirrored here as
      // a literal rather than importing an unexported constant.
      if (!languageKey || languageKey === "__off__") {
        const offEntry = screen
          .getSubtitleEntries("builtIn")
          .find((entry) => entry.id === "subtitle-off") || { trackIndex: -1 };
        screen.applySubtitleEntry(offEntry);
        return;
      }
      screen.selectFirstSubtitleOptionForLanguage(languageKey, { focusOptions: false });
    }
  });
}

function openAudioPickerRail(screen) {
  screen.syncTrackState?.();
  screen.applyAudioAmplification?.();
  let entries = screen.getAudioEntries();
  if (!entries.length) {
    screen.ensureTrackDataWarmup?.();
    entries = screen.getAudioEntries();
  }
  openPickerRail({
    title: t("audio_dialog_title", {}, "Audio"),
    items: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      secondary: entry.secondary,
      selected: entry.selected,
      disabled: entry.supported === false || screen.isAudioEntryPending(entry)
    })),
    onSelect: (id) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        screen.applyAudioTrack(index, { rememberSelection: true });
      }
    }
  });
}

function openSpeedPickerRail(screen) {
  const options = screen.getPlaybackSpeedOptions();
  const current = screen.getPlaybackSpeed();
  openPickerRail({
    title: t("player_playback_speed", {}, "Playback speed"),
    items: options.map((speed) => ({
      id: String(speed),
      label: `${Number(speed).toFixed(speed % 1 ? 2 : 0)}x`,
      selected: Math.abs(Number(speed) - Number(current)) < 0.001
    })),
    onSelect: (id) => {
      void screen.applyPlaybackSpeed(Number(id));
    }
  });
}

// ---------------------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------------------

function bindHeader(screen, container) {
  container
    .querySelector('[data-phone-player-action="handoff"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      screen.tryOpenCurrentStreamExternally?.();
    });
  container
    .querySelector('[data-phone-player-action="lock"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      screen.phoneLockActive = true;
      updatePhonePlayerChrome(screen, container);
    });
  container
    .querySelector('[data-phone-player-action="settings"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      Router.navigate("settings");
    });
  container
    .querySelector('[data-phone-player-action="close"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!screen.consumeBackRequest?.()) {
        Router.back();
      }
    });
}

function bindCenterControls(screen, container) {
  container
    .querySelector('[data-phone-player-action="replay10"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = screen.getPlaybackCurrentSeconds();
      screen.seekPlaybackSeconds(Math.max(0, current - SEEK_STEP_SECONDS));
      screen.resetControlsAutoHide?.();
    });
  container
    .querySelector('[data-phone-player-action="forward10"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = screen.getPlaybackCurrentSeconds();
      screen.seekPlaybackSeconds(current + SEEK_STEP_SECONDS);
      screen.resetControlsAutoHide?.();
    });
  container
    .querySelector('[data-phone-player-action="playPause"]')
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      screen.togglePause();
    });
}

function bindCapsuleBar(screen, container) {
  const handlers = {
    aspect: () => screen.cycleAspectMode(),
    speed: () => openSpeedPickerRail(screen),
    subtitles: () => openSubtitlePickerRail(screen),
    audio: () => openAudioPickerRail(screen),
    sources: () => screen.performControlAction("source"),
    episodes: () => screen.performControlAction("episodes")
  };
  container
    .querySelectorAll("[data-phone-player-capsule-bar] [data-phone-player-action]")
    .forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const handler = handlers[button.dataset.phonePlayerAction];
        handler?.();
        screen.resetControlsAutoHide?.();
      };
    });
}

function bindScrubber(screen, container) {
  const input = container.querySelector("[data-phone-player-scrubber]");
  if (!input) {
    return () => {};
  }
  const onPointerDown = () => {
    input.dataset.dragging = "1";
    screen.clearControlsAutoHide?.();
  };
  const onInput = () => {
    const elapsedEl = container.querySelector("[data-phone-player-elapsed]");
    if (elapsedEl) {
      elapsedEl.textContent = formatPhoneTime(Number(input.value || 0));
    }
  };
  const onChange = () => {
    delete input.dataset.dragging;
    screen.seekPlaybackSeconds(Number(input.value || 0));
    screen.resetControlsAutoHide?.();
  };
  input.addEventListener("pointerdown", onPointerDown);
  input.addEventListener("input", onInput);
  input.addEventListener("change", onChange);
  return () => {
    input.removeEventListener("pointerdown", onPointerDown);
    input.removeEventListener("input", onInput);
    input.removeEventListener("change", onChange);
  };
}

function bindLockOverlay(screen, container) {
  const unlockBtn = container.querySelector("[data-phone-player-unlock-btn]");
  if (!unlockBtn) {
    return () => {};
  }
  return attachLongPress(unlockBtn, {
    onLongPress: () => {
      screen.phoneLockActive = false;
      updatePhonePlayerChrome(screen, container);
      screen.resetControlsAutoHide?.();
    }
  });
}

/** Wires the phone player chrome's interactivity after `renderPhonePlayerChrome`'s markup has
 * been inserted into `container`. Returns a teardown function. */
export function mountPhonePlayerChrome(screen, container) {
  bindHeader(screen, container);
  bindCenterControls(screen, container);
  bindCapsuleBar(screen, container);
  const detachScrubber = bindScrubber(screen, container);
  const detachLockLongPress = bindLockOverlay(screen, container);

  return () => {
    detachScrubber();
    detachLockLongPress();
    closeActivePickerRail();
  };
}
