import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { LocalStore } from "../../../core/storage/localStore.js";
import { h } from "preact";
import { SyncCodeScreenPhone } from "./syncCodeScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

const KEY = "manualSyncCode";

export const SyncCodeScreen = {
  async mount() {
    this.container = document.getElementById("account");
    ScreenUtils.show(this.container);
    this.render();
  },

  render() {
    const value = LocalStore.get(KEY, "");
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(
      h(SyncCodeScreenPhone, { screen: this, value }),
      this.container
    );
    if (this.textDialog) {
      const input = this.container.querySelector("[data-action='textInput']");
      input?.focus?.();
    }
  },

  onPointerActivate(target) {
    const actionTarget = target?.closest?.("[data-action]");
    const action = String(actionTarget?.dataset?.action || "");
    if (!action) {
      return false;
    }

    if (this.textDialog) {
      if (action === "cancelText") {
        this.textDialog = false;
        this.render();
        return true;
      }
      if (action === "saveText") {
        const input = this.container.querySelector("[data-action='textInput']");
        LocalStore.set(KEY, String(input?.value || "").trim());
        this.textDialog = false;
        this.render();
        return true;
      }
      return false;
    }

    if (action === "setCode") {
      this.textDialog = true;
      this.render();
      return true;
    }
    if (action === "clearCode") {
      LocalStore.remove(KEY);
      this.render();
      return true;
    }
    if (action === "back") {
      Router.back();
      return true;
    }
    return false;
  },

  consumeBackRequest() {
    if (!this.textDialog) {
      return false;
    }
    this.textDialog = false;
    this.render();
    return true;
  },

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
