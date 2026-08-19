import { I18n } from "../../i18n/index.js";
import { MAX_PROFILES } from "./profileManager.js";
import { openBottomSheet, closeActiveBottomSheet } from "../../ui/components/bottomSheet.js";
import {
  getProfileInitial,
  resolveProfileAvatarUrl,
  getDefaultProfileColor,
  getAvatarCategories,
  categoryLabel,
  PROFILE_PIN_TEXT,
  PROFILE_PIN_LENGTH
} from "./profileSelectionScreen.js";

// Phone render path for js/core/profile/profileSelectionScreen.js (ticket 05-02, see
// .scratch/mobile-parity/spec.md). profileSelectionScreen.js's own `render()` only gets a guard
// clause that dispatches to `renderPhone()` here when `Platform.isPhoneViewport()` is true — all
// markup/interaction logic for the phone layout lives in this module.
//
// This screen is a singleton object (not a per-instance class) with its own `render()`/
// `mount()`/`cleanup()`, so — unlike homeScreen.js's `onPointerActivate` dispatch pattern — the
// phone dispatch here just hangs off `render()`/`mount()`/`cleanup()` directly, matching the
// same shape ticket 05-01 (settingsScreen.js) already used.
//
// Every avatar/PIN/editor mutation is still driven by the screen's own existing methods, read
// or called verbatim, never duplicated: `screen.getVisibleProfiles()`/`screen.avatarCatalog`/
// `screen.isProfilePinEnabled()`/`screen.getAvatarImageUrl()` for read state;
// `screen.activateProfile()`/`screen.openPinOverlay()`/`screen.closePinOverlay()`/
// `screen.activatePinKey()`/`screen.openCreateEditor()`/`screen.openEditEditor()`/
// `screen.closeEditor()`/`screen.syncEditorPreview()`/`screen.activateFocusedNode()`/
// `screen.deleteProfile()`/`screen.updateBackground()` for every mutation/action. Editor
// buttons (category chips, avatar tiles, submit, cancel) carry the exact same
// `data-action`/`data-category`/`data-avatar-id` dataset contract TV's own editor markup uses,
// and this module's generic `[data-action]` click handler just calls
// `screen.activateFocusedNode(button)` — the same dispatcher TV's own click handler calls — so
// none of the editor's create/update logic is reimplemented here.
//
// One deliberate, documented substitution: TV's "Manage Profiles" per-profile menu
// (Edit/Set-PIN/Remove-PIN/Delete) is `NuvioDialog`-based (`screen.openOptionsDialog`), sized in
// `vw` off a 1920px TV reference width — unusable at a 390px phone width. This module rebuilds
// that exact same button set (same labels, same conditions: PIN button reads
// "Set PIN"/"Change PIN" off `isProfilePinEnabled()`, "Remove PIN" only when enabled, "Delete"
// only when not primary) through `bottomSheet.js` instead, the same NuvioDialog substitution
// `catalogSeeAllScreenPhone.js`/`libraryScreenPhone.js` already document for the same reason.
// Every selected action still calls the screen's own `openEditEditor`/`openPinOverlay`/
// `deleteProfile` verbatim. Delete asks for a second bottom-sheet tap to confirm (mirroring the
// two-step "destructive" confirmation flow `libraryScreenPhone.js`'s own list-picker already
// uses) rather than porting `NuvioDialog`'s TV confirmation panel.
//
// Background: reuses `screen.updateBackground(colorHex)` completely unmodified — the phone
// wrapper keeps TV's own `.profile-screen` class so that method's existing
// `querySelector(".profile-screen")` lookup and `buildBackgroundStyleFromColor()` gradient math
// still work as-is. This *is* the ticket's documented "simple static gradient" fidelity
// trade-off versus NuvioMobile's animated mesh background — no new gradient code, no
// canvas/WebGL layer.

