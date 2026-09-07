import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/onboarding/essentialAddonSetupScreen.js (first-run
// onboarding, not part of the original mobile-parity ticket set — added after live testing on
// a real signed-in phone session surfaced this as unstyled TV UI directly downstream of
// experienceModeSelectionScreenPhone.js's "Essential" card).
//
// Visual-only rebuild, same shape/reasoning as experienceModeSelectionScreenPhone.js: cards
// keep the exact same `data-action` attribute the TV markup used, so
// EssentialAddonSetupScreen's own container-level `click` listener (bound once in `mount()`,
// reading `event.target.closest("[data-action]")`) keeps dispatching every tap unchanged —
// Preact renders real DOM nodes so that delegated listener needs no changes here.

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

/** Phone essential-addon-setup markup, mounted by EssentialAddonSetupScreen.render() via
 * mountPreact() when Platform.isPhoneViewport() is true. */
export function EssentialAddonSetupScreenPhone() {
  return (
    <div class="phone-auth-shell">
      <div class="phone-auth-scroll">
        <img class="phone-auth-logo" src="assets/brand/app_logo_wordmark.png" alt="Nuvio" />
        <h2 class="phone-auth-title">{t("essential_addon_setup_title", "Set up your add-ons")}</h2>
        <p class="phone-auth-subtitle">
          {t(
            "essential_addon_setup_subtitle",
            "Add a manifest URL manually now, or skip and configure add-ons later from Settings."
          )}
        </p>
        <div class="phone-onboarding-cards">
          <button
            type="button"
            class="phone-onboarding-card focusable"
            data-index="0"
            data-action="addons"
          >
            <span class="phone-onboarding-card-title">
              {t("addon_manage_from_phone_title", "Manage from phone")}
            </span>
            <span class="phone-onboarding-card-subtitle">
              {t(
                "addon_manage_addons_only_from_phone_subtitle",
                "Scan a QR code to install or remove add-ons from your phone"
              )}
            </span>
          </button>
          <button
            type="button"
            class="phone-onboarding-card focusable"
            data-index="1"
            data-action="skip"
          >
            <span class="phone-onboarding-card-title">
              {t("essential_addon_continue_for_now", "Continue for now")}
            </span>
            <span class="phone-onboarding-card-subtitle">
              {t("essential_addon_setup_subtitle", "You can add them later from Settings.")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
