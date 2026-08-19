import { toDisplayTypeLabel } from "../../../core/addons/homeCatalogs.js";

// Phone render path for js/ui/screens/plugin/catalogOrderScreen.js. Rows keep the TV screen's own
// attribute contract (catalog-order-focusable / data-row / data-col / data-action / data-key /
// data-disable-key) verbatim so its hand-rolled click/keydown dispatch requires zero changes.

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rowHtml(item, index) {
  return `
    <div class="phone-catalog-order-row">
      <div class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(item.catalogName)} - ${escapeHtml(toDisplayTypeLabel(item.type))}</span>
        <span class="phone-settings-row-subtitle">${escapeHtml(item.addonName)}${item.isDisabled ? " · Disabled on Home" : ""}</span>
      </div>
      <div class="phone-catalog-order-row-actions">
        <button type="button"
                class="phone-catalog-order-icon-btn ${item.canMoveUp ? "catalog-order-focusable" : "is-disabled"}"
                ${item.canMoveUp ? `data-row="${index}" data-col="0" data-action="up" data-key="${escapeHtml(item.key)}" tabindex="-1"` : 'tabindex="-1" aria-disabled="true"'}>
          <span class="material-icons" aria-hidden="true">arrow_upward</span>
        </button>
        <button type="button"
                class="phone-catalog-order-icon-btn ${item.canMoveDown ? "catalog-order-focusable" : "is-disabled"}"
                ${item.canMoveDown ? `data-row="${index}" data-col="1" data-action="down" data-key="${escapeHtml(item.key)}" tabindex="-1"` : 'tabindex="-1" aria-disabled="true"'}>
          <span class="material-icons" aria-hidden="true">arrow_downward</span>
        </button>
        <button type="button"
                class="phone-catalog-order-toggle-btn catalog-order-focusable${item.isDisabled ? " is-disabled-state" : ""}"
                data-row="${index}"
                data-col="2"
                data-action="toggle"
                data-disable-key="${escapeHtml(item.disableKey)}"
                tabindex="-1">${item.isDisabled ? "Enable" : "Disable"}</button>
      </div>
    </div>
  `;
}

export function renderCatalogOrderScreenPhone(screen) {
  const items = screen.model?.items || [];
  return `
    <main class="phone-settings-scroll">
      <div class="phone-settings-page-header">
        <h1 class="phone-settings-page-title">Reorder Home Catalogs</h1>
        <p class="phone-settings-card-subtitle">This controls catalog row order on Home (Classic + Modern + Grid).</p>
      </div>
      <div class="phone-settings-cards">
        <section class="phone-settings-card">
          <div class="phone-settings-card-body">
            ${
              items.length
                ? items.map(rowHtml).join("")
                : '<p class="phone-settings-card-subtitle" style="padding: var(--phone-space-card-padding);">No home catalogs available yet.</p>'
            }
          </div>
        </section>
      </div>
    </main>
  `;
}
