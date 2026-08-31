import { Platform } from "../../platform/index.js";

// Chrome surfaces only — not repeated grid items (poster cards etc). Each of
// these is captured to a canvas and re-rendered through a WebGL shader every
// frame it's dirty; doing that for dozens of grid cards would be far too
// expensive even on a capable browser.
const GLASS_SELECTOR =
  ".home-sidebar, .nuvio-dialog-panel, .player-controls-bar, .settings-slide-panel";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function isEligible() {
  const rootClasses = document.documentElement.classList;
  return (
    Platform.isBrowser() &&
    !rootClasses.contains("no-backdrop-filter") &&
    !rootClasses.contains("performance-constrained") &&
    supportsWebGL()
  );
}

export const LiquidGlassController = {
  _instance: null,
  _initPromise: null,

  async init() {
    if (this._instance || this._initPromise || !isEligible()) {
      return;
    }
    this._initPromise = this._start();
    await this._initPromise;
  },

  async _start() {
    try {
      const { LiquidGlass } = await import("@ybouane/liquidglass");
      // Dialogs (NuvioDialog) mount directly to document.body, outside
      // #app, so the root must be document.body to see them too.
      const root = document.body;
      const glassElements = root.querySelectorAll(GLASS_SELECTOR);
      if (!glassElements.length) {
        return;
      }
      this._instance = await LiquidGlass.init({
        root,
        glassElements,
        defaults: {
          blurAmount: 0.55,
          refraction: 0.35,
          chromAberration: 0.15,
          cornerRadius: 20,
          opacity: 0.85,
          specular: 0.4,
          fresnel: 0.3,
          shadowOpacity: 0.25,
          shadowSpread: 12,
          shadowOffsetY: 6
        }
      });
      document.documentElement.classList.add("liquid-glass-active");
    } catch (error) {
      console.warn("LiquidGlass: failed to initialize", error);
    } finally {
      this._initPromise = null;
    }
  },

  // The library has no API to add/remove glass elements from a live
  // instance, so when the set of matching elements in the DOM changes
  // (screen navigation, a dialog opening/closing) the cheapest correct
  // option is to tear down and re-initialize.
  refresh() {
    if (!this._instance) {
      void this.init();
      return;
    }
    const root = this._instance.root;
    const current = root.querySelectorAll(GLASS_SELECTOR);
    const previous = this._instance.glassSet;
    let changed = current.length !== previous.size;
    if (!changed) {
      for (const element of current) {
        if (!previous.has(element)) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.destroy();
      void this.init();
    } else {
      this._instance.markChanged();
    }
  },

  destroy() {
    this._instance?.destroy();
    this._instance = null;
    this._initPromise = null;
    document.documentElement.classList.remove("liquid-glass-active");
  }
};
