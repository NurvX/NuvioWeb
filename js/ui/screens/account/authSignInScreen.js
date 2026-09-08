import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { I18n } from "../../../i18n/index.js";
import { h } from "preact";
import { AuthSignInScreenPhone } from "./authSignInScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

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
    this._unmountPhone = mountPreact(h(AuthSignInScreenPhone, { screen: this }), this.container);
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
