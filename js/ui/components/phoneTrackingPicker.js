// Phone tracking-list picker sheet, ported from NuvioMobile's TrackingListPickerDialog
// (TrackingListPickerDialog.kt) on the shared #51 sheet scaffold — see parity ticket #53.
// A sheet shows the tracking destinations as checkmarked rows (radio semantics for
// single-select sources like SIMKL, checkbox for multi-select), with Cancel/Save row
// actions; Save passes the selected keys back through the host's list-membership save.
//
// Pure logic (`normalizeTrackerOptions`/`toggleTrackerOption`/`collectSelectedKeys`) is
// separated from the sheet host so behavior tests assert option state without class-name
// strings.

import { openModalSheet } from "./bottomSheet.js";

const CHECKMARK_MARKUP =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>';

const DEFAULT_FALLBACK_TAB = { key: "local", title: "Library" };

/**
 * Normalizes tracking tabs + membership snapshot into `[{ key, title, selected }]`.
 * `tabs` is the repository's list tabs (already filtered to membership destinations by
 * callers that need to), `membership` is the snapshot's `listMembership` map, and
 * `fallbackTitle` covers the no-tabs case (mirrors homeScreen's local-list fallback).
 */
export function normalizeTrackerOptions(
  tabs = [],
  membership = {},
  { fallbackTitle = "Library" } = {}
) {
  const resolvedTabs =
    Array.isArray(tabs) && tabs.length ? tabs : [{ ...DEFAULT_FALLBACK_TAB, title: fallbackTitle }];
  return resolvedTabs.map((tab) => ({
    key: String(tab.key || ""),
    title: tab.title || tab.key || "",
    selected: membership[tab.key] === true
  }));
}

/**
 * Pure toggle: returns the next options array with `key` selected/deselected. `singleSelect`
 * (SIMKL-style sources) makes the toggle radio-like — only `key` ends up selected.
 */
export function toggleTrackerOption(options, key, { singleSelect = false } = {}) {
  const target = options.find((option) => option.key === key);
  if (!target) {
    return options;
  }
  const nextSelected = !target.selected;
  return options.map((option) =>
    option.key === key
      ? { ...option, selected: nextSelected }
      : singleSelect
        ? { ...option, selected: false }
        : option
  );
}

/** Returns the keys of selected options, in their original order. */
export function collectSelectedKeys(options) {
  return options.filter((option) => option.selected).map((option) => option.key);
}

/**
 * Opens the tracking-list picker. `options` comes from `normalizeTrackerOptions` (or the
 * caller's own resolution); `singleSelect` applies radio semantics (SIMKL-style sources).
 * Rows toggle in place on the single open sheet (`dismissFirst: false` — the sheet host keeps
 * them open per its selection contract); the Save row calls `onSave(selectedKeys)` then
 * closes. `noticeHtml` renders an error line above the rows (the screen's save-error, e.g. a
 * SIMKL destructive-removal notice). Returns the sheet controller.
 */
export function openTrackingListPickerSheet({
  title = "",
  subtitle = "",
  noticeHtml = "",
  saveLabel = "",
  options = [],
  singleSelect = false,
  onSave = null,
  onDismiss = null
} = {}) {
  let currentOptions = options.map((option) => ({ ...option }));
  const selectedKeys = () => collectSelectedKeys(currentOptions);

  const renderItems = () => [
    ...currentOptions.map((option) => ({
      title: option.title,
      dismissFirst: false,
      trailing: option.selected ? CHECKMARK_MARKUP : "",
      onSelect: () => {
        currentOptions = toggleTrackerOption(currentOptions, option.key, { singleSelect });
        syncRowStates(sheetRoot, currentOptions);
      }
    })),
    {
      // The Save row manages the sheet itself (dismissFirst: false): collect the final
      // selection first, then destroy — the sheet host's destroy-before-select contract
      // would otherwise fire the caller's onDismiss before onSave even runs, tearing the
      // picker state down mid-save.
      title: onSaveLabel,
      dismissFirst: false,
      onSelect: () => {
        saved = true;
        if (typeof onSave === "function") {
          onSave(selectedKeys());
        }
        controller?.destroy();
      }
    }
  ];

  // The sheet host needs a handle to the open sheet's avatar for imperative toggle sync.
  let sheetRoot = null;
  let saved = false;
  const onSaveLabel = typeof saveLabel === "string" && saveLabel !== "" ? saveLabel : "Save";

  const controller = openModalSheet({
    title,
    subtitle,
    noticeHtml,
    items: renderItems(),
    onDismiss: () => {
      // A programmatic close after Save is not a user dismiss — the caller's onDismiss
      // (which tears the picker state down) must not fire on the save path.
      if (!saved) {
        onDismiss?.();
      }
    }
  });

  // Snatch the live sheet root to imperatively keep row check state in sync without
  // re-rendering the open sheet (single-instance, NoP FLIP-lite animation preserved).
  sheetRoot = document.querySelector(".phone-sheet");
  syncRowStates(sheetRoot, currentOptions);
  return controller;
}

/** Imperatively applies the current selection state to a rendered sheet's rows. */
export function syncRowStates(sheetRoot, options) {
  if (!sheetRoot) {
    return;
  }
  sheetRoot.querySelectorAll(".phone-sheet-action").forEach((button) => {
    const index = Number(button.dataset.index || 0);
    const option = options[index];
    if (!option) {
      return;
    }
    const existing = button.querySelector(".phone-sheet-action-trailing");
    if (option.selected && !existing) {
      const span = document.createElement("span");
      span.className = "phone-sheet-action-trailing";
      span.innerHTML = CHECKMARK_MARKUP;
      button.appendChild(span);
    } else if (!option.selected && existing) {
      existing.remove();
    }
  });
}
