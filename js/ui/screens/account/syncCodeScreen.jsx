import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { LocalStore } from "../../../core/storage/localStore.js";
import { I18n } from "../../../i18n/index.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";

const KEY = "manualSyncCode";

function TextDialog({ value }) {
  return (
    <div class="phone-settings-dialog-backdrop">
      <div class="phone-settings-dialog" role="dialog" aria-modal="true">
        <div class="phone-settings-dialog-title">{I18n.t("auth.syncCode.prompt")}</div>
        <input
          class="phone-settings-dialog-field"
          data-action="textInput"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          defaultValue={value}
        />
        <div class="phone-settings-dialog-actions">
          <button
            type="button"
            class="phone-settings-dialog-button focusable"
            data-action="cancelText"
          >
            {I18n.t("common.cancel", {}, { fallback: "Cancel" })}
          </button>
          <button
            type="button"
            class="phone-settings-dialog-button is-primary focusable"
            data-action="saveText"
          >
            {I18n.t("common.save", {}, { fallback: "Save" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncCodeScreenComponent({ screen, value }) {
  return (
    <>
      <div class="phone-auth-shell" data-phone-auth-root>
        <div class="phone-auth-scroll" data-phone-auth-scroll>
          <h2 class="phone-auth-title">{I18n.t("auth.syncCode.title")}</h2>
          <p class="phone-auth-subtitle">
            {I18n.t("auth.syncCode.currentCode", {
              value: value || I18n.t("auth.syncCode.emptyValue")
            })}
          </p>
          <div class="phone-auth-actions">
            <button
              type="button"
              class="phone-auth-action-btn is-primary focusable"
              data-action="setCode"
            >
              {I18n.t("auth.syncCode.setCode")}
            </button>
            <button type="button" class="phone-auth-action-btn focusable" data-action="clearCode">
              {I18n.t("auth.syncCode.clearCode")}
            </button>
            <button type="button" class="phone-auth-action-btn focusable" data-action="back">
              {I18n.t("auth.syncCode.back")}
            </button>
          </div>
        </div>
      </div>
      {screen.textDialog ? <TextDialog value={value} /> : null}
    </>
  );
}

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
      h(SyncCodeScreenComponent, { screen: this, value }),
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
