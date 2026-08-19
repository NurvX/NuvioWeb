import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { renderPhoneNavBar, bindPhoneNavBarEvents } from "../../components/phoneNavBar.js";
import { SECTION_ICONS, translateSectionCopy, SETTINGS_VERSION_LABEL } from "./settingsScreen.js";

// Phone render path for js/ui/screens/settings/settingsScreen.js (ticket 05-01, see
// .scratch/mobile-parity/spec.md). settingsScreen.js's own `render()` only gets a guard clause
// that dispatches to `renderPhone()` here when `Platform.isPhoneViewport()` is true — all
// markup/interaction logic for the phone layout lives in this module.
//
// The TV settings screen is a nav-rail + single-active-section shell where each section's
// content (Account, Profiles, Appearance, Layout, Content & Discovery, Integration, Streams,
// Playback, Trakt, Advanced, About) is built from a small closed set of row primitives —
// `renderActionRow`/`renderToggleRow`/`renderThemeCard`/`renderLayoutCard`/
// `renderPluginIconButton`/`renderCollapsibleRow` — every one of which stamps a
// `data-focus-key` attribute (via `registerAction`) that already maps 1:1 to a real handler in
// `this.actionMap`. Rather than re-deriving every individual row's title/subtitle/current-value
// by hand across ~10 sections (which would mean duplicating hundreds of already-existing
// `t(...)`/model-read call sites), this module calls the screen's own `renderSection(section,
// model)` for every visible section (populating `screen.actionMap` as a side effect, exactly as
// TV rendering already does), parses the returned markup with a detached container, and
// extracts a flat, ordered list of row descriptors from it (see `extractSectionEntries`). Phone
// markup is then built fresh from those descriptors — this satisfies the ticket's "visual
// rebuild of the list/row/section chrome only, not new settings functionality": every row's
// title/subtitle/current value/selected-state and every tap's behavior still come from the
// exact same TV render + `actionMap` machinery, just re-skinned as a flat scrollable list of
// labeled cards instead of a nav-rail + single-section shell.
//
// Because every section is rendered (not just the "active" one), and a full re-render happens
// after every tap (see `dispatchRowAction`, mirroring `activateFocused()`'s own
// `await action(); await this.render(...)` sequence), this module never needs its own copy of
// any settings mutation logic — every toggle/select/text-entry/navigation already flows through
// `screen.actionMap`, `screen.optionDialog`/`screen.textDialog`, and `screen.submitTextDialog`/
// `screen.clearTextDialog`/`screen.closeTextDialog`/`screen.closeOptionDialog`, all called
// verbatim, never reimplemented.
//
// Two deliberate, documented simplifications versus a pixel-exact TV port:
// - Every row gets a small leading icon chip (per the ticket's "icon chip + title" row shape).
// TV only supplies a specific `leadingIcon`/`leadingIconSrc` for a minority of rows (Account,
// About); where TV didn't specify one, this falls back to the row's own section icon
// (`SECTION_ICONS`) so every row still gets a chip without inventing new per-row iconography.
// - The Account section's TV-only sync-overview stat grid (per-profile addon/library/watched
// counts) is summarized as a single compact line rather than ported node-for-node — the
// sign-in/sign-out rows themselves (and all their behavior) are still the same extracted,
// fully-functional rows as everywhere else.

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

function chevronSvg() {
  return `<svg class="phone-settings-row-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>`;
}

function externalSvg() {
  return `<svg class="phone-settings-row-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14z"></path><path fill="currentColor" d="M5 5h7v2H7v10h10v-5h2v7H5z"></path></svg>`;
}

function checkSvg() {
  return `<svg class="phone-settings-row-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7"/></svg>`;
}

// ---------------------------------------------------------------------------------------
// Extraction: TV section markup -> flat, phone-agnostic row descriptors
// ---------------------------------------------------------------------------------------