const LOCK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M12 17a2 2 0 002-2 2 2 0 00-4 0 2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-7-2a3 3 0 016 0v2H9V6zm7 14H6V10h12v10z" fill="currentColor"></path></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"></path></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zm3-3h6l1 2H8l1-2zM4 7h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const DELETE_KEY_ICON = `<svg class="phone-profile-pin-delete-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 5H9l-6 7 6 7h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"></path><path d="m11 9 6 6m0-6-6 6"></path></svg>`;

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "delete", "0"];

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function avatarUrlFor(screen, profile) {
  return resolveProfileAvatarUrl(profile, (avatarId) => screen.getAvatarImageUrl(avatarId));
}

// ---------------------------------------------------------------------------------------
// Grid screen ("Who's watching?" / management mode)
// ---------------------------------------------------------------------------------------

function renderProfileCardPhone(screen, profile) {
  const avatarUrl = avatarUrlFor(screen, profile);
  const pinEnabled = screen.isProfilePinEnabled(profile.id);
  return `
    <button type="button" class="phone-profile-card"
            data-profile-id="${escapeHtml(profile.id)}"
            data-focus-key="profile:${escapeHtml(profile.id)}">
      <span class="phone-profile-avatar-ring">
        <span class="phone-profile-avatar" style="background:${escapeHtml(profile.avatarColorHex || getDefaultProfileColor())}">
          ${
            avatarUrl
              ? `<img class="phone-profile-avatar-image" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profile.name)}"/>`
              : escapeHtml(getProfileInitial(profile.name))
          }
        </span>
        ${pinEnabled ? `<span class="phone-profile-lock-badge" aria-hidden="true">${LOCK_ICON}</span>` : ""}
        ${screen.isManagementMode ? `<span class="phone-profile-edit-badge" aria-hidden="true">${EDIT_ICON}</span>` : ""}
      </span>
      <span class="phone-profile-name">${escapeHtml(profile.name)}</span>
      ${
        profile.isPrimary
          ? `<span class="phone-profile-badge">${escapeHtml(t("profile_selection_primary_badge", {}, "PRIMARY"))}</span>`
          : ""
      }
    </button>
  `;
}

function renderAddCardPhone() {
  return `
    <button type="button" class="phone-profile-card phone-profile-card-add"
            data-profile-id="add" data-focus-key="profile:add">
      <span class="phone-profile-avatar-ring">
        <span class="phone-profile-avatar phone-profile-avatar-add" aria-hidden="true">+</span>
      </span>
      <span class="phone-profile-name">${escapeHtml(t("profile_add_new", {}, "Add Profile"))}</span>
    </button>
  `;
}

function renderGridScreen(screen) {
  const visibleProfiles = screen.getVisibleProfiles();
  const canAddProfile = visibleProfiles.length < MAX_PROFILES;
  const title = screen.isManagementMode
    ? t("profile_manage_title", {}, "Manage Profiles")
    : t("profile_selection_title", {}, "Who's watching?");
  const subtitle = screen.isManagementMode
    ? t("profile_manage_subtitle", {}, "Select a profile to edit, switch, or create a new one")
    : t("profile_selection_subtitle", {}, "Select a profile to continue");
  const toggleLabel = screen.isManagementMode
    ? t("collections_editor_done", {}, "Done")
    : t("profile_manage_button", {}, "Manage Profiles");

  return `
    <div class="profile-screen phone-profile-screen" data-phone-profile-root>
      <div class="phone-profile-scroll" data-phone-profile-scroll>
        <img src="assets/brand/app_logo_wordmark.png" class="phone-profile-logo" alt="Nuvio"/>
        <h1 class="phone-profile-title">${escapeHtml(title)}</h1>
        <p class="phone-profile-subtitle">${escapeHtml(subtitle)}</p>
        <div class="phone-profile-grid">
          ${visibleProfiles.map((profile) => renderProfileCardPhone(screen, profile)).join("")}
          ${canAddProfile ? renderAddCardPhone() : ""}
        </div>
        <button type="button"
                class="phone-profile-manage-toggle${screen.isManagementMode ? " is-active" : ""}"
                data-phone-toggle-manage>
          ${escapeHtml(toggleLabel)}
        </button>
      </div>
    </div>
    ${renderToastPhone(screen)}
  `;
}

// ---------------------------------------------------------------------------------------
// Management-mode per-profile actions (bottom sheet substitute for NuvioDialog — see header)
// ---------------------------------------------------------------------------------------

function openPhoneDeleteConfirmSheet(screen, profile) {
  openBottomSheet({
    items: [
      {
        title: t("profile_delete_btn", {}, "Delete Profile"),
        icon: DELETE_ICON,
        onSelect: () => {
          void screen.deleteProfile(profile.id);
        }
      }
    ]
  });
}

function openPhoneProfileOptionsSheet(screen, profile) {
  const pinEnabled = screen.isProfilePinEnabled(profile.id);
  const items = [
    {
      title: t("profile_edit_label", {}, "Edit"),
      icon: EDIT_ICON,
      onSelect: () => screen.openEditEditor(screen.getProfileById(profile.id))
    },
    {
      title: pinEnabled ? PROFILE_PIN_TEXT.change : PROFILE_PIN_TEXT.set,
      icon: LOCK_ICON,
      onSelect: () => {
        const target = screen.getProfileById(profile.id);
        if (target) {
          screen.openPinOverlay(pinEnabled ? "verify-change" : "set", target);
        }
      }
    }
  ];
  if (pinEnabled) {
    items.push({
      title: PROFILE_PIN_TEXT.remove,
      icon: LOCK_ICON,
      onSelect: () => {
        const target = screen.getProfileById(profile.id);
        if (target) {
          screen.openPinOverlay("verify-remove", target);
        }
      }
    });
  }
  if (!profile.isPrimary) {
    items.push({
      title: t("profile_delete", {}, "Delete"),
      icon: DELETE_ICON,
      onSelect: () => openPhoneDeleteConfirmSheet(screen, profile)
    });
  }
  openBottomSheet({ items });
}

/** Mirrors `activateFocusedNode`'s own tail branch (profile-card tap) verbatim in decision
 * order — `add` -> create editor, management mode -> per-profile options, PIN-protected ->
 * unlock overlay, otherwise -> activate — substituting only the management-mode menu's
 * rendering technology (see file header). */
async function handlePhoneProfileCardTap(screen, profileId) {
  if (profileId === "add") {
    screen.openCreateEditor();
    return;
  }
  const profile = screen.getProfileById(profileId);
  if (!profile) {
    return;
  }
  if (screen.isManagementMode) {
    openPhoneProfileOptionsSheet(screen, profile);
    return;
  }
  if (screen.isProfilePinEnabled(profile.id)) {
    screen.openPinOverlay("unlock", profile);
    return;
  }
  await screen.activateProfile(profile.id);
}

// ---------------------------------------------------------------------------------------
// Editor screen (create / edit profile)
// ---------------------------------------------------------------------------------------

function renderEditorScreen(screen) {
  const state = screen.editorState;
  const editorTitle =
    state.mode === "edit"
      ? t("profile_edit_label", {}, "Edit")
      : t("profile_create_title", {}, "Create Profile");
  const editorButtonLabel =
    state.mode === "edit" ? t("profile_save", {}, "Save") : t("profile_create_btn", {}, "Create");
  const previewName =
    String(state.name || "").trim() || t("profile_name_placeholder", {}, "Profile name");
  const selectedAvatar = screen.getEditorSelectedAvatar();
  const hasChangedAvatarSelection = state.selectedAvatarId !== state.baseAvatarId;
  const previewAvatarUrl =
    selectedAvatar?.imageUrl ||
    (!hasChangedAvatarSelection
      ? String(state.originalAvatarUrl || "").trim() ||
        screen.getAvatarImageUrl(state.baseAvatarId) ||
        null
      : null);
  const categories = getAvatarCategories(screen.avatarCatalog);
  const filteredAvatars = screen.getFilteredEditorAvatars();
  const submitDisabled = screen.isEditorSubmitDisabled();

  return `
    <div class="profile-screen phone-profile-screen phone-profile-editor-screen" data-phone-profile-root>
      <div class="phone-profile-editor-scroll" data-phone-profile-editor-scroll>
        <header class="phone-profile-editor-header">
          <button type="button" class="phone-profile-editor-cancel" data-action="cancel-editor">
            ${escapeHtml(t("profile_cancel", {}, "Cancel"))}
          </button>
          <span class="phone-profile-editor-title">${escapeHtml(editorTitle)}</span>
          <button type="button"
                  class="phone-profile-editor-submit${submitDisabled ? " is-disabled" : ""}"
                  data-action="submit-editor" ${submitDisabled ? "disabled" : ""}>
            ${escapeHtml(editorButtonLabel)}
          </button>
        </header>

        <div class="phone-profile-editor-preview">
          <div class="phone-profile-editor-preview-avatar" style="background:${escapeHtml(state.selectedColorHex || getDefaultProfileColor())}">
            ${
              previewAvatarUrl
                ? `<img class="phone-profile-editor-preview-image" src="${escapeHtml(previewAvatarUrl)}" alt="${escapeHtml(previewName)}"/>`
                : escapeHtml(getProfileInitial(String(state.name || "").trim()))
            }
          </div>
          <input class="phone-profile-editor-name-input"
                 type="text"
                 maxlength="20"
                 value="${escapeHtml(state.name || "")}"
                 placeholder="${escapeHtml(t("profile_name_placeholder", {}, "Profile name"))}"
                 data-role="editor-name-input"/>
        </div>

        <div class="phone-profile-editor-avatar-section">
          <div class="phone-profile-editor-avatar-title">${escapeHtml(t("profile_choose_avatar", {}, "Choose Avatar"))}</div>
          <div class="phone-profile-editor-category-row">
            ${categories
              .map(
                (category) => `
              <button type="button"
                      class="phone-profile-editor-category${state.category === category ? " is-selected" : ""}"
                      data-action="select-avatar-category" data-category="${escapeHtml(category)}">
                ${escapeHtml(categoryLabel(category))}
              </button>
            `
              )
              .join("")}
          </div>
          ${
            filteredAvatars.length
              ? `
            <div class="phone-profile-editor-avatar-grid">
              ${filteredAvatars
                .map(
                  (avatar) => `
                <button type="button"
                        class="phone-profile-editor-avatar-tile${state.selectedAvatarId === avatar.id ? " is-selected" : ""}"
                        data-action="select-avatar" data-avatar-id="${escapeHtml(avatar.id)}">
                  <img class="phone-profile-editor-avatar-image" src="${escapeHtml(avatar.imageUrl)}" alt="${escapeHtml(avatar.displayName)}"/>
                </button>
              `
                )
                .join("")}
            </div>
          `
              : `<div class="phone-profile-editor-avatar-empty">${escapeHtml(t("profile_choose_avatar", {}, "Choose Avatar"))}</div>`
          }
        </div>
      </div>
    </div>
    ${renderToastPhone(screen)}
  `;
}

// ---------------------------------------------------------------------------------------
// PIN entry screen — reads `screen.pinOverlayState`/`getRenderedPinOverlayState()`/
// `pinOverlayPhase`/`pinValue`/`pinOverlayError`/`isPinOperationInProgress`/`pinEntryStage`
// directly (the exact same state TV's own `renderPinOverlay()` reads).
// ---------------------------------------------------------------------------------------

function renderPinBoxesPhone(screen) {
  const isError = Boolean(screen.pinOverlayError);
  return Array.from({ length: PROFILE_PIN_LENGTH }, (_, index) => {
    const isFilled = index < screen.pinValue.length;
    return `<span class="phone-profile-pin-box${isFilled ? " is-filled" : ""}${isError ? " is-error" : ""}" aria-hidden="true"></span>`;
  }).join("");
}

function renderPinKeypadPhone() {
  return PIN_KEYS.map((value) => {
    if (value === "delete") {
      return `
        <button type="button" class="phone-profile-pin-key phone-profile-pin-key-delete"
                data-pin-key="delete" aria-label="Delete digit">
          ${DELETE_KEY_ICON}
        </button>
      `;
    }
    return `<button type="button" class="phone-profile-pin-key" data-pin-key="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
  }).join("");
}

