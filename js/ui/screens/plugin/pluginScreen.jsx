import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { LibrarySyncService } from "../../../core/profile/librarySyncService.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { Platform } from "../../../platform/index.js";
import { QrCodeGenerator } from "../../../core/qr/qrCodeGenerator.js";
import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { I18n } from "../../../i18n/index.js";

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

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

function PhoneAddonRow({ screen, row, actionId, icon, title, subtitle, disabled }) {
  const handleClick = () => {
    screen.contentRow = row;
    screen.contentCol = 0;
    screen.applyFocus();
    screen.activateFocused();
  };

  const handleKeyDown = (event) => {
    const code = Number(event?.keyCode || 0);
    if (code === 32) {
      event.preventDefault();
    }
  };

  return (
    <div
      role="button"
      class="phone-settings-row addons-focusable"
      data-zone="content"
      data-row={row}
      data-col="0"
      data-action-id={actionId}
      tabIndex={-1}
      aria-disabled={disabled ? "true" : "false"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">
        {icon}
      </span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">{title}</span>
        <span class="phone-settings-row-subtitle">{subtitle}</span>
      </span>
      <span class="material-icons phone-settings-row-chevron" aria-hidden="true">
        chevron_right
      </span>
    </div>
  );
}

function PluginScreenContent({ screen }) {
  const model = screen.model || {};
  const manageSubtitle = model.isEssential
    ? t(
        "addon_manage_addons_only_from_phone_subtitle",
        "Scan a QR code to install or remove add-ons from your phone"
      )
    : t(
        "addon_manage_from_phone_subtitle",
        "Scan a QR code to manage addons, catalogs, and collections from your phone"
      );

  const refreshRow = model.isEssential ? 1 : 2;

  return (
    <>
      <main class="phone-settings-scroll">
        <div class="phone-settings-page-header">
          <h1 class="phone-settings-page-title">{t("addon_title", "Addons")}</h1>
        </div>
        <div class="phone-settings-cards">
          <section class="phone-settings-card">
            <div class="phone-settings-card-header">
              <span class="phone-settings-card-subtitle">{manageSubtitle}</span>
            </div>
            <p
              class="phone-settings-card-subtitle"
              style="padding: 0 var(--phone-space-card-padding) var(--phone-space-12);"
            >
              {`${model.addonCount} addon${model.addonCount === 1 ? "" : "s"} currently linked`}
              {" · "}
              {screen.buildSyncStatusText()}
            </p>
            <div class="phone-settings-card-body">
              <PhoneAddonRow
                screen={screen}
                row={0}
                actionId="manage_from_phone"
                icon="qr_code_2"
                title={t("addon_manage_from_phone_title", "Manage from phone")}
                subtitle={manageSubtitle}
              />
              {!model.isEssential && (
                <PhoneAddonRow
                  screen={screen}
                  row={1}
                  actionId="reorder_home_catalogs"
                  icon="tune"
                  title={t("addon_reorder_title", "Reorder home catalogs")}
                  subtitle={t(
                    "addon_reorder_subtitle",
                    "Controls catalog and collection row order on Home"
                  )}
                />
              )}
              <PhoneAddonRow
                screen={screen}
                row={refreshRow}
                actionId="refresh_addons"
                icon={screen.syncing ? "hourglass_top" : "sync"}
                title={
                  screen.syncing
                    ? t("addon_refresh_action", "Refreshing…")
                    : t("addon_refresh_action", "Refresh Addons")
                }
                subtitle={t(
                  "addon_refresh_default_subtitle",
                  "Pull latest addon changes for current profile"
                )}
                disabled={screen.syncing}
              />
            </div>
          </section>
        </div>
      </main>
      {screen.qrOverlayOpen && (
        <div class="addons-qr-overlay">
          <div class="phone-qr-card">
            <p class="phone-qr-code-text">
              {model.isEssential
                ? t(
                    "addon_qr_addons_only_scan_instruction",
                    "Scan with your phone to install or remove add-ons"
                  )
                : t(
                    "addon_qr_scan_instruction",
                    "Scan with your phone to manage addons, catalogs, and collections"
                  )}
            </p>
            <div class="phone-qr-frame">
              <canvas class="addons-qr-canvas" width="160" height="160" aria-label="QR code" />
            </div>
            <p class="phone-qr-code-text">{model.phoneManagerUrl || ""}</p>
            <div
              role="button"
              class="phone-auth-action-btn addons-qr-close addons-focusable focused"
              data-action-id="close_qr_overlay"
              tabIndex={-1}
              onClick={() => screen.closeQrOverlay()}
            >
              {t("addon_qr_close", "Close")}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
    this._unmountPhone = mountPreact(h(PluginScreenContent, { screen: this }), mountRoot);
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
