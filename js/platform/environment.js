import { Platform } from "./index.js";
import { detectMobileOs } from "./mobileDeviceDetection.js";

export const Environment = {
  isWebOS() {
    return Platform.isWebOS();
  },

  isTizen() {
    return Platform.isTizen();
  },

  isBrowser() {
    return Platform.isBrowser();
  },

  isBackEvent(event) {
    return Platform.isBackEvent(event);
  },

  getDeviceLabel() {
    return Platform.getDeviceLabel();
  },

  // "ios" | "android" | "other". Only meaningful when isBrowser() is true —
  // a phone browser opening this app's URL, not the webOS/Tizen TV runtimes.
  getMobileOs() {
    return Platform.isBrowser() ? detectMobileOs() : "other";
  }
};
