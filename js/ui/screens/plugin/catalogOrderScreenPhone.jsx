import { toDisplayTypeLabel } from "../../../core/addons/homeCatalogs.js";

function CatalogOrderRow({ item, index, onAction }) {
  return (
    <div class="phone-catalog-order-row">
      <div class="phone-settings-row-copy">
        <span class="phone-settings-row-title">
          {item.catalogName} - {toDisplayTypeLabel(item.type)}
        </span>
        <span class="phone-settings-row-subtitle">
          {item.addonName}
          {item.isDisabled ? " · Disabled on Home" : ""}
        </span>
      </div>
      <div class="phone-catalog-order-row-actions">
        <button
          type="button"
          class={`phone-catalog-order-icon-btn catalog-order-focusable${item.canMoveUp ? "" : " is-disabled"}`}
          data-row={index}
          data-col="0"
          data-action="up"
          data-key={item.key}
          tabIndex={-1}
          aria-disabled={!item.canMoveUp || undefined}
          onClick={item.canMoveUp ? () => onAction(index, 0, "up", item.key) : undefined}
        >
          <span class="material-icons" aria-hidden="true">
            arrow_upward
          </span>
        </button>
        <button
          type="button"
          class={`phone-catalog-order-icon-btn catalog-order-focusable${item.canMoveDown ? "" : " is-disabled"}`}
          data-row={index}
          data-col="1"
          data-action="down"
          data-key={item.key}
          tabIndex={-1}
          aria-disabled={!item.canMoveDown || undefined}
          onClick={item.canMoveDown ? () => onAction(index, 1, "down", item.key) : undefined}
        >
          <span class="material-icons" aria-hidden="true">
            arrow_downward
          </span>
        </button>
        <button
          type="button"
          class={`phone-catalog-order-toggle-btn catalog-order-focusable${item.isDisabled ? " is-disabled-state" : ""}`}
          data-row={index}
          data-col="2"
          data-action="toggle"
          data-disable-key={item.disableKey}
          tabIndex={-1}
          onClick={() => onAction(index, 2, "toggle", item.disableKey)}
        >
          {item.isDisabled ? "Enable" : "Disable"}
        </button>
      </div>
    </div>
  );
}

export function CatalogOrderScreenPhone({ screen }) {
  const items = screen.model?.items || [];

  const handleAction = (row, col, action, key) => {
    screen.focusRow = row;
    screen.focusCol = col;
    screen.applyFocus();
    screen.activateFocused();
  };

  return (
    <main class="phone-settings-scroll">
      <div class="phone-settings-page-header">
        <h1 class="phone-settings-page-title">Reorder Home Catalogs</h1>
        <p class="phone-settings-card-subtitle">
          This controls catalog row order on Home (Classic + Modern + Grid).
        </p>
      </div>
      <div class="phone-settings-cards">
        <section class="phone-settings-card">
          <div class="phone-settings-card-body">
            {items.length ? (
              items.map((item, index) => (
                <CatalogOrderRow key={item.key} item={item} index={index} onAction={handleAction} />
              ))
            ) : (
              <p
                class="phone-settings-card-subtitle"
                style="padding: var(--phone-space-card-padding);"
              >
                No home catalogs available yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
