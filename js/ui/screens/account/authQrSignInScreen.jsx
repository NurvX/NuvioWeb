import { Router } from "../../navigation/router.js";
import { QrLoginService } from "../../../core/auth/qrLoginService.js";
import { LocalStore } from "../../../core/storage/localStore.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { I18n } from "../../../i18n/index.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";

let pollInterval = null;
let countdownInterval = null;
let activeQrSessionId = 0;
const GUEST_QR_BYPASS_KEY = "skipAuthQrGate";

function AuthQrSignInScreenComponent({ screen }) {
  return (
    <div class="phone-qr-shell" data-phone-qr-root>
      <div class="phone-qr-scroll" data-phone-qr-scroll>
        <img src="assets/brand/app_logo_wordmark.png" class="phone-auth-logo" alt="Nuvio" />
        <h2 class="phone-auth-title">{I18n.t("auth.qr.title")}</h2>
        <p class="phone-auth-subtitle">{screen.getLeftDescription()}</p>

        <div class="phone-qr-card" aria-label={I18n.t("auth.qr.cardAriaLabel")}>
          <p class="phone-auth-subtitle">{screen.getCardSubtitle()}</p>
          <div id="qr-container" class="phone-qr-frame"></div>
          <div id="qr-code-text" class="phone-qr-code-text"></div>
          <div id="qr-status" class="phone-auth-status">
            {I18n.t("auth.qr.waitingApproval")}
          </div>
        </div>

        <div class="phone-auth-actions">
          <button type="button" id="qr-refresh-btn" class="phone-auth-action-btn is-primary">
            {I18n.t("auth.qr.refresh")}
          </button>
          <button type="button" id="qr-back-btn" class="phone-auth-action-btn">
            {screen.getBackButtonLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}

export const AuthQrSignInScreen = {
  async mount({ onboardingMode = false } = {}) {
    this.container = document.getElementById("account");
    this.onboardingMode = Boolean(onboardingMode);
    this.isSignedIn = AuthManager.isAuthenticated;
    this.hasBackDestination = Router.stack.length > 0;
    this.isMounted = true;
    this.isStartingQr = false;
    this.isLeaving = false;
    ScreenUtils.show(this.container);
    this.renderShell();
    await this.startQr();
  },

  renderShell() {
    if (!this.container) {
      return;
    }
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(
      h(AuthQrSignInScreenComponent, { screen: this }),
      this.container
    );

    this.refreshButton = this.container.querySelector("#qr-refresh-btn");
    this.backButton = this.container.querySelector("#qr-back-btn");
    if (this.refreshButton) {
      this.refreshButton.onclick = () => {
        this.handleRefreshAction();
      };
    }
    if (this.backButton) {
      this.backButton.onclick = () => {
        this.handleContinueAction();
      };
    }
  },

  async startQr() {
    if (!this.isMounted || this.isLeaving || this.isStartingQr) {
      return;
    }
    this.isStartingQr = true;
    this.updateActionButtons();
    this.stopIntervals();
    const sessionId = activeQrSessionId + 1;
    activeQrSessionId = sessionId;
    this.clearQr();
    this.setStatus(I18n.t("auth.qr.preparing"));

    try {
      const result = await QrLoginService.start();
      if (!this.isMounted || sessionId !== activeQrSessionId) {
        return;
      }

      if (!result) {
        const raw = QrLoginService.getLastError();
        this.setStatus(this.toFriendlyQrError(raw));
        return;
      }

      this.renderQr(result);
      this.setStatus(I18n.t("auth.qr.scanAndSignIn"));
      this.startPolling(
        result.code,
        result.deviceNonce,
        result.pollIntervalSeconds || 3,
        sessionId
      );
    } finally {
      if (this.isMounted && sessionId === activeQrSessionId) {
        this.isStartingQr = false;
        this.updateActionButtons();
      }
    }
  },

  renderQr({ qrImageUrl, code }) {
    const qrContainer = this.container?.querySelector("#qr-container");
    const codeText = this.container?.querySelector("#qr-code-text");

    if (!qrContainer || !codeText) {
      return;
    }

    qrContainer.innerHTML = `
      <img src="${qrImageUrl}" class="qr-image" alt="${I18n.t("auth.qr.qrImageAlt")}" />
    `;

    codeText.innerText = I18n.t("auth.qr.codeLabel", { code });
  },

  clearQr() {
    const qrContainer = this.container?.querySelector("#qr-container");
    const codeText = this.container?.querySelector("#qr-code-text");
    if (qrContainer) {
      qrContainer.innerHTML = "";
    }
    if (codeText) {
      codeText.innerText = "";
    }
  },

  startCountdown(expiresAt) {
    const renderRemaining = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        return;
      }
    };

    renderRemaining();
    countdownInterval = setInterval(renderRemaining, 1000);
  },

  startPolling(code, deviceNonce, pollIntervalSeconds = 3, sessionId) {
    pollInterval = setInterval(
      async () => {
        const status = await QrLoginService.poll(code, deviceNonce);
        if (!this.isMounted || sessionId !== activeQrSessionId) {
          return;
        }

        if (status === "approved") {
          this.setStatus(I18n.t("auth.qr.approved"));
          clearInterval(pollInterval);
          pollInterval = null;

          const exchange = await QrLoginService.exchange(code, deviceNonce);
          if (sessionId !== activeQrSessionId) {
            return;
          }

          if (exchange) {
            LocalStore.remove(GUEST_QR_BYPASS_KEY);
            LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
            this.isSignedIn = true;
            Router.navigate("profileSelection");
          } else {
            this.setStatus(this.toFriendlyQrError(QrLoginService.getLastError()));
          }
        }

        if (status === "pending") {
          this.setStatus(I18n.t("auth.qr.waitingApproval"));
        }

        if (status === "expired") {
          this.setStatus(I18n.t("auth.qr.expired"));
        }
      },
      Math.max(2, Number(pollIntervalSeconds || 3)) * 1000
    );
  },

  toFriendlyQrError(rawError) {
    const normalizedError = String(rawError || "")
      .replace(/\s+/g, " ")
      .trim();
    const conciseReason =
      normalizedError.length > 160 ? `${normalizedError.slice(0, 157)}...` : normalizedError;
    const message = normalizedError.toLowerCase();
    if (!message) {
      return I18n.t("auth.qr.unavailable");
    }
    if (
      message.includes("qr auth is not configured") ||
      message.includes("missing redirect_base_url configuration") ||
      message.includes("apikey") ||
      message.includes("api key") ||
      message.includes("anon key")
    ) {
      return I18n.t("auth.qr.notConfigured");
    }
    if (message.includes("invalid tv login redirect base url")) {
      return I18n.t("auth.qr.invalidRedirect");
    }
    if (
      message.includes("start_tv_login_session") &&
      message.includes("could not find the function")
    ) {
      return I18n.t("auth.qr.missingFunction");
    }
    if (message.includes("gen_random_bytes") && message.includes("does not exist")) {
      return I18n.t("auth.qr.missingExtension");
    }
    if (message.includes("network") || message.includes("failed to fetch")) {
      return I18n.t("auth.qr.networkError");
    }
    if (
      message.includes("unsupported method") ||
      message.includes("error response") ||
      message.includes("http 5") ||
      message.includes("http 404") ||
      message.includes("http 405")
    ) {
      return I18n.t("auth.qr.serviceUnavailable");
    }
    return I18n.t("auth.qr.unavailableWithReason", { reason: conciseReason });
  },

  setStatus(text) {
    const statusNode = this.container?.querySelector("#qr-status");
    if (!statusNode) {
      return;
    }
    statusNode.innerText = text;
  },

  updateActionButtons() {
    const refreshButton = this.refreshButton || this.container?.querySelector("#qr-refresh-btn");
    const backButton = this.backButton || this.container?.querySelector("#qr-back-btn");
    const disabled = Boolean(this.isLeaving || this.isStartingQr);
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.disabled = disabled;
      refreshButton.setAttribute("aria-busy", this.isStartingQr ? "true" : "false");
    }
    if (backButton instanceof HTMLButtonElement) {
      backButton.disabled = Boolean(this.isLeaving);
    }
  },

  handleRefreshAction() {
    if (this.isLeaving || this.isStartingQr) {
      return;
    }
    this.startQr();
  },

  handleContinueAction() {
    if (this.isLeaving) {
      return;
    }
    this.isLeaving = true;
    this.updateActionButtons();
    LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
    if (!this.isSignedIn) {
      LocalStore.set(GUEST_QR_BYPASS_KEY, true);
    } else {
      LocalStore.remove(GUEST_QR_BYPASS_KEY);
    }
    this.cleanup();
    if (this.hasBackDestination && this.isSignedIn) {
      Router.back();
      return;
    }
    Router.navigate(
      "home",
      {},
      {
        replaceHistory: true,
        skipStackPush: true
      }
    );
  },

  getLeftDescription() {
    if (this.isSignedIn) {
      return I18n.t("auth.qr.leftDescriptionSignedIn");
    }
    return I18n.t("auth.qr.leftDescriptionSignedOut");
  },

  getCardSubtitle() {
    if (this.isSignedIn) {
      return I18n.t("auth.qr.cardSubtitleSignedIn");
    }
    return I18n.t("auth.qr.cardSubtitleSignedOut");
  },

  getBackButtonLabel() {
    if (this.isSignedIn) {
      return I18n.t("auth.qr.continue");
    }
    return I18n.t("auth.qr.continueWithoutAccount");
  },

  consumeBackRequest() {
    this.handleContinueAction();
    return true;
  },

  stopIntervals() {
    if (pollInterval) clearInterval(pollInterval);
    if (countdownInterval) clearInterval(countdownInterval);
    pollInterval = null;
    countdownInterval = null;
  },

  cleanup() {
    this.isMounted = false;
    activeQrSessionId += 1;
    this.stopIntervals();
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    if (this.refreshButton) {
      this.refreshButton.onclick = null;
      this.refreshButton = null;
    }
    if (this.backButton) {
      this.backButton.onclick = null;
      this.backButton = null;
    }
    ScreenUtils.hide(this.container);
    this.container = null;
  }
};
