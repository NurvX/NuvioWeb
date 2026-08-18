import { browserAdapter } from "./adapters/browserAdapter.js";
import { webosAdapter } from "./adapters/webosAdapter.js";
import { tizenAdapter } from "./adapters/tizenAdapter.js";

const ADAPTERS = {
  browser: browserAdapter,
  webos: webosAdapter,
  tizen: tizenAdapter
};

// Single documented phone breakpoint, matching the --phone-* CSS tokens' own
// @media (max-width: 600px) scoping in css/base.css — keep these in sync.
const PHONE_VIEWPORT_QUERY = "(max-width: 600px)";

function parseWebOsMajorVersion() {
  const candidates = [
    String(globalThis.PalmSystem?.deviceInfo || ""),
    String(globalThis.webOSSystem?.deviceInfo || ""),
    String(globalThis.navigator?.userAgent || "")
  ].filter(Boolean);

  const patterns = [
    /web0s\.tv[\s\-\/]?(\d{1,2})/i,
    /webos\.tv[\s\-\/]?(\d{1,2})/i,
    /web0s[\s\-\/]?(\d{1,2})/i,
    /webos[\s\-\/]?(\d{1,2})/i,
    /chromium\/(\d{2,3})/i,
    /chrome\/(\d{2,3})/i
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (!match) {
        continue;
      }
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      if (/chrom(e|ium)\//i.test(pattern.source)) {
        if (value <= 53) return 3;
        if (value <= 68) return 4;
        if (value <= 79) return 5;
        if (value <= 87) return 6;
        if (value <= 94) return 22;
        if (value <= 108) return 23;
        if (value <= 120) return 24;
        return 25;
      }
      return value;
    }
  }
  return 0;
}

function detectPlatformName() {
  const override = String(globalThis.__NUVIO_PLATFORM__ || "")
    .trim()
    .toLowerCase();
  if (override && ADAPTERS[override]) {
    return override;
  }
  const searchParams = String(globalThis.location?.search || "").toLowerCase();
  if (searchParams.includes("wrapper=tizen") || searchParams.includes("source=tizenbrew")) {
    return "tizen";
  }
  const userAgent = String(globalThis.navigator?.userAgent || "").toLowerCase();
  if (globalThis.webOS || globalThis.PalmSystem || globalThis.webOSSystem) {
    return "webos";
  }
  if (userAgent.includes("webos") || userAgent.includes("web0s")) {
    return "webos";
  }
  const webapis = globalThis.webapis || {};
  if (
    globalThis.tizen ||
    globalThis.avplay ||
    webapis.avplay ||
    webapis.avPlay ||
    webapis.productinfo ||
    userAgent.includes("tizen")
  ) {
    return "tizen";
  }
  return "browser";
}

function getAdapter() {
  if (!Platform.current) {
    Platform.current = ADAPTERS[detectPlatformName()];
  }
  return Platform.current;
}

export const Platform = {
  current: null,

  init() {
    const adapter = getAdapter();
    adapter.init?.();
    return adapter;
  },

  getName() {
    return getAdapter().name;
  },

  isWebOS() {
    return this.getName() === "webos";
  },

  getWebOsMajorVersion() {
    if (!this.isWebOS()) {
      return 0;
    }
    return parseWebOsMajorVersion();
  },

  isTizen() {
    return this.getName() === "tizen";
  },

  isBrowser() {
    return this.getName() === "browser";
  },

  // True only for a plain-browser session at a phone-width viewport — the switch a
  // phone-mode screen render checks to decide whether to render its phone layout instead
  // of the TV one. Tizen/webOS never hit this, since they're never `isBrowser()`.
  isPhoneViewport() {
    if (!this.isBrowser() || typeof globalThis.matchMedia !== "function") {
      return false;
    }
    return globalThis.matchMedia(PHONE_VIEWPORT_QUERY).matches;
  },

  // Calls `callback(isPhoneViewport)` whenever the viewport crosses the phone breakpoint in
  // either direction, so a screen can re-render live as its window is resized. Returns an
  // unsubscribe function. No-op (returns a no-op unsubscribe) outside the browser platform.
  watchPhoneViewport(callback) {
    if (
      typeof callback !== "function" ||
      !this.isBrowser() ||
      typeof globalThis.matchMedia !== "function"
    ) {
      return () => {};
    }
    const mediaQueryList = globalThis.matchMedia(PHONE_VIEWPORT_QUERY);
    const handleChange = () => callback(mediaQueryList.matches);
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleChange);
      return () => mediaQueryList.removeEventListener("change", handleChange);
    }
    // Safari <14 / older WebKit fallback.
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  },

  exitApp() {
    if (globalThis.document && typeof globalThis.CustomEvent === "function") {
      const beforeExitEvent = new CustomEvent("nuvio:beforeExitApp", {
        cancelable: true
      });
      globalThis.document.dispatchEvent(beforeExitEvent);
      if (beforeExitEvent.defaultPrevented) {
        return false;
      }
    }
    return getAdapter().exitApp();
  },

  isBackEvent(event) {
    return getAdapter().isBackEvent(event);
  },

  normalizeKey(event) {
    return getAdapter().normalizeKey(event);
  },

  getDeviceLabel() {
    return getAdapter().getDeviceLabel();
  },

  getCapabilities() {
    return getAdapter().getCapabilities();
  },

  prepareVideoElement(videoElement) {
    return getAdapter().prepareVideoElement?.(videoElement);
  }
};
