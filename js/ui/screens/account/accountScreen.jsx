import { AuthManager } from "../../../core/auth/authManager.js";
import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function ChevronIcon() {
  return (
    <svg
      class="phone-settings-row-chevron"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m9 6 6 6-6 6"
      />
    </svg>
  );
}

function initialFor(email) {
  const trimmed = String(email || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function Shell({ children }) {
  return (
    <div class="phone-account-screen" data-phone-account-root>
      <div class="phone-account-scroll" data-phone-account-scroll>
        <header class="phone-settings-page-header">
          <h1 class="phone-settings-page-title">{I18n.t("auth.account.title")}</h1>
        </header>
        <div class="phone-settings-cards">
          <section class="phone-settings-card">
            <div class="phone-settings-card-body">{children}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LoadingBody() {
  return (
    <Shell>
      <div class="phone-settings-row phone-settings-row-info">
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">
          sync
        </span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">{I18n.t("auth.account.loadingAccount")}</span>
        </span>
      </div>
    </Shell>
  );
}

function SignedOutBody() {
  return (
    <Shell>
      <button
        type="button"
        class="phone-settings-row phone-settings-row-action focusable"
        data-action="signin"
      >
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">
          login
        </span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">{I18n.t("auth.account.signIn")}</span>
          <span class="phone-settings-row-subtitle">{I18n.t("auth.account.signInSubtitle")}</span>
        </span>
        <ChevronIcon />
      </button>
    </Shell>
  );
}

function AuthenticatedBody({ screen }) {
  const email = screen.state.email || I18n.t("common.unknownUser");
  return (
    <Shell>
      <div class="phone-settings-row phone-settings-row-info phone-account-identity-row">
        <span class="phone-account-avatar" aria-hidden="true">
          {initialFor(email)}
        </span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-subtitle">
            {t("auth.account.signedInAs", {}, "Signed in as")}
          </span>
          <span class="phone-settings-row-title">{email}</span>
        </span>
      </div>
      <button
        type="button"
        class="phone-settings-row phone-settings-row-action focusable"
        data-action="logout"
      >
        <span class="phone-settings-row-icon material-icons is-danger" aria-hidden="true">
          logout
        </span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title is-danger">{I18n.t("auth.account.signOut")}</span>
        </span>
      </button>
    </Shell>
  );
}

function AccountScreenComponent({ screen }) {
  if (screen.state.authState === "loading") {
    return <LoadingBody />;
  }
  if (screen.state.authState === "signedOut") {
    return <SignedOutBody />;
  }
  return <AuthenticatedBody screen={screen} />;
}

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
    this._unmountPhone = mountPreact(h(AccountScreenComponent, { screen: this }), this.container);
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
