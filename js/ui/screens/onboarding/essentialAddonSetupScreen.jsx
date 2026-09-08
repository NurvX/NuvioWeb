import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { ProfileSettingsSyncService } from "../../../core/profile/profileSettingsSyncService.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { I18n } from "../../../i18n/index.js";

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

function EssentialAddonSetupContent() {
  return (
    <div class="phone-auth-shell">
      <div class="phone-auth-scroll">
        <img class="phone-auth-logo" src="assets/brand/app_logo_wordmark.png" alt="Nuvio" />
        <h2 class="phone-auth-title">{t("essential_addon_setup_title", "Set up your add-ons")}</h2>
        <p class="phone-auth-subtitle">
          {t(
            "essential_addon_setup_subtitle",
            "Add a manifest URL manually now, or skip and configure add-ons later from Settings."
          )}
        </p>
        <div class="phone-onboarding-cards">
          <button
            type="button"
            class="phone-onboarding-card focusable"
            data-index="0"
            data-action="addons"
          >
            <span class="phone-onboarding-card-title">
              {t("addon_manage_from_phone_title", "Manage from phone")}
            </span>
            <span class="phone-onboarding-card-subtitle">
              {t(
                "addon_manage_addons_only_from_phone_subtitle",
                "Scan a QR code to install or remove add-ons from your phone"
              )}
            </span>
          </button>
          <button
            type="button"
            class="phone-onboarding-card focusable"
            data-index="1"
            data-action="skip"
          >
            <span class="phone-onboarding-card-title">
              {t("essential_addon_continue_for_now", "Continue for now")}
            </span>
            <span class="phone-onboarding-card-subtitle">
              {t("essential_addon_setup_subtitle", "You can add them later from Settings.")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const EssentialAddonSetupScreen = {
  render() {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(EssentialAddonSetupContent, {}), this.container);
    ScreenUtils.setInitialFocus(this.container);
  },

  async mount() {
    this.container = document.getElementById("essentialAddonSetup");
    ScreenUtils.show(this.container);
    this.render();
    this.onClickBound = this.onClick.bind(this);
    this.container.addEventListener("click", this.onClickBound);
  },

  async finish(skipped) {
    const profileId = ProfileManager.getActiveProfileId();
    ExperienceModeStore.setForProfile(profileId, { addonSetupSkipped: skipped });
    await ProfileSettingsSyncService.push(profileId);
    if (skipped) {
      await Router.navigate(
        "home",
        { forceReload: true },
        { replaceHistory: true, skipStackPush: true }
      );
    } else {
      await Router.navigate("plugin", { essentialSetup: true });
    }
  },

  async onClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "addons") await this.finish(false);
    if (action === "skip") await this.finish(true);
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
