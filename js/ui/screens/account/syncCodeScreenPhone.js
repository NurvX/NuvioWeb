import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/account/syncCodeScreen.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). syncCodeScreen.js's own `render()` only gets a guard clause
// that dispatches to `renderPhone()` here when `Platform.isPhoneViewport()` is true — all
// markup for the phone layout lives in this module.
//
// This is a visual-only rebuild: every element keeps the exact same `data-action` attribute
// the existing TV markup used (`setCode`/`clearCode`/`back`/`textInput`/`saveText`/
// `cancelText`) plus the `.focusable` class, so `SyncCodeScreen.onPointerActivate` (already
// wired for touch by a prior, separate effort) keeps dispatching through
// `FocusEngine.handlePointerClick` -> `getPointerFocusable` (which requires a `.focusable`
// ancestor) exactly as it already does for the TV cards — nothing here re-implements or
// touches that dispatch. The action list and text dialog reuse the shared `phone-auth-*`/
// `phone-settings-dialog*` chrome introduced for 05-03's sign-in screen for visual consistency.

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTextDialog(value) {
  return `
    <div class="phone-settings-dialog-backdrop">
      <div class="phone-settings-dialog" role="dialog" aria-modal="true">
        <div class="phone-settings-dialog-title">${escapeHtml(I18n.t("auth.syncCode.prompt"))}</div>
        <input class="phone-settings-dialog-field"
               data-action="textInput"
               type="text"
               autocomplete="off"
               autocapitalize="none"
               spellcheck="false"
               value="${escapeHtml(value)}" />
        <div class="phone-settings-dialog-actions">
          <button type="button" class="phone-settings-dialog-button" data-action="cancelText">${escapeHtml(I18n.t("common.cancel", {}, { fallback: "Cancel" }))}</button>
          <button type="button" class="phone-settings-dialog-button is-primary" data-action="saveText">${escapeHtml(I18n.t("common.save", {}, { fallback: "Save" }))}</button>
        </div>
      </div>
    </div>
  `;
}

/** Returns the full phone sync-code screen markup, reading `screen.textDialog` and the current
 * stored code (`value`, passed in verbatim by `syncCodeScreen.js`'s own `render()`) — the exact
 * same state TV's own `render()` reads. */
export function renderSyncCodeScreenPhone(screen, value) {
  return `
    <div class="phone-auth-shell" data-phone-auth-root>
      <div class="phone-auth-scroll" data-phone-auth-scroll>
        <h2 class="phone-auth-title">${escapeHtml(I18n.t("auth.syncCode.title"))}</h2>
        <p class="phone-auth-subtitle">${escapeHtml(I18n.t("auth.syncCode.currentCode", { value: value || I18n.t("auth.syncCode.emptyValue") }))}</p>
        <div class="phone-auth-actions">
          <button type="button" class="phone-auth-action-btn is-primary focusable" data-action="setCode">${escapeHtml(I18n.t("auth.syncCode.setCode"))}</button>
          <button type="button" class="phone-auth-action-btn focusable" data-action="clearCode">${escapeHtml(I18n.t("auth.syncCode.clearCode"))}</button>
          <button type="button" class="phone-auth-action-btn focusable" data-action="back">${escapeHtml(I18n.t("auth.syncCode.back"))}</button>
        </div>
      </div>
    </div>
    ${screen.textDialog ? renderTextDialog(value) : ""}
  `;
}
