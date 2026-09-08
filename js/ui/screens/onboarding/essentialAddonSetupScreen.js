import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { ProfileSettingsSyncService } from "../../../core/profile/profileSettingsSyncService.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { h } from "preact";
import { EssentialAddonSetupScreenPhone } from "./essentialAddonSetupScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

export const EssentialAddonSetupScreen = {
  render() {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(EssentialAddonSetupScreenPhone, {}), this.container);
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
