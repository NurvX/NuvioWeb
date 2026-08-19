// Phone render path for js/ui/screens/account/accountSettingsContent.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). `AccountSettingsContent.render()` only gets a guard clause
// that dispatches to `renderPhone()` here when `Platform.isPhoneViewport()` is true — all
// markup for the phone layout lives in this module.
//
// This is a visual-only rebuild: rows keep the exact same `data-action`/`focusable` contract
// the existing TV markup used, so `attachFocus(callbacks)` (already reused verbatim, unchanged)
// keeps wiring the exact same `callbacks[action]()` dispatch on Enter. Rows reuse the
// `phone-settings-card`/`phone-settings-row*` family from 05-01 for the card/list chrome; the
// per-profile sync rows get a small round avatar chip matching 05-02's profile-card avatar
// language (initial-letter, profile-colored).

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chevronSvg() {
  return `<svg class="phone-settings-row-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>`;
}

function renderStat(value, label) {
  return `
    <span class="phone-account-stat">
      <span class="phone-account-stat-value">${escapeHtml(String(value ?? 0))}</span>
      <span class="phone-account-stat-label">${escapeHtml(label)}</span>
    </span>
  `;
}

function renderTotalRow(overview) {
  return `
    <div class="phone-account-sync-total">
      ${renderStat(overview.totalAddons, "addons")}
      ${renderStat(overview.totalPlugins, "plugins")}
      ${renderStat(overview.totalLibrary, "library")}
      ${renderStat(overview.totalWatchProgress, "progress")}
      ${renderStat(overview.totalWatchedItems, "watched")}
    </div>
  `;
}

function renderProfileRow(profile) {
  return `
    <div class="phone-account-profile-row">
      <span class="phone-account-profile-avatar" style="background:${escapeHtml(profile.avatarColorHex || "#1E88E5")}" aria-hidden="true">
        ${escapeHtml(
          String(profile.profileName || "?")
            .charAt(0)
            .toUpperCase()
        )}
      </span>
      <span class="phone-account-profile-name">${escapeHtml(profile.profileName)}</span>
      <span class="phone-account-profile-stats">
        ${renderStat(profile.addons, "addons")}
        ${renderStat(profile.plugins, "plugins")}
        ${renderStat(profile.library, "library")}
        ${renderStat(profile.watchProgress, "progress")}
        ${renderStat(profile.watchedItems, "watched")}
      </span>
    </div>
  `;
}

function renderSyncOverview(overview) {
  return `${renderTotalRow(overview)}${overview.perProfile.map((p) => renderProfileRow(p)).join("")}`;
}

function renderSyncLoading() {
  return `
    <div class="phone-settings-row phone-settings-row-info">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">sync</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">Loading sync overview...</span>
      </span>
    </div>
  `;
}

function renderActionButton(icon, title, subtitle, action) {
  const iconHtml = String(icon || "").startsWith("assets/")
    ? `<img class="phone-settings-row-icon" src="${escapeHtml(icon)}" alt="" aria-hidden="true" />`
    : `<span class="phone-settings-row-icon material-icons" aria-hidden="true">${escapeHtml(icon)}</span>`;

  return `
    <button type="button" class="phone-settings-row phone-settings-row-action focusable" data-action="${escapeHtml(action)}">
      ${iconHtml}
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">${escapeHtml(title)}</span>
        <span class="phone-settings-row-subtitle">${escapeHtml(subtitle)}</span>
      </span>
      ${chevronSvg()}
    </button>
  `;
}

function renderStatusCard(email) {
  return `
    <div class="phone-settings-row phone-settings-row-info phone-account-identity-row">
      <span class="phone-account-avatar" aria-hidden="true">${escapeHtml(
        String(email || "?")
          .charAt(0)
          .toUpperCase()
      )}</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-subtitle">Signed in as</span>
        <span class="phone-settings-row-title">${escapeHtml(email)}</span>
      </span>
    </div>
  `;
}

function renderSignOut() {
  return `
    <button type="button" class="phone-settings-row phone-settings-row-action focusable" data-action="logout">
      <span class="phone-settings-row-icon material-icons is-danger" aria-hidden="true">logout</span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title is-danger">Sign Out</span>
      </span>
    </button>
  `;
}

/** Returns the full phone body markup for whichever of the three states
 * (`uiState.authState`) is currently active — the same three states TV's own `render()` already
 * branches on. */
export function renderAccountSettingsContentPhone(uiState) {
  const { authState, syncOverview, isSyncOverviewLoading } = uiState;

  if (authState === "loading") {
    return `
      <div class="phone-settings-row phone-settings-row-info">
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">sync</span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">Loading...</span>
        </span>
      </div>
    `;
  }

  if (authState === "signedOut") {
    return renderActionButton(
      "assets/icons/trakt_tv_glyph.svg",
      "Sign in with QR",
      "Scan a QR code to link this device",
      "signin"
    );
  }

  if (authState === "authenticated") {
    return `
      ${renderStatusCard(uiState.email)}
      ${syncOverview ? renderSyncOverview(syncOverview) : isSyncOverviewLoading ? renderSyncLoading() : ""}
      ${renderSignOut()}
    `;
  }

  return "";
}
