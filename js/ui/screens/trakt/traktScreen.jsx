import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import { TraktAuthService } from "../../../data/repository/traktAuthService.js";
import { SimklAuthService } from "../../../data/repository/simklAuthService.js";
import { TraktSettingsStore } from "../../../data/local/traktSettingsStore.js";
import { I18n } from "../../../i18n/index.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function TraktPhoneContent({ screen: _screen }) {
  const trakt = TraktAuthService.getCurrentAuthState();
  const simkl = SimklAuthService.getCurrentAuthState();
  const settings = TraktSettingsStore.get();
  const traktConnected = TraktAuthService.isAuthenticated();
  const simklConnected = SimklAuthService.isAuthenticated();
  return (
    <div class="phone-detail-scroll" data-phone-detail-scroll>
      <header class="phone-detail-floating-header visible" data-phone-detail-floating-header>
        <button
          type="button"
          class="phone-detail-floating-back"
          data-phone-action="back"
          aria-label={t("common.back", {}, "Back")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="phone-detail-floating-title">
          {t("settings_tracking_title", {}, "Tracking")}
        </div>
      </header>
      <div class="phone-detail-body" style="padding-top:56px;">
        <p class="phone-detail-synopsis">
          {t(
            "settings_tracking_description",
            {},
            "Connect tracking providers and choose which one powers your Library and Continue Watching."
          )}
        </p>

        <div class="phone-settings-cards">
          <section class="phone-settings-card">
            <div class="phone-settings-card-header">
              <span class="phone-settings-card-title">
                {t("tracking_accounts_title", {}, "Accounts")}
              </span>
            </div>
            <div class="phone-settings-card-body">
              <div class="phone-settings-row" data-phone-action="toggleTrakt">
                <span class="phone-settings-row-icon material-icons">sync</span>
                <span class="phone-settings-row-copy">
                  <span class="phone-settings-row-title">
                    Trakt {traktConnected ? `(${trakt.username || "connected"})` : ""}
                  </span>
                  <span class="phone-settings-row-subtitle">
                    {traktConnected
                      ? t("tracking_status_connected", {}, "Connected")
                      : t("tracking_status_disconnected", {}, "Not connected")}
                  </span>
                </span>
                <span class="material-icons phone-settings-row-chevron">chevron_right</span>
              </div>
              <div class="phone-settings-row" data-phone-action="toggleSimkl">
                <span class="phone-settings-row-icon material-icons">sync</span>
                <span class="phone-settings-row-copy">
                  <span class="phone-settings-row-title">
                    Simkl {simklConnected ? `(${simkl.username || "connected"})` : ""}
                  </span>
                  <span class="phone-settings-row-subtitle">
                    {simklConnected
                      ? t("tracking_status_connected", {}, "Connected")
                      : t("tracking_status_disconnected", {}, "Not connected")}
                  </span>
                </span>
                <span class="material-icons phone-settings-row-chevron">chevron_right</span>
              </div>
              {!traktConnected ? (
                <button type="button" class="phone-detail-play" data-phone-action="connectTrakt">
                  {t("trakt_connect", {}, "Connect Trakt")}
                </button>
              ) : (
                <button
                  type="button"
                  class="phone-detail-play"
                  data-phone-action="disconnectTrakt"
                  style="background: var(--color-danger, #e36a8a);"
                >
                  {t("trakt_disconnect", {}, "Disconnect Trakt")}
                </button>
              )}
              {!simklConnected ? (
                <button
                  type="button"
                  class="phone-detail-play"
                  data-phone-action="connectSimkl"
                  style="margin-top:8px;"
                >
                  {t("simkl_connect", {}, "Connect Simkl")}
                </button>
              ) : (
                <button
                  type="button"
                  class="phone-detail-play"
                  data-phone-action="disconnectSimkl"
                  style="margin-top:8px; background: var(--color-danger, #e36a8a);"
                >
                  {t("simkl_disconnect", {}, "Disconnect Simkl")}
                </button>
              )}
            </div>
          </section>

          <section class="phone-settings-card">
            <div class="phone-settings-card-header">
              <span class="phone-settings-card-title">
                {t("tracking_sources_title", {}, "Sources")}
              </span>
            </div>
            <div class="phone-settings-card-body">
              <div class="phone-settings-row" data-phone-action="librarySource">
                <span class="phone-settings-row-copy">
                  <span class="phone-settings-row-title">
                    {t("trakt_library_source_title", {}, "Library source")}
                  </span>
                  <span class="phone-settings-row-subtitle">
                    {String(settings.librarySourceMode || "LOCAL")}
                  </span>
                </span>
                <span class="material-icons phone-settings-row-chevron">chevron_right</span>
              </div>
              <div class="phone-settings-row" data-phone-action="progressSource">
                <span class="phone-settings-row-copy">
                  <span class="phone-settings-row-title">
                    {t("trakt_watch_progress_source_title", {}, "Watch progress source")}
                  </span>
                  <span class="phone-settings-row-subtitle">
                    {String(settings.watchProgressSource || "NUVIO_SYNC")}
                  </span>
                </span>
                <span class="material-icons phone-settings-row-chevron">chevron_right</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export const TraktScreen = {
  async mount() {
    this.container = document.getElementById("trakt");
    ScreenUtils.show(this.container);
    this._unmountPhone = null;
    this.render();
  },

  render() {
    if (!this.container) return;
    if (this._unmountPhone) this._unmountPhone();
    this.container.innerHTML = `<div data-phone-mount-root></div>`;
    const root = this.container.querySelector("[data-phone-mount-root]");
    this._unmountPhone = mountPreact(h(TraktPhoneContent, { screen: this }), root);
    this.bindEvents();
  },

  bindEvents() {
    this.container.querySelectorAll("[data-phone-action='back']").forEach((b) => {
      b.onclick = (e) => {
        e?.preventDefault?.();
        Router.back();
      };
    });
    this.container.querySelectorAll("[data-phone-action='connectTrakt']").forEach((b) => {
      b.onclick = async () => {
        try {
          await TraktAuthService.startDeviceAuth();
        } catch (e) {
          console.warn("Trakt connect failed", e);
        }
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='disconnectTrakt']").forEach((b) => {
      b.onclick = async () => {
        await TraktAuthService.disconnect();
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='connectSimkl']").forEach((b) => {
      b.onclick = async () => {
        try {
          await SimklAuthService.startPinAuth();
        } catch (e) {
          console.warn("Simkl connect failed", e);
        }
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='disconnectSimkl']").forEach((b) => {
      b.onclick = async () => {
        await SimklAuthService.disconnect();
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='librarySource']").forEach((b) => {
      b.onclick = () => {
        const cur = TraktSettingsStore.get().librarySourceMode;
        const next = cur === "TRAKT" ? "LOCAL" : cur === "SIMKL" ? "TRAKT" : "SIMKL";
        TraktSettingsStore.setLibrarySourceMode(next);
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='progressSource']").forEach((b) => {
      b.onclick = () => {
        const cur = TraktSettingsStore.get().watchProgressSource;
        const next = cur === "TRAKT" ? "NUVIO_SYNC" : cur === "SIMKL" ? "TRAKT" : "SIMKL";
        TraktSettingsStore.setWatchProgressSource(next);
        this.render();
      };
    });
  },

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
