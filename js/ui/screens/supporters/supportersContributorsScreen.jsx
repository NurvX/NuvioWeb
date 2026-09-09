import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import { I18n } from "../../../i18n/index.js";
import {
  DONATIONS_BASE_URL,
  DONATIONS_DONATE_URL,
  SPONSOR_NAMES,
  UNIQUE_CONTRIBUTIONS_BASE_URL
} from "../../../config.js";
import { QrCodeGenerator } from "../../../core/qr/qrCodeGenerator.js";
import {
  normalizeContributors,
  normalizeSupporterDonations,
  parseSponsorNames
} from "./supportersData.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function PhoneSupportersContent({ screen }) {
  const state = screen.state || {};
  const tab = screen.selectedTab || "contributors";
  const tabState = state[tab] || { items: [], loading: false, error: null };
  const donateUrl = String(DONATIONS_DONATE_URL || "https://ko-fi.com/tapframe").trim();
  return (
    <>
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
            {t("supporters_contributors_title", {}, "Supporters & Contributors")}
          </div>
        </header>
        <div class="phone-detail-hero" style="min-height:160px; padding-top:56px;">
          <div class="phone-detail-hero-content">
            <img
              src="assets/brand/app_logo_wordmark.png"
              alt="Nuvio"
              style="height:32px; margin-bottom:8px;"
            />
            <p class="phone-detail-synopsis">
              {t(
                "supporters_contributors_donate_copy",
                {},
                "Nuvio will stay free and open source. If you want to support the project, you can help cover time and infrastructure."
              )}
            </p>
            <button
              type="button"
              class="phone-detail-play"
              data-phone-action="showDonateQr"
              style="margin-top:12px;"
            >
              {t("supporters_contributors_donate_button", {}, "Donate to Nuvio")}
            </button>
          </div>
        </div>
        <div class="phone-detail-body">
          <div class="phone-detail-season-chips" data-phone-supporters-tabs>
            {["contributors", "supporters", "sponsors"].map((k) => (
              <button
                key={k}
                type="button"
                class={`phone-detail-season-chip${tab === k ? " selected" : ""}`}
                data-phone-tab={k}
              >
                {k === "contributors"
                  ? t("contributors_tab", {}, "Contributors")
                  : k === "supporters"
                    ? t("supporters_tab", {}, "Supporters")
                    : t("sponsors_tab", {}, "Sponsors")}
              </button>
            ))}
          </div>
          {tabState.loading ? (
            <p class="phone-detail-synopsis">{t("common.loading", {}, "Loading")}</p>
          ) : tabState.error ? (
            <div class="phone-settings-card">
              <div class="phone-settings-card-body">
                <p>{tabState.error}</p>
                <button type="button" class="phone-detail-play" data-phone-action="retry">
                  {t("action_retry", {}, "Retry")}
                </button>
              </div>
            </div>
          ) : !tabState.items?.length ? (
            <p class="phone-detail-synopsis">{t("supporters_empty", {}, "No items found.")}</p>
          ) : (
            <div class="phone-settings-cards">
              {tabState.items.slice(0, 30).map((item, idx) => (
                <section class="phone-settings-card" key={`${tab}-${idx}`}>
                  <div class="phone-settings-card-header">
                    <span class="phone-settings-card-title">
                      {item.name || item.login || "Unknown"}
                    </span>
                    {item.message ? (
                      <span class="phone-settings-card-subtitle">{item.message}</span>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      {screen.showDonateQr ? (
        <div class="addons-qr-overlay" data-phone-action="hideDonateQr">
          <div class="phone-qr-card" onClick={(e) => e.stopPropagation()}>
            <p class="phone-qr-code-text">
              {t("supporters_contributors_qr_title", {}, "Scan to donate")}
            </p>
            <div class="phone-qr-frame">
              <canvas
                class="supporters-donate-qr"
                width="220"
                height="220"
                aria-label="QR"
                data-qr-content={donateUrl}
              />
            </div>
            <button type="button" class="phone-auth-action-btn" data-phone-action="hideDonateQr">
              {t("supporters_contributors_back_button", {}, "Back")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export const SupportersContributorsScreen = {
  async mount() {
    this.container = document.getElementById("supportersContributors");
    ScreenUtils.show(this.container);
    this.selectedTab = this.selectedTab || "contributors";
    this.showDonateQr = false;
    this.state = this.state || {
      supporters: { loading: false, loaded: false, items: [], error: null },
      sponsors: { loading: false, loaded: false, items: [], error: null },
      contributors: { loading: false, loaded: false, items: [], error: null }
    };
    this._unmountPhone = null;
    await this.render();
    void this.loadTabIfNeeded(this.selectedTab);
  },

  async loadTabIfNeeded(tab) {
    const tabState = this.state?.[tab];
    if (!tabState || tabState.loading || tabState.loaded) return;
    tabState.loading = true;
    this.render();
    try {
      let result;
      if (tab === "supporters") {
        const base = String(DONATIONS_BASE_URL || "")
          .trim()
          .replace(/\/+$/, "");
        if (!base) throw new Error("Donations API not configured");
        const res = await fetch(`${base}/api/donations?view=recent`, {
          headers: { Accept: "application/json" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        result = normalizeSupporterDonations(data?.donations);
      } else if (tab === "sponsors") {
        result = parseSponsorNames(SPONSOR_NAMES);
      } else {
        const base = String(UNIQUE_CONTRIBUTIONS_BASE_URL || "")
          .trim()
          .replace(/\/+$/, "");
        if (!base) throw new Error("Contributors API not configured");
        const res = await fetch(`${base}/api/unique-contributions`, {
          headers: { Accept: "application/json" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        result = normalizeContributors(data?.contributors);
      }
      tabState.items = result || [];
      tabState.loaded = true;
      tabState.error = null;
    } catch (e) {
      tabState.error = e?.message || String(e);
      tabState.loaded = false;
    } finally {
      tabState.loading = false;
      if (Router.getCurrent() === "supportersContributors") this.render();
    }
  },

  async selectTab(tab) {
    if (!["supporters", "sponsors", "contributors"].includes(tab)) return;
    this.selectedTab = tab;
    await this.render();
    void this.loadTabIfNeeded(tab);
  },

  render() {
    if (!this.container) return;
    if (this._unmountPhone) this._unmountPhone();
    this.container.innerHTML = `<div data-phone-mount-root></div>`;
    const root = this.container.querySelector("[data-phone-mount-root]");
    this._unmountPhone = mountPreact(h(PhoneSupportersContent, { screen: this }), root);
    this.bindEvents();
    this.generateQr();
  },

  bindEvents() {
    this.container.querySelectorAll("[data-phone-action='back']").forEach((b) => {
      b.onclick = (e) => {
        e?.preventDefault?.();
        Router.back();
      };
    });
    this.container.querySelectorAll("[data-phone-tab]").forEach((chip) => {
      chip.onclick = () => {
        const tab = String(chip.dataset.phoneTab || "");
        void this.selectTab(tab);
      };
    });
    this.container.querySelectorAll("[data-phone-action='showDonateQr']").forEach((b) => {
      b.onclick = () => {
        this.showDonateQr = true;
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='hideDonateQr']").forEach((b) => {
      b.onclick = () => {
        this.showDonateQr = false;
        this.render();
      };
    });
    this.container.querySelectorAll("[data-phone-action='retry']").forEach((b) => {
      b.onclick = () => void this.loadTabIfNeeded(this.selectedTab);
    });
    const overlay = this.container.querySelector(".addons-qr-overlay");
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          this.showDonateQr = false;
          this.render();
        }
      };
    }
  },

  generateQr() {
    this.container.querySelectorAll("canvas[data-qr-content]").forEach((canvas) => {
      const content = String(canvas.getAttribute("data-qr-content") || "").trim();
      if (!content) return;
      try {
        QrCodeGenerator.generate(canvas, content, 220);
      } catch (e) {
        console.warn("QR failed", e);
      }
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
