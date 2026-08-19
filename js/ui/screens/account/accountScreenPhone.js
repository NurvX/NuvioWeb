import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/account/accountScreen.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). accountScreen.js's own `render()` only gets a guard clause
// that dispatches to `renderPhone()` here when `Platform.isPhoneViewport()` is true — all
// markup for the phone layout lives in this module.
//
// This is a visual-only rebuild: every row still carries the exact same `data-action`/
// `focusable` contract the existing TV markup used, so `AccountScreen.onPointerActivate`
// (already wired for touch by a prior, separate effort) keeps dispatching through
// `FocusEngine.handlePointerClick` -> `getPointerFocusable` (which requires a `.focusable`
// ancestor) exactly as it already does for the TV cards — nothing here re-implements or
// touches that dispatch. Rows reuse the `phone-settings-card`/`phone-settings-row*` family
// from 05-01 for the card/list chrome, and the signed-in identity row gets a small round
// avatar chip matching 05-02's profile-card avatar language (initial-letter, accent-colored).

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

function initialFor(email) {
  const trimmed = String(email || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function renderShell(bodyHtml) {
  return `
    <div class="phone-account-screen" data-phone-account-root>
      <div class="phone-account-scroll" data-phone-account-scroll>
        <header class="phone-settings-page-header">
          <h1 class="phone-settings-page-title">${escapeHtml(I18n.t("auth.account.title"))}</h1>
        </header>
        <div class="phone-settings-cards">
          <section class="phone-settings-card">
            <div class="phone-settings-card-body">${bodyHtml}</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderLoading() {
  return renderShell(`
    <div class="phone-settings-row phone-settings-row-info">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">sync</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(I18n.t("auth.account.loadingAccount"))}</span>
      </span>
    </div>
  `);
}

function renderSignedOut() {
  return renderShell(`
    <button type="button" class="phone-settings-row phone-settings-row-action focusable"
            data-action="signin">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">login</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(I18n.t("auth.account.signIn"))}</span>
        <span class="phone-settings-row-subtitle">${escapeHtml(I18n.t("auth.account.signInSubtitle"))}</span>
      </span>
      ${chevronSvg()}
    </button>
  `);
}

function renderAuthenticated(screen) {
  const email = screen.state.email || I18n.t("common.unknownUser");
  return renderShell(`
    <div class="phone-settings-row phone-settings-row-info phone-account-identity-row">
      <span class="phone-account-avatar" aria-hidden="true">${escapeHtml(initialFor(email))}</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-subtitle">${escapeHtml(t("auth.account.signedInAs", {}, "Signed in as"))}</span>
        <span class="phone-settings-row-title">${escapeHtml(email)}</span>
      </span>
    </div>
    <button type="button" class="phone-settings-row phone-settings-row-action focusable"
            data-action="logout">
      <span class="phone-settings-row-icon material-icons is-danger" aria-hidden="true">logout</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title is-danger">${escapeHtml(I18n.t("auth.account.signOut"))}</span>
      </span>
    </button>
  `);
}

/** Returns the full phone account screen markup for whichever of the three states
 * (`screen.state.authState`) is currently active — the same three states TV's own `render()`
 * already branches on. */
export function renderAccountScreenPhone(screen) {
  if (screen.state.authState === "loading") {
    return renderLoading();
  }
  if (screen.state.authState === "signedOut") {
    return renderSignedOut();
  }
  return renderAuthenticated(screen);
}
