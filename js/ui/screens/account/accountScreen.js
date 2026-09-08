import { AuthManager } from "../../../core/auth/authManager.js";
import { Router } from "../../navigation/router.js";
import { h } from "preact";
import { AccountScreenPhone } from "./accountScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

export const AccountScreen = {
  async mount() {
    this.container = document.getElementById("account");
    this.container.style.display = "block";
    this.state = {
      authState: AuthManager.getAuthState(),
      email: null,
      linkedDevices: []
    };

    this.unsubscribe = AuthManager.subscribe((state) => {
      this.state.authState = state;
      this.render();
    });

    this.render();
  },

  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }

    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  },

  async signOut() {
    await AuthManager.signOut();
    Router.navigate("authSignIn");
  },

  render() {
    if (!this.container) {
      return;
    }
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(AccountScreenPhone, { screen: this }), this.container);
  },

  onPointerActivate(target) {
    const actionTarget = target?.closest?.("[data-action]");
    const action = String(actionTarget?.dataset?.action || "");
    if (action === "signin") {
      Router.navigate("authSignIn");
      return true;
    }
    if (action === "logout") {
      this.signOut();
      return true;
    }
    return false;
  }
};
