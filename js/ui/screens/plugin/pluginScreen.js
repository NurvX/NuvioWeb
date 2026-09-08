import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { LibrarySyncService } from "../../../core/profile/librarySyncService.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { Platform } from "../../../platform/index.js";
import { QrCodeGenerator } from "../../../core/qr/qrCodeGenerator.js";
import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { h } from "preact";
import { PluginScreenPhone } from "./pluginScreenPhone.jsx";
import { mountPreact } from "../../phone/mountPreact.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const PHONE_MANAGER_URL = "https://nuvio.tv/account?tab=addons";
const ADDONS_ROUTE_ENTER_DURATION_MS = 350;

async function getPhoneManagerUrl() {
  if (typeof window !== "undefined" && window.location) {
    const protocol = String(window.location.protocol || "");
    if (protocol === "http:" || protocol === "https:") {
      return `${window.location.origin}/?addonsRemote=1`;
    }
  }
  return PHONE_MANAGER_URL;
}

export const PluginScreen = {
  async mount() {
    this.container = document.getElementById("plugin");
    ScreenUtils.show(this.container);
    this.pluginRouteEnterPending = true;
    this.contentRow = Number.isFinite(this.contentRow) ? this.contentRow : 0;
    this.contentCol = Number.isFinite(this.contentCol) ? this.contentCol : 0;
    this.qrOverlayOpen = false;
    this.syncing = false;
    this.model = await this.collectModel();
    await this.render({ refreshModel: false });
    if (AuthManager.isAuthenticated) {
      this.scheduleInitialRefresh();
    }
  },

  scheduleInitialRefresh() {
    if (this.initialRefreshTimer) {
      clearTimeout(this.initialRefreshTimer);
    }
    this.initialRefreshTimer = setTimeout(() => {
      this.initialRefreshTimer = null;
      if (Router.getCurrent() === "plugin") {
        void this.refreshAddons();
      }
    }, ADDONS_ROUTE_ENTER_DURATION_MS + 80);
  },

  async collectModel() {
    const addonUrls = addonRepository.getInstalledAddonUrls();
    return {
      addonCount: addonUrls.length,
      authenticated: AuthManager.isAuthenticated,
      syncStatus: LibrarySyncService.getLastPullStatus(),
      phoneManagerUrl: await getPhoneManagerUrl(),
      isEssential: ExperienceModeStore.isEssential()
    };
  },

  buildSyncStatusText() {
    if (this.syncing) {
      return "Syncing addons...";
    }
    if (!this.model?.authenticated) {
      return "Sign in on your phone to link addons.";
    }
    const status = this.model?.syncStatus || {};
    if (status.state === "error") {
      return "Couldn't reach the addon service. Check the TV internet connection and try Refresh.";
    }
    if (this.model?.addonCount > 0) {
      return "Addons are up to date.";
    }
    return "No addons linked yet. Add them on your phone, then press Refresh.";
  },

  async refreshAddons() {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    await this.render({ refreshModel: true });
    try {
      await LibrarySyncService.pull();
    } catch (error) {
      console.warn("Addon refresh failed", error);
    }
    this.syncing = false;
    if (Router.getCurrent() === "plugin") {
      await this.render({ refreshModel: true });
    }
  },

  setRowColumns(row, cols) {
    this.rowColumns.set(row, cols);
  },

  getAvailableRows() {
    return [...this.rowColumns.keys()].sort((left, right) => left - right);
  },

  getAvailableCols(row) {
    return this.rowColumns.get(row) || [0];
  },

  normalizeFocus() {
    const rows = this.getAvailableRows();
    this.contentRow = rows.includes(this.contentRow) ? this.contentRow : rows[0] || 0;
    const cols = this.getAvailableCols(this.contentRow);
    this.contentCol = cols.includes(this.contentCol) ? this.contentCol : cols[0];
  },

  ensureMainVisibility(target) {
    const container = this.container?.querySelector(".addons-main");
    if (!container || !target) {
      return;
    }
    const anchor =
      target.closest(".addons-installed-card, .addons-large-row, .addons-install-card") || target;
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

  renderQrCode() {
    if (!this.qrOverlayOpen || !this.model.phoneManagerUrl) {
      return;
    }
    const canvas = this.container?.querySelector(".addons-qr-canvas");
    if (!canvas) {
      return;
    }
    QrCodeGenerator.generate(canvas, this.model.phoneManagerUrl, 160);
  },

  async openQrOverlay() {
    this.qrOverlayOpen = true;
    await this.render({ refreshModel: false });
  },

  async closeQrOverlay() {
    if (!this.qrOverlayOpen) {
      return false;
    }
    this.qrOverlayOpen = false;
    await this.render({ refreshModel: false });
    return true;
  },

  async render({ refreshModel = true } = {}) {
    if (refreshModel || !this.model) {
      this.model = await this.collectModel();
    }
    this.rowColumns = new Map();
    this.actionMap = new Map();
    this.setRowColumns(0, [0]);
    this.setRowColumns(1, [0]);
    if (!this.model.isEssential) {
      this.setRowColumns(2, [0]);
    }

    this.actionMap.set("manage_from_phone", async () => {
      await this.openQrOverlay();
    });
    this.actionMap.set("reorder_home_catalogs", async () => {
      Router.navigate("catalogOrder");
    });
    this.actionMap.set("refresh_addons", async () => {
      await this.refreshAddons();
    });
    this.actionMap.set("close_qr_overlay", async () => {
      await this.closeQrOverlay();
    });

    const enterClass = this.pluginRouteEnterPending ? " nuvio-route-slide-enter" : "";

    this.container.innerHTML = `
      <div class="addons-shell addons-route-shell">
        <div class="addons-route-content${enterClass}" data-phone-mount-root></div>
      </div>
    `;
    const mountRoot = this.container.querySelector("[data-phone-mount-root]");
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(h(PluginScreenPhone, { screen: this }), mountRoot);
    this.pluginRouteEnterPending = false;
    this.normalizeFocus();
    this.applyFocus();
    this.renderQrCode();
  },

  applyFocus() {
    this.container
      .querySelectorAll(".addons-focusable.focused, .focusable.focused")
      .forEach((node) => node.classList.remove("focused"));

    if (this.qrOverlayOpen) {
      const closeButton = this.container.querySelector(".addons-qr-close");
      if (closeButton) {
        closeButton.classList.add("focused");
        closeButton.focus();
      }
      return;
    }

    const target =
      this.container.querySelector(
        `.addons-focusable[data-zone="content"][data-row="${this.contentRow}"][data-col="${this.contentCol}"]`
      ) ||
      this.container.querySelector(
        `.addons-focusable[data-zone="content"][data-row="${this.contentRow}"][data-col="0"]`
      ) ||
      this.container.querySelector(".addons-focusable[data-zone='content']");

    if (target) {
      target.classList.add("focused");
      this.ensureMainVisibility(target);
      target.focus();
    }
  },

  moveContent(deltaRow, deltaCol = 0) {
    if (deltaCol !== 0) {
      const cols = this.getAvailableCols(this.contentRow);
      const currentIndex = Math.max(0, cols.indexOf(this.contentCol));
      this.contentCol = cols[clamp(currentIndex + deltaCol, 0, cols.length - 1)];
      this.applyFocus();
      return;
    }

    const rows = this.getAvailableRows();
    const currentIndex = Math.max(0, rows.indexOf(this.contentRow));
    this.contentRow = rows[clamp(currentIndex + deltaRow, 0, rows.length - 1)] || 0;
    const cols = this.getAvailableCols(this.contentRow);
    this.contentCol = cols.includes(this.contentCol) ? this.contentCol : cols[0];
    this.applyFocus();
  },

  async activateFocused() {
    const current = this.container.querySelector(".addons-focusable.focused, .focusable.focused");
    if (!current) {
      return;
    }

    const action = this.actionMap.get(String(current.dataset.actionId || ""));
    if (!action) {
      return;
    }
    await action();
    if (Router.getCurrent() === "plugin") {
      this.normalizeFocus();
      this.applyFocus();
    }
  },

  consumeBackRequest() {
    if (this.qrOverlayOpen) {
      this.closeQrOverlay();
      return true;
    }
    return false;
  },

  async onKeyDown(event) {
    if (this.qrOverlayOpen) {
      if (Platform.isBackEvent(event)) {
        event?.preventDefault?.();
        await this.closeQrOverlay();
        return;
      }
      const code = Number(event?.keyCode || 0);
      if (code === 13) {
        event?.preventDefault?.();
        await this.closeQrOverlay();
      }
      return;
    }

    if (Platform.isBackEvent(event)) {
      event?.preventDefault?.();
      await Router.back();
      return;
    }

    const code = Number(event?.keyCode || 0);

    if (code === 38 || code === 40 || code === 37 || code === 39) {
      event?.preventDefault?.();
      if (code === 38) this.moveContent(-1);
      else if (code === 40) this.moveContent(1);
      else if (code === 37) {
        if (this.contentCol > 0) {
          this.moveContent(0, -1);
        }
      } else if (code === 39) {
        this.moveContent(0, 1);
      }
      return;
    }

    if (code === 13) {
      await this.activateFocused();
    }
  },

  cleanup() {
    if (this.initialRefreshTimer) {
      clearTimeout(this.initialRefreshTimer);
      this.initialRefreshTimer = null;
    }
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
