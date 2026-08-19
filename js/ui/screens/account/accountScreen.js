import { AuthManager } from "../../../core/auth/authManager.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { I18n } from "../../../i18n/index.js";
import { Platform } from "../../../platform/index.js";
import { renderAccountScreenPhone } from "./accountScreenPhone.js";

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

    // Re-render live when the viewport crosses the phone breakpoint (00-07) so this screen
    // flips between its TV and phone render paths without needing a full navigation.
    this.phoneViewportUnsubscribe?.();
    this.phoneViewportUnsubscribe = Platform.watchPhoneViewport(() => this.render());

    this.render();
  },

  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.phoneViewportUnsubscribe?.();
    this.phoneViewportUnsubscribe = null;

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

    // Phone render path (ticket 05-03, mobile-parity epic) — all markup lives in
    // js/ui/screens/account/accountScreenPhone.js; this just hands it the screen instance so
    // it can read this.state directly, same as the TV branches below.
    if (Platform.isPhoneViewport()) {
      return this.renderPhone();
    }

    if (this.state.authState === "loading") {
      this.container.innerHTML = `<div class="account-shell"><h2 class="account-title">${I18n.t("auth.account.loadingAccount")}</h2></div>`;
      return;
    }

    if (this.state.authState === "signedOut") {
      this.container.innerHTML = `
        <div class="account-shell">
          <h1 class="account-title">${I18n.t("auth.account.title")}</h1>
          <p class="account-subtitle">${I18n.t("auth.account.signInCopy")}</p>
          <div class="account-card focusable" data-action="signin">
            <h3 class="account-card-title">${I18n.t("auth.account.signIn")}</h3>
            <p class="account-card-subtitle">${I18n.t("auth.account.signInSubtitle")}</p>
          </div>
        </div>
      `;
      this.attachFocus();
      return;
    }

    this.container.innerHTML = `
      <div class="account-shell">
        <h1 class="account-title">${I18n.t("auth.account.title")}</h1>
        <div class="account-info">
          <span>${I18n.t("auth.account.signedInAs")}</span>
          <strong>${this.state.email || I18n.t("common.unknownUser")}</strong>
        </div>
        <div class="account-card account-card-danger focusable" data-action="logout">${I18n.t("auth.account.signOut")}</div>
      </div>
    `;
    this.attachFocus();
  },

  // Phone render path (ticket 05-03, mobile-parity epic). The phone markup keeps the same
  // `.focusable`/`data-action` contract the TV markup already used, so this only needs to
  // (re)index focusables the same way TV does — `onPointerActivate` below is already generic
  // over any markup carrying `data-action`, so it needs no phone-specific branch.
  renderPhone() {
    this.container.innerHTML = renderAccountScreenPhone(this);
    this.attachFocus();
  },

  attachFocus() {
    const focusables = this.container.querySelectorAll(".focusable");
    focusables.forEach((el, index) => {
      el.dataset.index = String(index);
    });
    focusables[0]?.classList.add("focused");
  },

  onKeyDown(event) {
    if (ScreenUtils.handleDpadNavigation(event, this.container)) {
      return;
    }

    const current = this.container?.querySelector(".focused");

    if (event.keyCode === 13 && current) {
      const action = current.dataset.action;
      if (action === "signin") {
        Router.navigate("authSignIn");
      }
      if (action === "logout") {
        this.signOut();
      }
    }
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
