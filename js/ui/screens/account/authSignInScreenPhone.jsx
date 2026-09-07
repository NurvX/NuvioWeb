import { Fragment } from "preact";
import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/account/authSignInScreen.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). authSignInScreen.js's own `render()` mounts this Preact
// component via `mountPreact()` when `Platform.isPhoneViewport()` is true — all markup for the
// phone layout lives here.
//
// This is a visual-only rebuild: every element keeps the exact same `data-action` attribute
// the existing TV markup used (`signIn`/`back`/`textInput`/`saveText`/`cancelText`), so
// `AuthSignInScreen`'s own container-level `click` listener (`this.onClick`, bound once in
// `mount()`, which reads `event.target.closest("[data-action]")`) keeps dispatching every tap
// exactly as it already did — Preact renders real DOM nodes into the same container, so nothing
// here re-implements or touches that dispatch, and no `.focusable` class is needed since that
// listener never goes through FocusEngine's `.focusable`-gated pointer dispatch. The text dialog
// overlay (email/password prompt) reuses the `phone-settings-dialog*` chrome from 05-01 for
// visual consistency with the rest of the phone settings/account surface.

function TextDialog({ dialog }) {
  if (!dialog) {
    return null;
  }
  return (
    <div class="phone-settings-dialog-backdrop">
      <div class="phone-settings-dialog" role="dialog" aria-modal="true">
        <div class="phone-settings-dialog-title">{dialog.title || ""}</div>
        <input
          class="phone-settings-dialog-field"
          data-action="textInput"
          type={dialog.type === "password" ? "password" : "text"}
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          value={dialog.value || ""}
        />
        <div class="phone-settings-dialog-actions">
          <button type="button" class="phone-settings-dialog-button" data-action="cancelText">
            {I18n.t("common.cancel", {}, { fallback: "Cancel" })}
          </button>
          <button
            type="button"
            class="phone-settings-dialog-button is-primary"
            data-action="saveText"
          >
            {I18n.t("common.save", {}, { fallback: "Save" })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reads `screen.hasBackDestination`/`screen.errorMessage`/`screen.textDialog` directly (the
 * exact same state TV's own `render()` reads). */
export function AuthSignInScreenPhone({ screen }) {
  return (
    <Fragment>
      <div class="phone-auth-shell" data-phone-auth-root>
        <div class="phone-auth-scroll" data-phone-auth-scroll>
          <img src="assets/brand/app_logo_wordmark.png" class="phone-auth-logo" alt="Nuvio" />
          <h2 class="phone-auth-title">{I18n.t("auth.signIn.title")}</h2>
          <p class="phone-auth-subtitle">{I18n.t("auth.signIn.description")}</p>
          <div class="phone-auth-actions">
            <button type="button" class="phone-auth-action-btn is-primary" data-action="signIn">
              {I18n.t("auth.signIn.openQrLogin")}
            </button>
            {screen.hasBackDestination ? (
              <button type="button" class="phone-auth-action-btn" data-action="back">
                {I18n.t("auth.signIn.back")}
              </button>
            ) : null}
          </div>
          {screen.errorMessage ? <p class="phone-auth-error">{screen.errorMessage}</p> : null}
        </div>
      </div>
      <TextDialog dialog={screen.textDialog} />
    </Fragment>
  );
}
