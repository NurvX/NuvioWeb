import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/account/authQrSignInScreen.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). `AuthQrSignInScreen`'s own markup-building step (inside
// `renderShell()`, extracted verbatim from the previous body of `mount()` — see that file's own
// comment) picks this template instead of the TV one when `Platform.isPhoneViewport()` is true.
//
// This is a visual-only rebuild: every element the rest of the screen's own code queries by id
// (`#qr-container`, `#qr-code-text`, `#qr-status`, `#qr-refresh-btn`, `#qr-back-btn`) keeps the
// exact same id, so `renderQr()`/`clearQr()`/`setStatus()`/`updateActionButtons()` and the
// `refreshButton.onclick`/`backButton.onclick` wiring `renderShell()` does right after this
// markup is inserted all keep working completely unmodified. The QR image/status/refresh/
// continue affordances are rebuilt as a centered card matching 05-01/05-03's shared
// `phone-auth-*`/`phone-qr-*` chrome instead of the TV two-panel layout.

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns the full phone QR sign-in screen markup, reading the same `screen.getLeftDescription()`/
 * `screen.getCardSubtitle()`/`screen.getBackButtonLabel()` helpers TV's own template already
 * calls. */
export function renderAuthQrSignInScreenPhone(screen) {
  return `
    <div class="phone-qr-shell" data-phone-qr-root>
      <div class="phone-qr-scroll" data-phone-qr-scroll>
        <img src="assets/brand/app_logo_wordmark.png" class="phone-auth-logo" alt="Nuvio" />
        <h2 class="phone-auth-title">${escapeHtml(I18n.t("auth.qr.title"))}</h2>
        <p class="phone-auth-subtitle">${escapeHtml(screen.getLeftDescription())}</p>

        <div class="phone-qr-card" aria-label="${escapeHtml(I18n.t("auth.qr.cardAriaLabel"))}">
          <p class="phone-auth-subtitle">${escapeHtml(screen.getCardSubtitle())}</p>
          <div id="qr-container" class="phone-qr-frame"></div>
          <div id="qr-code-text" class="phone-qr-code-text"></div>
          <div id="qr-status" class="phone-auth-status">${escapeHtml(I18n.t("auth.qr.waitingApproval"))}</div>
        </div>

        <div class="phone-auth-actions">
          <button type="button" id="qr-refresh-btn" class="phone-auth-action-btn is-primary">${escapeHtml(I18n.t("auth.qr.refresh"))}</button>
          <button type="button" id="qr-back-btn" class="phone-auth-action-btn">${escapeHtml(screen.getBackButtonLabel())}</button>
        </div>
      </div>
    </div>
  `;
}
