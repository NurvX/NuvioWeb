import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { HomeCatalogStore } from "../../../data/local/homeCatalogStore.js";
import { CollectionsStore } from "../../../data/local/collectionsStore.js";
import { buildOrderedHomeCatalogItems } from "../../../core/addons/homeCatalogs.js";
import { Platform } from "../../../platform/index.js";
import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { h } from "preact";
import { CatalogOrderScreenPhone } from "./catalogOrderScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const CatalogOrderScreen = {
  async mount() {
    if (ExperienceModeStore.isEssential()) {
      await Router.navigate("plugin", {}, { replaceHistory: true, skipStackPush: true });
      return;
    }
    this.container = document.getElementById("catalogOrder");
    ScreenUtils.show(this.container);
    this.focusRow = Number.isFinite(this.focusRow) ? this.focusRow : 0;
    this.focusCol = Number.isFinite(this.focusCol) ? this.focusCol : 0;
    await this.render();
  },

  async collectModel() {
    const addons = await addonRepository.getInstalledAddons();
    const collections = CollectionsStore.get();
    const prefs = HomeCatalogStore.get();
    return {
      items: buildOrderedHomeCatalogItems(
        addons,
        collections,
        prefs.order,
        prefs.disabled,
        prefs.customTitles
      )
    };
  },

  setRowColumns(row, cols) {
    this.rowColumns.set(row, cols);
  },

  getRows() {
    return [...this.rowColumns.keys()].sort((left, right) => left - right);
  },

  getCols(row) {
    return this.rowColumns.get(row) || [0];
  },

  normalizeFocus() {
    const rows = this.getRows();
    if (!rows.length) {
      this.focusRow = 0;
      this.focusCol = 0;
      return;
    }
    this.focusRow = rows.includes(this.focusRow)
      ? this.focusRow
      : rows[clamp(this.focusRow, 0, rows.length - 1)];
    const cols = this.getCols(this.focusRow);
    this.focusCol = cols.includes(this.focusCol) ? this.focusCol : cols[0];
  },

  ensureVisibility(target) {
    const container = this.container?.querySelector(".catalog-order-main");
    if (!container || !target) {
      return;
    }
    const anchor = target.closest(".catalog-order-card") || target;
    const pad = 56;
    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const anchorTop = anchorRect.top - containerRect.top + container.scrollTop;
    const anchorBottom = anchorRect.bottom - containerRect.top + container.scrollTop;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (anchorBottom > viewBottom - pad) {
      container.scrollTop = Math.min(
        container.scrollHeight - container.clientHeight,
        Math.max(0, anchorBottom - container.clientHeight + pad)
      );
    } else if (anchorTop < viewTop + pad) {
      container.scrollTop = Math.max(0, anchorTop - pad);
    }
  },

  applyFocus() {
    this.container
      ?.querySelectorAll(".catalog-order-focusable.focused")
      .forEach((node) => node.classList.remove("focused"));
    const target =
      this.container?.querySelector(
        `.catalog-order-focusable[data-row="${this.focusRow}"][data-col="${this.focusCol}"]`
      ) ||
      this.container?.querySelector(
        `.catalog-order-focusable[data-row="${this.focusRow}"][data-col="0"]`
      ) ||
      this.container?.querySelector(".catalog-order-focusable");

    if (!target) {
      return;
    }
    target.classList.add("focused");
    this.ensureVisibility(target);
    target.focus();
  },

  async moveItem(key, direction) {
    const current = this.model.items.map((item) => item.key);
    const index = current.indexOf(key);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
      return;
    }
    const reordered = [...current];
    const moved = reordered.splice(index, 1)[0];
    reordered.splice(nextIndex, 0, moved);
    HomeCatalogStore.setOrder(reordered);
    this.focusRow = nextIndex;
    await this.render();
  },

  async toggleItem(disableKey) {
    HomeCatalogStore.toggleDisabled(disableKey);
    await this.render();
  },

  async render() {
    this.model = await this.collectModel();
    this.rowColumns = new Map();

    this.model.items.forEach((item, index) => {
      const cols = [];
      if (item.canMoveUp) cols.push(0);
      if (item.canMoveDown) cols.push(1);
      cols.push(2);
      this.setRowColumns(index, cols);
    });

    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(CatalogOrderScreenPhone, { screen: this }), this.container);
    this.normalizeFocus();
    this.applyFocus();
  },

  async activateFocused() {
    const current = this.container?.querySelector(".catalog-order-focusable.focused");
    if (!current) {
      return;
    }

    const action = String(current.dataset.action || "");
    if (action === "up") {
      await this.moveItem(String(current.dataset.key || ""), -1);
    } else if (action === "down") {
      await this.moveItem(String(current.dataset.key || ""), 1);
    } else if (action === "toggle") {
      await this.toggleItem(String(current.dataset.disableKey || ""));
    }
  },

  moveFocus(deltaRow, deltaCol = 0) {
    if (deltaCol !== 0) {
      const cols = this.getCols(this.focusRow);
      const currentIndex = Math.max(0, cols.indexOf(this.focusCol));
      this.focusCol = cols[clamp(currentIndex + deltaCol, 0, cols.length - 1)];
      this.applyFocus();
      return;
    }

    const rows = this.getRows();
    const currentIndex = Math.max(0, rows.indexOf(this.focusRow));
    this.focusRow = rows[clamp(currentIndex + deltaRow, 0, rows.length - 1)] || 0;
    const cols = this.getCols(this.focusRow);
    this.focusCol = cols.includes(this.focusCol) ? this.focusCol : cols[0];
    this.applyFocus();
  },

  async onKeyDown(event) {
    if (Platform.isBackEvent(event)) {
      event?.preventDefault?.();
      await Router.back();
      return;
    }

    const code = Number(event?.keyCode || 0);
    if (code === 38 || code === 40 || code === 37 || code === 39) {
      event?.preventDefault?.();
      if (code === 38) this.moveFocus(-1);
      else if (code === 40) this.moveFocus(1);
      else if (code === 37) this.moveFocus(0, -1);
      else if (code === 39) this.moveFocus(0, 1);
      return;
    }

    if (code === 13) {
      // Prevent the focused button's native click from also firing, otherwise
      // the action runs twice and rows jump two slots at a time.
      event?.preventDefault?.();
      event?.stopPropagation?.();
      await this.activateFocused();
    }
  },

  cleanup() {
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
