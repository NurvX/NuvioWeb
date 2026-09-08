import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { ProfileSettingsSyncService } from "../../../core/profile/profileSettingsSyncService.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { h } from "preact";
import { ExperienceModeSelectionScreenPhone } from "./experienceModeSelectionScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

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
      h(ExperienceModeSelectionScreenPhone, { screen: this }),
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