function renderPinScreen(screen) {
  const state = screen.getRenderedPinOverlayState();
  const profile = screen.getPinOverlayProfile();
  if (!state || !profile) {
    return renderGridScreen(screen);
  }

  const phaseClass =
    screen.pinOverlayPhase === "closing"
      ? " is-closing"
      : screen.pinOverlayPhase === "opening"
        ? " is-opening"
        : " is-open";
  const isSingleEntryMode = state.type !== "set";
  let heading = PROFILE_PIN_TEXT.headingSet(profile.name);
  let support = PROFILE_PIN_TEXT.supportSet;

  if (state.type === "unlock") {
    heading = PROFILE_PIN_TEXT.headingUnlock(profile.name);
    support = PROFILE_PIN_TEXT.supportUnlock;
  } else if (state.type === "verify-change") {
    heading = PROFILE_PIN_TEXT.headingVerifyChange(profile.name);
    support = PROFILE_PIN_TEXT.supportVerifyChange;
  } else if (state.type === "verify-remove") {
    heading = PROFILE_PIN_TEXT.headingVerifyRemove(profile.name);
    support = PROFILE_PIN_TEXT.supportVerifyRemove;
  } else if (screen.pinEntryStage === "confirm") {
    heading = PROFILE_PIN_TEXT.headingConfirm;
    support = PROFILE_PIN_TEXT.supportConfirm;
  }

  if (screen.pinOverlayError) {
    support = screen.pinOverlayError;
  } else if (screen.isPinOperationInProgress) {
    support = isSingleEntryMode ? PROFILE_PIN_TEXT.verifying : PROFILE_PIN_TEXT.saving;
  }

  const avatarUrl = avatarUrlFor(screen, profile);

  return `
    <div class="profile-screen phone-profile-screen phone-profile-pin-screen${phaseClass}" data-phone-profile-root>
      <div class="phone-profile-pin-content">
        <div class="phone-profile-pin-avatar" style="background:${escapeHtml(profile.avatarColorHex || getDefaultProfileColor())}">
          ${
            avatarUrl
              ? `<img class="phone-profile-pin-avatar-image" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profile.name)}"/>`
              : escapeHtml(getProfileInitial(profile.name))
          }
        </div>
        <div class="phone-profile-pin-heading">${escapeHtml(heading)}</div>
        <div class="phone-profile-pin-box-row">${renderPinBoxesPhone(screen)}</div>
        <div class="phone-profile-pin-support${screen.pinOverlayError ? " is-error" : ""}">${escapeHtml(support)}</div>
        <div class="phone-profile-pin-keypad">${renderPinKeypadPhone()}</div>
        ${
          isSingleEntryMode
            ? `<div class="phone-profile-pin-forgot">${escapeHtml(PROFILE_PIN_TEXT.forgot)}</div>`
            : ""
        }
        <button type="button" class="phone-profile-pin-cancel" data-phone-pin-cancel>
          ${escapeHtml(t("profile_cancel", {}, "Cancel"))}
        </button>
      </div>
    </div>
    ${renderToastPhone(screen)}
  `;
}

// ---------------------------------------------------------------------------------------
// Shared toast
// ---------------------------------------------------------------------------------------

function renderToastPhone(screen) {
  if (!screen.pinActionMessage) {
    return "";
  }
  return `
    <div class="phone-profile-toast" role="status" aria-live="polite">
      ${escapeHtml(screen.pinActionMessage)}
    </div>
  `;
}

// ---------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------

/** Returns the full phone profile-selection screen markup for whichever of the three mutually
 * exclusive states (`screen.pinOverlayState`/`getRenderedPinOverlayState()`,
 * `screen.editorState`, or the plain grid) is currently active — the same three states TV's own
 * `render()` already branches on. */
export function renderProfileSelectionScreenPhone(screen) {
  if (screen.getRenderedPinOverlayState()) {
    return renderPinScreen(screen);
  }
  if (screen.editorState) {
    return renderEditorScreen(screen);
  }
  return renderGridScreen(screen);
}

/** Wires the phone profile screen's interactivity after `renderProfileSelectionScreenPhone`'s
 * markup has been inserted into `container`. Returns a teardown function; also stores it on
 * `screen._phoneProfileTeardown` so `cleanupProfileSelectionScreenPhone(screen)` can call it
 * without the caller needing to keep the reference itself. */
export function mountProfileSelectionScreenPhone(screen, container) {
  cleanupProfileSelectionScreenPhone(screen);

  const cardButtons = Array.from(container.querySelectorAll("[data-profile-id]"));
  cardButtons.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      void handlePhoneProfileCardTap(screen, button.dataset.profileId);
    };
  });

  const toggleButton = container.querySelector("[data-phone-toggle-manage]");
  if (toggleButton) {
    toggleButton.onclick = (event) => {
      event.preventDefault();
      screen.isManagementMode = !screen.isManagementMode;
      screen.render();
    };
  }

  // Editor buttons (category chips, avatar tiles, submit, cancel) carry the exact same
  // data-action contract TV's own editor markup uses — dispatch through the screen's own
  // `activateFocusedNode`, unmodified.
  const actionButtons = Array.from(container.querySelectorAll("[data-action]"));
  actionButtons.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      if (button.disabled) {
        return;
      }
      void screen.activateFocusedNode(button);
    };
  });

  const nameInput = container.querySelector("[data-role='editor-name-input']");
  if (nameInput) {
    nameInput.oninput = (event) => {
      const nextValue = String(event.target?.value || "").slice(0, 20);
      screen.editorState.name = nextValue;
      if (event.target.value !== nextValue) {
        event.target.value = nextValue;
      }
      screen.syncEditorPreview();
    };
  }

  const pinKeyButtons = Array.from(container.querySelectorAll("[data-pin-key]"));
  pinKeyButtons.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      void screen.activatePinKey(button.dataset.pinKey);
    };
  });

  const pinCancelButton = container.querySelector("[data-phone-pin-cancel]");
  if (pinCancelButton) {
    pinCancelButton.onclick = (event) => {
      event.preventDefault();
      screen.closePinOverlay();
    };
  }

  const teardown = () => {
    cardButtons.forEach((button) => {
      button.onclick = null;
    });
    if (toggleButton) {
      toggleButton.onclick = null;
    }
    actionButtons.forEach((button) => {
      button.onclick = null;
    });
    if (nameInput) {
      nameInput.oninput = null;
    }
    pinKeyButtons.forEach((button) => {
      button.onclick = null;
    });
    if (pinCancelButton) {
      pinCancelButton.onclick = null;
    }
  };

  screen._phoneProfileTeardown = teardown;
  return teardown;
}

/** Reuses `screen.updateBackground(colorHex)` completely unmodified (see file header) for
 * whichever profile is contextually relevant to the currently-rendered phone screen. */
export function syncProfileSelectionScreenPhoneBackground(screen) {
  const pinState = screen.getRenderedPinOverlayState();
  if (pinState) {
    const profile = screen.getPinOverlayProfile();
    if (profile) {
      screen.updateBackground(profile.avatarColorHex || getDefaultProfileColor());
    }
    return;
  }
  if (screen.editorState) {
    const editTarget = screen.editorState.profileId
      ? screen.getProfileById(screen.editorState.profileId)
      : null;
    screen.updateBackground(
      screen.editorState.selectedColorHex || editTarget?.avatarColorHex || getDefaultProfileColor()
    );
    return;
  }
  const activeProfile = screen.getProfileById(screen.activeProfileId);
  screen.updateBackground(activeProfile?.avatarColorHex || getDefaultProfileColor());
}

/** Tears down whatever `mountProfileSelectionScreenPhone` last wired up, if anything, and
 * closes any open management-mode bottom sheet. Safe to call when nothing is mounted (e.g. the
 * screen has never rendered in phone mode). */
export function cleanupProfileSelectionScreenPhone(screen) {
  screen._phoneProfileTeardown?.();
  screen._phoneProfileTeardown = null;
  closeActiveBottomSheet();
}
