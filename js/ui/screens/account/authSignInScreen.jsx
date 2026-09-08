import { Fragment } from "preact";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { I18n } from "../../../i18n/index.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";

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

function AuthSignInScreenComponent({ screen }) {
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

export const AuthSignInScreen = {
  async mount() {
    this.container = document.getElementById("account");
    this.hasBackDestination = Router.stack.length > 0;
    this.textDialog = null;
    this.pendingEmail = "";
    this.errorMessage = "";
    ScreenUtils.show(this.container);
    this.render();
    this.onClickBound = this.onClick.bind(this);
    this.container.addEventListener("click", this.onClickBound);
  },

  render() {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(
      h(AuthSignInScreenComponent, { screen: this }),
      this.container
    );
    if (this.textDialog) {
      const input = this.container.querySelector("[data-action='textInput']");
      input?.focus?.();
    }
  },

  openEmailDialog() {
    this.errorMessage = "";
    this.textDialog = {
      step: "email",
      title: I18n.t("auth.signIn.emailPrompt"),
      value: this.pendingEmail || "",
      type: "text"
    };
    this.render();
  },

  openPasswordDialog(email) {
    this.pendingEmail = String(email || "").trim();
    this.textDialog = {
      step: "password",
      title: I18n.t("auth.signIn.passwordPrompt"),
      value: "",
      type: "password"
    };
    this.render();
  },

  async submitTextDialog() {
    const input = this.container.querySelector("[data-action='textInput']");
    const value = String(input?.value || "");
    if (this.textDialog?.step === "email") {
      if (value.trim()) {
        this.openPasswordDialog(value);
      }
      return;
    }
    if (this.textDialog?.step === "password") {
      const email = String(this.pendingEmail || "").trim();
      const password = value;
      this.textDialog = null;
      this.pendingEmail = "";
      this.render();
      if (email && password) {
        try {
          await AuthManager.signInWithEmail(email, password);
          Router.navigate("profileSelection");
        } catch (error) {
          console.error("SignIn failed", error);
          this.errorMessage = I18n.t(
            "auth.signIn.failed",
            {},
            { fallback: "Sign in failed. Check your email and password." }
          );
          this.render();
        }
      }
    }
  },

  async onClick(event) {
    const node = event.target.closest("[data-action]");
    if (!node) return;
    const action = node.dataset.action;
    if (action === "signIn") {
      this.openEmailDialog();
      return;
    }
    if (action === "back") {
      Router.back();
      return;
    }
    if (action === "cancelText") {
      this.textDialog = null;
      this.pendingEmail = "";
      this.render();
      return;
    }
    if (action === "saveText") {
      await this.submitTextDialog();
    }
  },

  consumeBackRequest() {
    if (this.textDialog) {
      this.textDialog = null;
      this.pendingEmail = "";
      this.render();
      return true;
    }
    return false;
  },

  cleanup() {
    this.textDialog = null;
    this.pendingEmail = "";
    this.container?.removeEventListener("click", this.onClickBound);
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
