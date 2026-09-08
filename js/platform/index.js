import { browserAdapter } from "./adapters/browserAdapter.js";

const PHONE_VIEWPORT_QUERY = "(max-width: 600px)";

export const Platform = {
  current: null,

  init() {
    this.current = browserAdapter;
    browserAdapter.init?.();
    return browserAdapter;
  },

  getName() {
    return (this.current || browserAdapter).name;
  },

  isWebOS() {
    return false;
  },

  getWebOsMajorVersion() {
    return 0;
  },

  isTizen() {
    return false;
  },

  isBrowser() {
    return true;
  },

  isPhoneViewport() {
    if (typeof globalThis.matchMedia !== "function") {
      return false;
    }
    return globalThis.matchMedia(PHONE_VIEWPORT_QUERY).matches;
  },

  watchPhoneViewport(callback) {
    if (typeof callback !== "function" || typeof globalThis.matchMedia !== "function") {
      return () => {};
    }
    const mediaQueryList = globalThis.matchMedia(PHONE_VIEWPORT_QUERY);
    const handleChange = () => callback(mediaQueryList.matches);
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleChange);
      return () => mediaQueryList.removeEventListener("change", handleChange);
    }
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
    return browserAdapter.exitApp();
  },

  isBackEvent(event) {
    return browserAdapter.isBackEvent(event);
  },

  normalizeKey(event) {
    return browserAdapter.normalizeKey(event);
  },

  getDeviceLabel() {
    return browserAdapter.getDeviceLabel();
  },

  getCapabilities() {
    return browserAdapter.getCapabilities();
  },

  prepareVideoElement(videoElement) {
    return browserAdapter.prepareVideoElement?.(videoElement);
  }
};
