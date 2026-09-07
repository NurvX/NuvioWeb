// Phone render path for js/ui/screens/account/accountSettingsContent.js (ticket 05-03, see
// .scratch/mobile-parity/spec.md). `AccountSettingsContent.render()` only gets a guard clause
// that dispatches to `AccountSettingsContentPhone` here when `Platform.isPhoneViewport()` is
// true — all markup for the phone layout lives in this module.
//
// This is a visual-only rebuild: rows keep the exact same `data-action`/`focusable` contract
// the existing TV markup used, so `attachFocus(callbacks)` (already reused verbatim, unchanged,
// called by the TV controller after mounting this component) keeps wiring the exact same
// `callbacks[action]()` dispatch on Enter, and taps route through the existing global
// focus-engine pointer-click handling — no click handlers are added here, matching the original
// vanilla markup which had none either. Rows reuse the `phone-settings-card`/`phone-settings-row*`
// family from 05-01 for the card/list chrome; the per-profile sync rows get a small round avatar
// chip matching 05-02's profile-card avatar language (initial-letter, profile-colored).

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

/** Renders the phone body markup for whichever of the three states
 * (`uiState.authState`) is currently active — the same three states TV's own `render()` already
 * branches on. */
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

export function AccountSettingsContentPhone({ uiState }) {
  return (
    <section class="phone-settings-card">
      <div class="phone-settings-card-body">
        <AccountSettingsContentBody uiState={uiState} />
      </div>
    </section>
  );
}
