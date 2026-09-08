import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { ProfileSettingsSyncService } from "../../../core/profile/profileSettingsSyncService.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { I18n } from "../../../i18n/index.js";

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

const LAYOUTS = [
  { id: "modern", key: "layout_modern", fallback: "Modern" },
  { id: "grid", key: "layout_grid", fallback: "Grid" },
  { id: "classic", key: "layout_classic", fallback: "Classic" }
];

function ModeCard({ attr, value, title, subtitle }) {
  const dataProps = attr === "layout" ? { "data-layout": value } : { "data-mode": value };
  return (
    <button type="button" class="phone-onboarding-card focusable" data-index="0" {...dataProps}>
      <span class="phone-onboarding-card-title">{title}</span>
      {subtitle ? <span class="phone-onboarding-card-subtitle">{subtitle}</span> : null}
    </button>
  );
}

function ExperienceModeSelectionContent({ screen }) {
  const isLayout = screen.step === "layout";

  return (
    <div class="phone-auth-shell">
      <div class="phone-auth-scroll">
        <img class="phone-auth-logo" src="assets/brand/app_logo_wordmark.png" alt="Nuvio" />
        <h2 class="phone-auth-title">
          {isLayout
            ? t("layout_selection_welcome", "Welcome to Nuvio")
            : t("experience_mode_choose_title", "Choose your Nuvio experience")}
        </h2>
        <p class="phone-auth-subtitle">
          {isLayout
            ? t("layout_selection_subtitle", "Choose how Nuvio should look on your TV.")
            : t(
                "experience_mode_choose_subtitle",
                "Start simple or unlock every customization. You can switch anytime."
              )}
        </p>
        <div class="phone-onboarding-cards">
          {isLayout
            ? LAYOUTS.map((layout) => (
                <ModeCard
                  key={layout.id}
                  attr="layout"
                  value={layout.id}
                  title={t(layout.key, layout.fallback)}
                />
              ))
            : [
                <ModeCard
                  key="ESSENTIAL"
                  attr="mode"
                  value="ESSENTIAL"
                  title={t("experience_mode_essential", "Essential")}
                  subtitle={t(
                    "experience_mode_essential_card_subtitle",
                    "Focused setup, add-ons, playback basics, Trakt, and account settings."
                  )}
                />,
                <ModeCard
                  key="ADVANCED"
                  attr="mode"
                  value="ADVANCED"
                  title={t("experience_mode_advanced", "Advanced")}
                  subtitle={t(
                    "experience_mode_advanced_card_subtitle",
                    "Full settings, layout controls, catalog order, collections, plug-ins, and diagnostics."
                  )}
                />
              ]}
        </div>
      </div>
    </div>
  );
}

export const ExperienceModeSelectionScreen = {
  step: "mode",

  async mount() {
    this.container = document.getElementById("experienceModeSelection");
    this.step = "mode";
    ScreenUtils.show(this.container);
    this.render();
    this.onClickBound = this.onClick.bind(this);
    this.container.addEventListener("click", this.onClickBound);
  },

  render() {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(
      h(ExperienceModeSelectionContent, { screen: this }),
      this.container
    );
  },

  async chooseMode(mode) {
    const profileId = ProfileManager.getActiveProfileId();
    if (mode === "ADVANCED") {
      this.step = "layout";
      this.render();
      return;
    }
    LayoutPreferences.setForProfile(profileId, { homeLayout: "modern", hasChosenLayout: true });
    ExperienceModeStore.setForProfile(profileId, { mode: "ESSENTIAL" });
    await ProfileSettingsSyncService.push(profileId);
    const addons = await addonRepository.getInstalledAddons().catch(() => []);
    await Router.navigate(
      addons.length ? "home" : "essentialAddonSetup",
      {},
      {
        replaceHistory: true,
        skipStackPush: true
      }
    );
  },

  async chooseLayout(layout) {
    const profileId = ProfileManager.getActiveProfileId();
    LayoutPreferences.setForProfile(profileId, { homeLayout: layout, hasChosenLayout: true });
    ExperienceModeStore.setForProfile(profileId, { mode: "ADVANCED" });
    await ProfileSettingsSyncService.push(profileId);
    await Router.navigate(
      "home",
      { forceReload: true },
      { replaceHistory: true, skipStackPush: true }
    );
  },

  async onClick(event) {
    const node = event.target.closest("[data-mode], [data-layout]");
    if (!node) return;
    if (node.dataset.mode) await this.chooseMode(node.dataset.mode);
    if (node.dataset.layout) await this.chooseLayout(node.dataset.layout);
  },

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    this.container?.removeEventListener("click", this.onClickBound);
    ScreenUtils.hide(this.container);
  }
};
