import { h } from "preact";
import { AccountSettingsContentPhone } from "./accountSettingsContentPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

export class AccountSettingsContent {
  constructor(container) {
    this.container = container;
    this.focusIndex = 0;
  }

  render(uiState, callbacks) {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(AccountSettingsContentPhone, { uiState }), this.container);
    this.attachFocus(callbacks);
  }

  attachFocus(callbacks) {
    const items = this.container.querySelectorAll(".focusable");

    items.forEach((el, i) => {
      el.dataset.index = i;
    });

    items[0]?.classList.add("focused");

    this.container.onkeydown = (event) => {
      const current = this.container.querySelector(".focused");
      if (!current) return;

      const index = parseInt(current.dataset.index, 10);

      if (event.keyCode === 40) {
        this.moveFocus(items, index + 1);
      }

      if (event.keyCode === 38) {
        this.moveFocus(items, index - 1);
      }

      if (event.keyCode === 13) {
        const action = current.dataset.action;
        callbacks?.[action]?.();
      }
    };
  }

  moveFocus(items, newIndex) {
    if (newIndex < 0 || newIndex >= items.length) return;

    const current = this.container.querySelector(".focused");
    current?.classList.remove("focused");

    items[newIndex].classList.add("focused");
  }

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
  }
}
