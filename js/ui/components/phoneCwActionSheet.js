// Phone Continue-Watching action sheet, ported from NuvioMobile's
// NuvioContinueWatchingActionSheet (ContinueWatchingActionSheet.kt) on the shared #51 sheet
// scaffold — see parity ticket #53.
//
// Two pieces:
// - `buildCwSheetRows` — pure row branching: Go to details, Play manually (when the screen
//   offers a manual-play entry), Start from beginning (only for non-next-up items, honoring
//   NuvioMobile's `if (!item.isNextUp && onStartFromBeginning != null)`), Remove. Behavior
//   tests assert this branching directly.
// - `openCwActionSheet` — renders the single sheet instance: a poster-header (artwork +
//   title + episode subtitle, mirroring ContinueWatchingSheetHeader) above the action rows,
//   each row dismissing the sheet before firing its callback (dismissAfter semantics using
//   the shared scaffold's dismissFirst contract).

import { openModalSheet } from "./bottomSheet.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.7-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14Z"/></svg>';
const REPLAY_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5V1.8a.8.8 0 0 0-1.36-.57l-6.1 6.1a1.2 1.2 0 0 0 0 1.7l6.1 6.1c.42.42 1.36.13 1.36-.56V10h.4a5.6 5.6 0 0 1 0 11.2h-2.3a.9.9 0 0 0 0 1.8h2.3a7.4 7.4 0 0 0 0-14.8H12V5Z"/></svg>';
const DELETE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 7h12l-.9 12.1a1 1 0 0 1-1 .9H7.9a1 1 0 0 1-1-.9L6 7Zm3-3.5h6l.7 2H8.3l.7-2ZM9 11.5v6a.8.8 0 0 0 1.6 0v-6a.8.8 0 0 0-1.6 0Zm3.4 0v6a.8.8 0 0 0 1.6 0v-6a.8.8 0 0 0-1.6 0Z"/></svg>';
const INFO_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.3 14.5v-7a.9.9 0 0 1 1.8 0v7a.9.9 0 0 1-1.8 0Zm0-9.5v-.4a.9.9 0 0 1 1.8 0V7a.9.9 0 0 1-1.8 0Z"/></svg>';

const ICONS = {
  details: INFO_ICON,
  playManually: PLAY_ICON,
  startFromBeginning: REPLAY_ICON,
  remove: DELETE_ICON
};

const ROW_LABEL_KEYS = {
  details: "cw_action_go_to_details",
  playManually: "play_manually",
  startFromBeginning: "cw_action_start_from_beginning",
  remove: "cw_action_remove"
};

/**
 * Pure row branching for a CW item — returns `{ id, label, onSelect }` rows in native order:
 * details, play manually (only when allowed), start from beginning (only when
 * `item.isNextUp` is falsy AND a handler is provided — next-up items are resume-bound),
 * remove (always). `labelFor` lets callers inject i18n copy ({key, params, fallback}).
 */
export function buildCwSheetRows(
  item = {},
  {
    showManualPlayOption = false,
    onOpenDetails = null,
    onPlayManually = null,
    onStartFromBeginning = null,
    onRemove = null,
    labelFor = (key, fallback) => fallback
  } = {}
) {
  const rows = [];

  rows.push({
    id: "details",
    label: labelFor(ROW_LABEL_KEYS.details, "Go to details"),
    onSelect: onOpenDetails
  });

  if (showManualPlayOption && typeof onPlayManually === "function") {
    rows.push({
      id: "playManually",
      label: labelFor(ROW_LABEL_KEYS.playManually, "Play manually"),
      onSelect: onPlayManually
    });
  }

  if (!item.isNextUp && typeof onStartFromBeginning === "function") {
    rows.push({
      id: "startFromBeginning",
      label: labelFor(ROW_LABEL_KEYS.startFromBeginning, "Start from beginning"),
      onSelect: onStartFromBeginning
    });
  }

  rows.push({
    id: "remove",
    label: labelFor(ROW_LABEL_KEYS.remove, "Remove"),
    onSelect: onRemove
  });

  return rows;
}

function renderCwSheetHeader({ posterUrl = "", title = "", subtitle = "" } = {}) {
  const artwork = posterUrl
    ? `<img class="phone-cw-sheet-poster-image" src="${escapeHtml(posterUrl)}" alt="" />`
    : `<span class="phone-cw-sheet-poster-image phone-cw-sheet-poster-image-empty" aria-hidden="true"></span>`;
  return `
    <div class="phone-sheet-header phone-cw-sheet-header">
      <div class="phone-cw-sheet-poster">${artwork}</div>
      <div class="phone-cw-sheet-copy">
        <div class="phone-sheet-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="phone-sheet-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Opens the CW action sheet for one item on the shared scaffold. `item` mirrors the
 * ContinueWatchingItem shape (`isNextUp`, `title`, `episodeCode`/`episodeTitle` used for the
 * subtitle, and a poster/thumbnail/backdrop source). Row callbacks are passed directly (or a
 * `rows` array from `buildCwSheetRows` for custom wiring). Returns the sheet controller.
 */
export function openCwActionSheet({
  item = {},
  posterUrl = "",
  subtitle = "",
  showManualPlayOption = false,
  rows = null,
  labelFor = null,
  onOpenDetails = null,
  onPlayManually = null,
  onStartFromBeginning = null,
  onRemove = null,
  onDismiss = null
} = {}) {
  const resolvedRows =
    rows ||
    buildCwSheetRows(item, {
      showManualPlayOption,
      onOpenDetails,
      onPlayManually,
      onStartFromBeginning,
      onRemove,
      labelFor: labelFor || ((key, fallback) => fallback)
    });

  return openModalSheet({
    headerHtml: renderCwSheetHeader({
      posterUrl,
      title: item.title || item.name || "",
      subtitle: subtitle || [item.episodeCode, item.episodeTitle].filter(Boolean).join(" • ")
    }),
    items: resolvedRows
      .filter((row) => row && typeof row.onSelect === "function")
      .map((row) => ({
        title: row.label,
        icon: ICONS[row.id],
        onSelect: row.onSelect
      })),
    onDismiss
  });
}
