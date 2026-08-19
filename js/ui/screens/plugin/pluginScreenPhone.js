import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/plugin/pluginScreen.js (TV Settings > Addons screen).
// Reuses the existing .phone-settings-card/-row and .phone-qr-card/-frame primitives from
// css/phone.css — no new CSS. Rows keep pluginScreen.js's own attribute contract
// (addons-focusable / data-zone / data-row / data-col / data-action-id) verbatim so its
// hand-rolled bindContentEvents()/applyFocus()/activateFocused()/renderQrCode() (which don't go
// through the shared FocusEngine) require zero changes.

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rowHtml({ row, actionId, icon, title, subtitle, disabled }) {
  return `
    <div role="button"
         class="phone-settings-row addons-focusable"
         data-zone="content"
         data-row="${row}"
         data-col="0"
         data-action-id="${actionId}"
         tabindex="-1"
         aria-disabled="${disabled ? "true" : "false"}">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">${icon}</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(title)}</span>
        <span class="phone-settings-row-subtitle">${escapeHtml(subtitle)}</span>
      </span>
      <span class="material-icons phone-settings-row-chevron" aria-hidden="true">chevron_right</span>
    </div>
  `;
}

export function renderPluginScreenPhone(screen) {
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

  const rows = [
    rowHtml({
      row: 0,
      actionId: "manage_from_phone",
      icon: "qr_code_2",
      title: t("addon_manage_from_phone_title", "Manage from phone"),
      subtitle: manageSubtitle
    })
  ];

  if (!model.isEssential) {
    rows.push(
      rowHtml({
        row: 1,
        actionId: "reorder_home_catalogs",
        icon: "tune",
        title: t("addon_reorder_title", "Reorder home catalogs"),
        subtitle: t("addon_reorder_subtitle", "Controls catalog and collection row order on Home")
      })
    );
  }

  rows.push(
    rowHtml({
      row: model.isEssential ? 1 : 2,
      actionId: "refresh_addons",
      icon: screen.syncing ? "hourglass_top" : "sync",
      title: screen.syncing
        ? t("addon_refresh_action", "Refreshing…")
        : t("addon_refresh_action", "Refresh Addons"),
      subtitle: t(
        "addon_refresh_default_subtitle",
        "Pull latest addon changes for current profile"
      ),
      disabled: screen.syncing
    })
  );

  return `
    <main class="phone-settings-scroll">
      <div class="phone-settings-page-header">
        <h1 class="phone-settings-page-title">${escapeHtml(t("addon_title", "Addons"))}</h1>
      </div>
      <div class="phone-settings-cards">
        <section class="phone-settings-card">
          <div class="phone-settings-card-header">
            <span class="phone-settings-card-subtitle">${escapeHtml(manageSubtitle)}</span>
          </div>
          <p class="phone-settings-card-subtitle" style="padding: 0 var(--phone-space-card-padding) var(--phone-space-12);">
            ${escapeHtml(`${model.addonCount} addon${model.addonCount === 1 ? "" : "s"} currently linked`)}
            &middot; ${escapeHtml(screen.buildSyncStatusText())}
          </p>
          <div class="phone-settings-card-body">
            ${rows.join("")}
          </div>
        </section>
      </div>
    </main>
    ${
      screen.qrOverlayOpen
        ? `
      <div class="addons-qr-overlay">
        <div class="phone-qr-card">
          <p class="phone-qr-code-text">${escapeHtml(
            model.isEssential
              ? t(
                  "addon_qr_addons_only_scan_instruction",
                  "Scan with your phone to install or remove add-ons"
                )
              : t(
                  "addon_qr_scan_instruction",
                  "Scan with your phone to manage addons, catalogs, and collections"
                )
          )}</p>
          <div class="phone-qr-frame">
            <canvas class="addons-qr-canvas" width="160" height="160" aria-label="QR code"></canvas>
          </div>
          <p class="phone-qr-code-text">${escapeHtml(model.phoneManagerUrl || "")}</p>
          <div role="button" class="phone-auth-action-btn addons-qr-close addons-focusable focused" data-action-id="close_qr_overlay" tabindex="-1">
            ${escapeHtml(t("addon_qr_close", "Close"))}
          </div>
        </div>
      </div>
    `
        : ""
    }
  `;
}
