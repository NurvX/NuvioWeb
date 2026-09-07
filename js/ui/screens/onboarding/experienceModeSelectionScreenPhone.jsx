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
// dispatch (no onClick handlers are attached in this component, deliberately, to avoid firing
// the action twice), and no `.focusable` class is required for tap to work since that listener
// never goes through FocusEngine's `.focusable`-gated pointer dispatch (kept anyway, for the
// TV-shared keyboard-focus styling `ScreenUtils.moveFocus`/`setInitialFocus` rely on).

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

const LAYOUTS = [
  { id: "modern", key: "layout_modern", fallback: "Modern" },
  { id: "grid", key: "layout_grid", fallback: "Grid" },
  { id: "classic", key: "layout_classic", fallback: "Classic" }
];

function ModeCard({ attr, value, title, subtitle }) {
  const dataProps = attr === "layout" ? { "data-layout": value } : { "data-mode": value };
  return (
    <button type="button" class="phone-onboarding-card focusable" data-index="0" {...dataProps}>
      <span class="phone-onboarding-card-title">{title}</span>
      {subtitle ? <span class="phone-onboarding-card-subtitle">{subtitle}</span> : null}
    </button>
  );
}

/** Reads `screen.step` directly (the exact same state TV's own `render()` reads). */
export function ExperienceModeSelectionScreenPhone({ screen }) {
  const isLayout = screen.step === "layout";

  return (
    <div class="phone-auth-shell">
      <div class="phone-auth-scroll">
        <img class="phone-auth-logo" src="assets/brand/app_logo_wordmark.png" alt="Nuvio" />
        <h2 class="phone-auth-title">
          {isLayout
            ? t("layout_selection_welcome", "Welcome to Nuvio")
            : t("experience_mode_choose_title", "Choose your Nuvio experience")}
        </h2>
        <p class="phone-auth-subtitle">
          {isLayout
            ? t("layout_selection_subtitle", "Choose how Nuvio should look on your TV.")
            : t(
                "experience_mode_choose_subtitle",
                "Start simple or unlock every customization. You can switch anytime."
              )}
        </p>
        <div class="phone-onboarding-cards">
          {isLayout
            ? LAYOUTS.map((layout) => (
                <ModeCard
                  key={layout.id}
                  attr="layout"
                  value={layout.id}
                  title={t(layout.key, layout.fallback)}
                />
              ))
            : [
                <ModeCard
                  key="ESSENTIAL"
                  attr="mode"
                  value="ESSENTIAL"
                  title={t("experience_mode_essential", "Essential")}
                  subtitle={t(
                    "experience_mode_essential_card_subtitle",
                    "Focused setup, add-ons, playback basics, Trakt, and account settings."
                  )}
                />,
                <ModeCard
                  key="ADVANCED"
                  attr="mode"
                  value="ADVANCED"
                  title={t("experience_mode_advanced", "Advanced")}
                  subtitle={t(
                    "experience_mode_advanced_card_subtitle",
                    "Full settings, layout controls, catalog order, collections, plug-ins, and diagnostics."
                  )}
                />
              ]}
        </div>
      </div>
    </div>
  );
}
