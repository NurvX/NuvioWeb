import { I18n } from "../../../i18n/index.js";

// Phone render path for js/ui/screens/onboarding/experienceModeSelectionScreen.js (first-run
// onboarding, not part of the original mobile-parity ticket set — added after live testing on
// a real signed-in phone session surfaced this as the very first screen a new phone user hits
// after signing in).
//
// This is a visual-only rebuild, same shape as ticket 05-03: every card keeps the exact same
// `data-mode`/`data-layout` attribute the existing TV markup used, so
// ExperienceModeSelectionScreen's own container-level `click` listener (`this.onClick`, bound
// once in `mount()`, reading `event.target.closest("[data-mode], [data-layout]")`) keeps
// dispatching every tap exactly as it already did — nothing here re-implements or touches that
// dispatch, and no `.focusable` class is required for tap to work since that listener never
// goes through FocusEngine's `.focusable`-gated pointer dispatch (kept anyway, for the
// TV-shared keyboard-focus styling `ScreenUtils.moveFocus`/`setInitialFocus` rely on).

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LAYOUTS = [
  { id: "modern", key: "layout_modern", fallback: "Modern" },
  { id: "grid", key: "layout_grid", fallback: "Grid" },
  { id: "classic", key: "layout_classic", fallback: "Classic" }
];

function renderCard({ attr, value, title, subtitle }) {
  return `
    <button type="button" class="phone-onboarding-card focusable" data-index="0" data-${attr}="${escapeHtml(value)}">
      <span class="phone-onboarding-card-title">${escapeHtml(title)}</span>
      ${subtitle ? `<span class="phone-onboarding-card-subtitle">${escapeHtml(subtitle)}</span>` : ""}
    </button>
  `;
}

/** Returns the full phone experience-mode-selection markup, reading `screen.step` directly
 * (the exact same state TV's own `render()` reads). */
export function renderExperienceModeSelectionScreenPhone(screen) {
  const isLayout = screen.step === "layout";
  const cardsMarkup = isLayout
    ? LAYOUTS.map((layout) =>
        renderCard({ attr: "layout", value: layout.id, title: t(layout.key, layout.fallback) })
      ).join("")
    : `
      ${renderCard({
        attr: "mode",
        value: "ESSENTIAL",
        title: t("experience_mode_essential", "Essential"),
        subtitle: t(
          "experience_mode_essential_card_subtitle",
          "Focused setup, add-ons, playback basics, Trakt, and account settings."
        )
      })}
      ${renderCard({
        attr: "mode",
        value: "ADVANCED",
        title: t("experience_mode_advanced", "Advanced"),
        subtitle: t(
          "experience_mode_advanced_card_subtitle",
          "Full settings, layout controls, catalog order, collections, plug-ins, and diagnostics."
        )
      })}
    `;

  return `
    <div class="phone-auth-shell">
      <div class="phone-auth-scroll">
        <img class="phone-auth-logo" src="assets/brand/app_logo_wordmark.png" alt="Nuvio" />
        <h2 class="phone-auth-title">${escapeHtml(
          isLayout
            ? t("layout_selection_welcome", "Welcome to Nuvio")
            : t("experience_mode_choose_title", "Choose your Nuvio experience")
        )}</h2>
        <p class="phone-auth-subtitle">${escapeHtml(
          isLayout
            ? t("layout_selection_subtitle", "Choose how Nuvio should look on your TV.")
            : t(
                "experience_mode_choose_subtitle",
                "Start simple or unlock every customization. You can switch anytime."
              )
        )}</p>
        <div class="phone-onboarding-cards">${cardsMarkup}</div>
      </div>
    </div>
  `;
}
