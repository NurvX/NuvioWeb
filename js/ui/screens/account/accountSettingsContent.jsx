import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";

function ChevronIcon() {
  return (
    <svg
      class="phone-settings-row-chevron"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m9 6 6 6-6 6"
      />
    </svg>
  );
}

function Stat({ value, label }) {
  return (
    <span class="phone-account-stat">
      <span class="phone-account-stat-value">{String(value ?? 0)}</span>
      <span class="phone-account-stat-label">{label}</span>
    </span>
  );
}

function TotalRow({ overview }) {
  return (
    <div class="phone-account-sync-total">
      <Stat value={overview.totalAddons} label="addons" />
      <Stat value={overview.totalPlugins} label="plugins" />
      <Stat value={overview.totalLibrary} label="library" />
      <Stat value={overview.totalWatchProgress} label="progress" />
      <Stat value={overview.totalWatchedItems} label="watched" />
    </div>
  );
}

function ProfileRow({ profile }) {
  return (
    <div class="phone-account-profile-row">
      <span
        class="phone-account-profile-avatar"
        style={`background:${profile.avatarColorHex || "#1E88E5"}`}
        aria-hidden="true"
      >
        {String(profile.profileName || "?")
          .charAt(0)
          .toUpperCase()}
      </span>
      <span class="phone-account-profile-name">{profile.profileName}</span>
      <span class="phone-account-profile-stats">
        <Stat value={profile.addons} label="addons" />
        <Stat value={profile.plugins} label="plugins" />
        <Stat value={profile.library} label="library" />
        <Stat value={profile.watchProgress} label="progress" />
        <Stat value={profile.watchedItems} label="watched" />
      </span>
    </div>
  );
}

function SyncOverview({ overview }) {
  return (
    <>
      <TotalRow overview={overview} />
      {overview.perProfile.map((p) => (
        <ProfileRow key={p.profileName} profile={p} />
      ))}
    </>
  );
}

function SyncLoading() {
  return (
    <div class="phone-settings-row phone-settings-row-info">
      <span class="phone-settings-row-icon material-icons" aria-hidden="true">
        sync
      </span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">Loading sync overview...</span>
      </span>
    </div>
  );
}

function ActionButton({ icon, title, subtitle, action }) {
  const isImage = String(icon || "").startsWith("assets/");
  return (
    <button
      type="button"
      class="phone-settings-row phone-settings-row-action focusable"
      data-action={action}
    >
      {isImage ? (
        <img class="phone-settings-row-icon" src={icon} alt="" aria-hidden="true" />
      ) : (
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">
          {icon}
        </span>
      )}
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title">{title}</span>
        <span class="phone-settings-row-subtitle">{subtitle}</span>
      </span>
      <ChevronIcon />
    </button>
  );
}

function StatusCard({ email }) {
  return (
    <div class="phone-settings-row phone-settings-row-info phone-account-identity-row">
      <span class="phone-account-avatar" aria-hidden="true">
        {String(email || "?")
          .charAt(0)
          .toUpperCase()}
      </span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-subtitle">Signed in as</span>
        <span class="phone-settings-row-title">{email}</span>
      </span>
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      type="button"
      class="phone-settings-row phone-settings-row-action focusable"
      data-action="logout"
    >
      <span class="phone-settings-row-icon material-icons is-danger" aria-hidden="true">
        logout
      </span>
      <span class="phone-settings-row-copy">
        <span class="phone-settings-row-title is-danger">Sign Out</span>
      </span>
    </button>
  );
}

function AccountSettingsContentBody({ uiState }) {
  const { authState, syncOverview, isSyncOverviewLoading } = uiState;

  if (authState === "loading") {
    return (
      <div class="phone-settings-row phone-settings-row-info">
        <span class="phone-settings-row-icon material-icons" aria-hidden="true">
          sync
        </span>
        <span class="phone-settings-row-copy">
          <span class="phone-settings-row-title">Loading...</span>
        </span>
      </div>
    );
  }

  if (authState === "signedOut") {
    return (
      <ActionButton
        icon="assets/icons/trakt_tv_glyph.svg"
        title="Sign in with QR"
        subtitle="Scan a QR code to link this device"
        action="signin"
      />
    );
  }

  if (authState === "authenticated") {
    return (
      <>
        <StatusCard email={uiState.email} />
        {syncOverview ? (
          <SyncOverview overview={syncOverview} />
        ) : isSyncOverviewLoading ? (
          <SyncLoading />
        ) : null}
        <SignOutButton />
      </>
    );
  }

  return null;
}

function AccountSettingsContentComponent({ uiState }) {
  return (
    <section class="phone-settings-card">
      <div class="phone-settings-card-body">
        <AccountSettingsContentBody uiState={uiState} />
      </div>
    </section>
  );
}

export class AccountSettingsContent {
  constructor(container) {
    this.container = container;
    this.focusIndex = 0;
  }

  render(uiState, callbacks) {
    if (this._unmountPhone) this._unmountPhone();
    this._unmountPhone = mountPreact(
      h(AccountSettingsContentComponent, { uiState }),
      this.container
    );
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
