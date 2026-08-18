import { Router } from "../navigation/router.js";
import { I18n } from "../../i18n/index.js";
import { SIDEBAR_NAV_ICONS } from "./sidebarNavigation.js";

// Floating-pill bottom tab bar for phone-mode screens, ported from NuvioMobile's
// NuvioNavigationBar (see .scratch/mobile-parity/spec.md). Follows the same reuse pattern
// as sidebarNavigation.js: a shared module each phone-mode top-level screen imports and
// renders into its own markup — not a persistent shell element. renderAppShell.js is
// untouched.

const SCROLL_COLLAPSE_THRESHOLD_PX = 60;
const SCROLL_BLUR_THRESHOLD_PX = 4;

// Icon artwork (Home/Search/Library) is shared with sidebarNavigation.js's TV sidebar via
// SIDEBAR_NAV_ICONS — the Settings tab intentionally diverges from that gear icon and shows
// the active profile's avatar instead, matching NuvioMobile's AppScreenTab.Settings tab.
const TABS = [
  { action: "gotoHome", route: "home", labelKey: "sidebar.home", iconType: "svg" },
  { action: "gotoSearch", route: "search", labelKey: "sidebar.search", iconType: "svg" },
  { action: "gotoLibrary", route: "library", labelKey: "sidebar.library", iconType: "svg" },
  { action: "gotoSettings", route: "settings", labelKey: "sidebar.settings", iconType: "profile" }
];

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

function tabIconMarkup(tab, profileState) {
  if (tab.iconType === "profile") {
    const avatarUrl = String(profileState?.activeProfileAvatarUrl || "").trim();
    const initial = profileState?.activeProfileInitial || "P";
    const colorHex = profileState?.activeProfileColorHex || "#666";
    return `
      <span class="phone-tabbar-avatar" style="background:${escapeHtml(colorHex)}">
        ${
          avatarUrl
            ? `<img class="phone-tabbar-avatar-image" src="${escapeHtml(avatarUrl)}" alt="" />`
            : escapeHtml(initial)
        }
      </span>
    `;
  }
  const icon = SIDEBAR_NAV_ICONS[tab.route];
  return `
    <svg class="phone-tabbar-icon" viewBox="${icon?.viewBox || "0 0 24 24"}" aria-hidden="true" focusable="false">
      ${icon?.iconMarkup || ""}
    </svg>
  `;
}

/**
 * Returns the floating-pill bottom tab bar's markup. `profileState` is the object returned
 * by `getSidebarProfileState()` (reused, not reimplemented) — pass `null` while it's still
 * loading and the Settings tab falls back to a generic icon-less avatar circle.
 */
export function renderPhoneNavBar({ selectedRoute = "home", profileState = null } = {}) {
  const items = TABS.map((tab) => {
    const isSelected = tab.route === selectedRoute;
    return `
      <button type="button"
              class="phone-tabbar-item focusable${isSelected ? " selected" : ""}"
              data-action="${tab.action}"
              data-route="${tab.route}"
              aria-label="${escapeHtml(t(tab.labelKey))}">
        <span class="phone-tabbar-item-highlight"></span>
        ${tabIconMarkup(tab, profileState)}
        <span class="phone-tabbar-label">${escapeHtml(t(tab.labelKey))}</span>
      </button>
    `;
  }).join("");

  return `
    <nav class="phone-tabbar" data-phone-tabbar>
      <div class="phone-tabbar-row">
        ${items}
      </div>
    </nav>
  `;
}

/**
 * Wires tap navigation and the scroll-driven expand/collapse + blur behavior. `scrollRoot`
 * is the element that actually scrolls (falls back to the tab bar's own container). Returns
 * a teardown function the caller should invoke from its own `cleanup()`.
 */
export function bindPhoneNavBarEvents(container, { currentRoute = "", scrollRoot = null } = {}) {
  const tabbar = container?.querySelector("[data-phone-tabbar]") || null;
  if (!tabbar) {
    return () => {};
  }

  const buttons = Array.from(tabbar.querySelectorAll(".phone-tabbar-item"));
  buttons.forEach((button) => {
    button.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const route = String(button.dataset.route || "");
      if (!route) {
        return;
      }
      if (route === currentRoute) {
        Router.getCurrentScreen()?.onSidebarReselect?.();
        return;
      }
      Router.navigate(route);
    };
  });

  const scrollTarget = scrollRoot || container;
  if (!scrollTarget) {
    return () => {
      buttons.forEach((button) => {
        button.onclick = null;
      });
    };
  }

  let lastScrollTop = Math.max(0, Number(scrollTarget.scrollTop || 0));

  const handleScroll = () => {
    const scrollTop = Math.max(0, Number(scrollTarget.scrollTop || 0));
    const delta = scrollTop - lastScrollTop;
    if (Math.abs(delta) >= SCROLL_COLLAPSE_THRESHOLD_PX) {
      tabbar.classList.toggle("collapsed", delta > 0 && scrollTop > SCROLL_COLLAPSE_THRESHOLD_PX);
      lastScrollTop = scrollTop;
    }
    tabbar.classList.toggle("blurred", scrollTop > SCROLL_BLUR_THRESHOLD_PX);
  };

  scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  return () => {
    buttons.forEach((button) => {
      button.onclick = null;
    });
    scrollTarget.removeEventListener("scroll", handleScroll);
  };
}