function firstText(node, selector) {
  const el = node.querySelector(selector);
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function leadingIconName(node) {
  const el = node.querySelector(".material-icons");
  return el ? el.textContent.trim() : "";
}

function fallbackTitle(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(".material-icons, svg, img").forEach((el) => el.remove());
  return clone.textContent.replace(/\s+/g, " ").trim();
}

/** Converts one interactive/informational node from a section's already-rendered TV markup
 * into a phone-agnostic row descriptor. Returns `null` for nodes this module doesn't render
 * (e.g. a stray `[data-focus-key]`-less node would never match the caller's selector anyway). */
function nodeToEntry(node) {
  if (node.classList.contains("settings-group-title")) {
    return { kind: "heading", text: node.textContent.trim() };
  }
  if (node.classList.contains("settings-plugin-repo-card")) {
    return {
      kind: "info",
      title: firstText(node, ".settings-plugin-repo-title"),
      subtitle: [
        firstText(node, ".settings-plugin-repo-meta"),
        firstText(node, ".settings-plugin-repo-url")
      ]
        .filter(Boolean)
        .join(" • ")
    };
  }

  const focusKey = node.dataset.focusKey;
  if (!focusKey) {
    return null;
  }
  const disabled = node.classList.contains("is-disabled");
  const planned = node.classList.contains("is-planned");
  const role = node.dataset.role || "";
  const icon = leadingIconName(node);

  if (node.classList.contains("settings-toggle-row")) {
    return {
      kind: "toggle",
      focusKey,
      role,
      title: firstText(node, ".settings-row-title") || fallbackTitle(node),
      subtitle: firstText(node, ".settings-row-subtitle"),
      checked: Boolean(node.querySelector(".settings-toggle-pill.is-checked")),
      disabled,
      planned,
      icon
    };
  }

  if (
    node.classList.contains("settings-theme-card") ||
    node.classList.contains("settings-layout-card")
  ) {
    const swatch = node.querySelector(".settings-theme-swatch");
    return {
      kind: "chip",
      focusKey,
      role,
      title: firstText(node, ".settings-theme-name, .settings-layout-name") || fallbackTitle(node),
      selected: node.classList.contains("is-selected"),
      swatchColor: swatch ? swatch.style.background : ""
    };
  }

  if (node.classList.contains("settings-plugin-icon-button")) {
    return {
      kind: "action",
      focusKey,
      role,
      title: node.getAttribute("aria-label") || node.getAttribute("title") || "",
      disabled,
      planned,
      icon: icon || (node.classList.contains("is-destructive") ? "delete" : "refresh")
    };
  }

  return {
    kind: "action",
    focusKey,
    role,
    title:
      firstText(
        node,
        ".settings-row-title, .settings-account-button-title, .settings-account-signout-label"
      ) || fallbackTitle(node),
    subtitle: firstText(node, ".settings-row-subtitle, .settings-account-button-subtitle"),
    value: firstText(node, ".settings-row-value"),
    external: Boolean(node.querySelector(".settings-row-icon.is-external")),
    disabled,
    planned,
    icon
  };
}

/** Renders `section`'s TV markup via `screen.renderSection` (which also populates
 * `screen.actionMap` as a side effect, same as the TV render path) and extracts a flat,
 * ordered list of row descriptors from it. */
function extractSectionEntries(screen, section) {
  const html = screen.renderSection(section, screen.model) || "";
  const container = document.createElement("div");
  container.innerHTML = html;
  const nodes = Array.from(
    container.querySelectorAll(
      "[data-focus-key], .settings-group-title, .settings-plugin-repo-card"
    )
  );
  return nodes.map(nodeToEntry).filter(Boolean);
}

// ---------------------------------------------------------------------------------------
// Row markup
// ---------------------------------------------------------------------------------------

function rowIconChip(icon, sectionIcon) {
  const name = icon || sectionIcon || "tune";
  return `<span class="phone-settings-row-icon material-icons" aria-hidden="true">${escapeHtml(name)}</span>`;
}

function entryHtml(entry, sectionIcon) {
  if (entry.kind === "heading") {
    return `<div class="phone-settings-subheading">${escapeHtml(entry.text)}</div>`;
  }

  if (entry.kind === "info") {
    return `
      <div class="phone-settings-row phone-settings-row-info">
        ${rowIconChip("", sectionIcon)}
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">${escapeHtml(entry.title)}</span>
          ${entry.subtitle ? `<span class="phone-settings-row-subtitle">${escapeHtml(entry.subtitle)}</span>` : ""}
        </span>
      </div>
    `;
  }

  const inert = entry.disabled || entry.planned;
  const inertAttrs = inert ? ' disabled aria-disabled="true"' : "";
  const inertClass = inert ? " is-disabled" : "";

  if (entry.kind === "toggle") {
    return `
      <button type="button" class="phone-settings-row phone-settings-row-toggle focusable${inertClass}"
              data-phone-focus-key="${escapeHtml(entry.focusKey)}"
              data-phone-role="${escapeHtml(entry.role)}"${inertAttrs}>
        ${rowIconChip(entry.icon, sectionIcon)}
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">${escapeHtml(entry.title)}</span>
          ${entry.subtitle ? `<span class="phone-settings-row-subtitle">${escapeHtml(entry.subtitle)}</span>` : ""}
        </span>
        <span class="phone-settings-switch${entry.checked ? " is-on" : ""}" aria-hidden="true">
          <span class="phone-settings-switch-thumb"></span>
        </span>
      </button>
    `;
  }

  if (entry.kind === "chip") {
    return `
      <button type="button" class="phone-settings-row phone-settings-row-chip focusable${inertClass}"
              data-phone-focus-key="${escapeHtml(entry.focusKey)}"
              data-phone-role="${escapeHtml(entry.role)}"${inertAttrs}>
        ${
          entry.swatchColor
            ? `<span class="phone-settings-row-swatch" style="background:${escapeHtml(entry.swatchColor)}"></span>`
            : rowIconChip("", sectionIcon)
        }
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">${escapeHtml(entry.title)}</span>
        </span>
        ${entry.selected ? checkSvg() : ""}
      </button>
    `;
  }

  // action (including collapsible-section triggers and plugin icon buttons)
  return `
    <button type="button" class="phone-settings-row phone-settings-row-action focusable${inertClass}"
            data-phone-focus-key="${escapeHtml(entry.focusKey)}"
            data-phone-role="${escapeHtml(entry.role)}"${inertAttrs}>
      ${rowIconChip(entry.icon, sectionIcon)}
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(entry.title)}</span>
        ${entry.subtitle ? `<span class="phone-settings-row-subtitle">${escapeHtml(entry.subtitle)}</span>` : ""}
      </span>
      ${entry.value ? `<span class="phone-settings-row-value">${escapeHtml(entry.value)}</span>` : ""}
      ${entry.external ? externalSvg() : chevronSvg()}
    </button>
  `;
}

// ---------------------------------------------------------------------------------------
// Account section summary (the one section given a small amount of bespoke phone markup —
// see the file header's second documented simplification)
// ---------------------------------------------------------------------------------------

function renderAccountSummary(model) {
  if (model.authState === "loading") {
    return `
      <div class="phone-settings-row phone-settings-row-info">
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">sync</span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">${escapeHtml(t("account_loading", {}, "Loading..."))}</span>
        </span>
      </div>
    `;
  }
  if (model.authState !== "authenticated") {
    return "";
  }
  const overview = model.accountSyncOverview;
  const totalsLine = overview
    ? [
        `${Number(overview.totalAddons || 0)} ${t("account_stat_addons", {}, "addons")}`,
        `${Number(overview.totalLibrary || 0)} ${t("account_stat_library", {}, "library")}`,
        `${Number(overview.totalWatchedItems || 0)} ${t("account_stat_watched", {}, "watched")}`
      ].join(" • ")
    : model.accountSyncOverviewLoading
      ? t("account_loading_sync", {}, "Loading sync data...")
      : "";
  return `
    <div class="phone-settings-row phone-settings-row-info">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">check_circle</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(model.accountEmail || t("settings.status.linkedFallback", {}, "Linked account"))}</span>
        ${totalsLine ? `<span class="phone-settings-row-subtitle">${escapeHtml(totalsLine)}</span>` : ""}
      </span>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Section cards
// ---------------------------------------------------------------------------------------

function renderSectionCard(screen, section) {
  const copy = translateSectionCopy(section);
  const sectionIcon = SECTION_ICONS[section.id] || "tune";
  const entries = extractSectionEntries(screen, section);
  const extraHtml = section.id === "account" ? renderAccountSummary(screen.model) : "";
  const rowsHtml = entries.map((entry) => entryHtml(entry, sectionIcon)).join("");
  if (!extraHtml && !rowsHtml) {
    return "";
  }
  return `
    <section class="phone-settings-card" data-phone-settings-section="${escapeHtml(section.id)}">
      <header class="phone-settings-card-header">
        <span class="phone-settings-card-title">${escapeHtml(copy.label)}</span>
        ${copy.subtitle ? `<span class="phone-settings-card-subtitle">${escapeHtml(copy.subtitle)}</span>` : ""}
      </header>
      <div class="phone-settings-card-body">${extraHtml}${rowsHtml}</div>
    </section>
  `;
}

function renderFooter() {
  return `
    <div class="phone-settings-footer">
      <p class="phone-settings-footer-line">${escapeHtml(t("settings.about.madeWithLove", {}, "Made with ♥"))}</p>
      <p class="phone-settings-footer-line phone-settings-footer-version">${escapeHtml(t("settings.about.version", { version: SETTINGS_VERSION_LABEL }, `Version ${SETTINGS_VERSION_LABEL}`))}</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Option / text dialog overlay — reads `screen.optionDialog`/`screen.textDialog` directly
// (the exact same state TV's own dialog rendering reads), rebuilt with phone chrome.
// ---------------------------------------------------------------------------------------

function renderOptionDialogOverlay(screen) {
  const dialog = screen.optionDialog;
  if (!dialog) {
    return "";
  }
  const isMulti = Boolean(dialog.multiChoice);
  const selectedIds = isMulti ? dialog.selectedIds || new Set() : null;
  const optionsHtml = (dialog.options || [])
    .map((option, index) => {
      const optionId = String(option.id);
      const isSelected = isMulti
        ? selectedIds.has(optionId)
        : optionId === String(dialog.selectedId);
      const label =
        typeof option.label === "function" ? option.label() : option.label || String(option.id);
      return `
        <button type="button" class="phone-settings-dialog-option${isSelected ? " is-selected" : ""}"
                data-phone-dialog-option-index="${index}">
          <span class="phone-settings-dialog-option-label">${escapeHtml(String(label))}</span>
          ${isSelected ? checkSvg() : ""}
        </button>
      `;
    })
    .join("");
  return `
    <div class="phone-settings-dialog-backdrop" data-phone-settings-dialog-backdrop>
      <div class="phone-settings-dialog" role="dialog" aria-modal="true">
        <div class="phone-settings-dialog-title">${escapeHtml(dialog.title || t("common.selectOption", {}, "Select an option"))}</div>
        ${dialog.message ? `<div class="phone-settings-dialog-message">${escapeHtml(dialog.message)}</div>` : ""}
        <div class="phone-settings-dialog-list">${optionsHtml}</div>
      </div>
    </div>
  `;
}

function renderTextDialogOverlay(screen) {
  const dialog = screen.textDialog;
  if (!dialog) {
    return "";
  }
  return `
    <div class="phone-settings-dialog-backdrop" data-phone-settings-dialog-backdrop>
      <div class="phone-settings-dialog" role="dialog" aria-modal="true">
        <div class="phone-settings-dialog-title">${escapeHtml(dialog.title || "")}</div>
        ${
          dialog.multiline
            ? `<textarea class="phone-settings-dialog-field" data-phone-text-dialog-field rows="4" placeholder="${escapeHtml(dialog.placeholder || "")}">${escapeHtml(dialog.draft ?? dialog.value ?? "")}</textarea>`
            : `<input class="phone-settings-dialog-field" data-phone-text-dialog-field type="text" placeholder="${escapeHtml(dialog.placeholder || "")}" value="${escapeHtml(dialog.draft ?? dialog.value ?? "")}" />`
        }
        ${dialog.statusMessage ? `<div class="phone-settings-dialog-status">${escapeHtml(dialog.statusMessage)}</div>` : ""}
        <div class="phone-settings-dialog-actions">
          ${
            dialog.clearLabel
              ? `<button type="button" class="phone-settings-dialog-button" data-phone-text-dialog-action="clear">${escapeHtml(dialog.clearLabel)}</button>`
              : ""
          }
          <button type="button" class="phone-settings-dialog-button" data-phone-text-dialog-action="cancel">${escapeHtml(dialog.cancelLabel || t("common.cancel", {}, "Cancel"))}</button>
          <button type="button" class="phone-settings-dialog-button is-primary" data-phone-text-dialog-action="save">${escapeHtml(dialog.saveLabel || t("common.save", {}, "Save"))}</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone settings screen markup. Reads `screen.visibleSections`/
 * `screen.model` (already populated by settingsScreen.js's existing `render()` prefix — see
 * that file's own comment above its phone guard clause) and calls `screen.renderSection(...)`
 * per section to build each card. */
export function renderSettingsScreenPhone(screen) {
  const sections = Array.isArray(screen.visibleSections) ? screen.visibleSections : [];
  const cardsHtml = sections.map((section) => renderSectionCard(screen, section)).join("");
  const dialogHtml = screen.optionDialog
    ? renderOptionDialogOverlay(screen)
    : screen.textDialog
      ? renderTextDialogOverlay(screen)
      : "";

  return `
    <div class="phone-settings-scroll" data-phone-settings-scroll>
      <header class="phone-settings-page-header">
        <h1 class="phone-settings-page-title">${escapeHtml(t("sidebar.settings", {}, "Settings"))}</h1>
      </header>
      <div class="phone-settings-cards">
        ${cardsHtml}
      </div>
      ${renderFooter()}
    </div>
    ${renderPhoneNavBar({ selectedRoute: "settings", profileState: screen.sidebarProfile })}
    ${dialogHtml}
  `;
}

/** Invokes `screen.actionMap.get(focusKey)()` (the exact same handler the TV click dispatcher
 * would call for this row) and then re-renders, mirroring `activateFocused()`'s own
 * `await action(); await this.render({ refreshModel: !isSectionToggle })` sequence — the one
 * piece of TV orchestration this module re-expresses rather than importing, since it's glue
 * around already-verbatim-reused calls, not settings business logic itself. */
async function dispatchRowAction(screen, focusKey, role) {
  const action = screen.actionMap.get(focusKey);
  if (typeof action !== "function") {
    return;
  }
  await action();
  if (Router.getCurrent() === "settings") {
    await screen.render({ refreshModel: role !== "section-toggle" });
  }
}

/** Mirrors `activateFocused()`'s option-dialog branch (single-choice/multi-choice), calling
 * only the dialog's own `onSelect`/`onToggle` callbacks and the screen's existing
 * `closeOptionDialog()` — never touching setting state directly. */
async function activateOptionDialogChoice(screen, option) {
  const dialog = screen.optionDialog;
  if (!dialog || !option) {
    return;
  }
  if (dialog.multiChoice) {
    const optionId = String(option.id);
    const selectedIds = new Set(dialog.selectedIds || []);
    if (selectedIds.has(optionId)) {
      selectedIds.delete(optionId);
    } else {
      selectedIds.add(optionId);
    }
    dialog.selectedIds = selectedIds;
    if (typeof dialog.onToggle === "function") {
      await dialog.onToggle(Array.from(selectedIds), option);
    }
    await screen.render();
    return;
  }
  if (typeof dialog.onSelect === "function") {
    const shouldClose = await dialog.onSelect(option);
    if (shouldClose === false) {
      await screen.render({ refreshModel: false });
      return;
    }
  }
  screen.closeOptionDialog();
  await screen.render();
}

function bindDialogEvents(screen, container) {
  const backdrop = container.querySelector("[data-phone-settings-dialog-backdrop]");
  if (!backdrop) {
    return () => {};
  }

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      if (screen.optionDialog) {
        screen.closeOptionDialog();
        void screen.render({ refreshModel: false });
      } else if (screen.textDialog) {
        screen.closeTextDialog();
        void screen.render({ refreshModel: false });
      }
    }
  };

  const optionButtons = Array.from(backdrop.querySelectorAll("[data-phone-dialog-option-index]"));
  optionButtons.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(button.dataset.phoneDialogOptionIndex || -1);
      const option = screen.optionDialog?.options?.[index];
      void activateOptionDialogChoice(screen, option);
    };
  });

  const field = backdrop.querySelector("[data-phone-text-dialog-field]");
  if (field && screen.textDialog) {
    field.oninput = (event) => {
      if (screen.textDialog) {
        screen.textDialog.draft = String(event.target?.value ?? "");
        screen.textDialog.statusMessage = "";
      }
    };
  }

  const textButtons = Array.from(backdrop.querySelectorAll("[data-phone-text-dialog-action]"));
  textButtons.forEach((button) => {
    button.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.phoneTextDialogAction;
      if (action === "save") {
        await screen.submitTextDialog();
        await screen.render();
        return;
      }
      if (action === "clear") {
        await screen.clearTextDialog();
        await screen.render();
        return;
      }
      screen.closeTextDialog();
      await screen.render({ refreshModel: false });
    };
  });

  return () => {
    backdrop.onclick = null;
    optionButtons.forEach((button) => {
      button.onclick = null;
    });
    textButtons.forEach((button) => {
      button.onclick = null;
    });
    if (field) {
      field.oninput = null;
    }
  };
}

/** Wires the phone settings screen's interactivity after `renderSettingsScreenPhone`'s markup
 * has been inserted into `container`. Returns a teardown function; also stored on
 * `screen._phoneSettingsTeardown` so `cleanupSettingsScreenPhone(screen)` can call it without
 * the caller needing to keep the reference itself. */
export function mountSettingsScreenPhone(screen, container) {
  cleanupSettingsScreenPhone(screen);

  const rowButtons = Array.from(container.querySelectorAll("[data-phone-focus-key]"));
  rowButtons.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      const focusKey = button.dataset.phoneFocusKey;
      const role = button.dataset.phoneRole || "";
      void dispatchRowAction(screen, focusKey, role);
    };
  });

  const detachDialog = bindDialogEvents(screen, container);
  const detachNavBar = bindPhoneNavBarEvents(container, {
    currentRoute: "settings",
    scrollRoot: container.querySelector("[data-phone-settings-scroll]")
  });

  const teardown = () => {
    rowButtons.forEach((button) => {
      button.onclick = null;
    });
    detachDialog();
    detachNavBar();
  };

  screen._phoneSettingsTeardown = teardown;
  return teardown;
}

/** Tears down whatever `mountSettingsScreenPhone` last wired up, if anything. Safe to call
 * when nothing is mounted (e.g. the screen has never rendered in phone mode). */
export function cleanupSettingsScreenPhone(screen) {
  screen._phoneSettingsTeardown?.();
  screen._phoneSettingsTeardown = null;
}
