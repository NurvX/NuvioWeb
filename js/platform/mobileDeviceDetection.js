const APPLE_MOBILE_PLATFORMS = ["iPhone", "iPad", "iPod"];

function hasTouchSupport() {
  return Boolean(
    globalThis.navigator?.maxTouchPoints > 0 || "ontouchend" in (globalThis.document || {})
  );
}

// iPadOS 13+ reports navigator.platform as "MacIntel" like a real Mac, so touch
// support is the only reliable signal left to tell the two apart.
function isIOS() {
  const platform = String(globalThis.navigator?.platform || "");
  const userAgent = String(globalThis.navigator?.userAgent || "");
  if (APPLE_MOBILE_PLATFORMS.includes(platform)) {
    return true;
  }
  return userAgent.includes("Mac") && hasTouchSupport();
}

function isAndroid() {
  return /android/i.test(String(globalThis.navigator?.userAgent || ""));
}

// Only meaningful when Platform.isBrowser() — a phone browser opening this
// app's URL, distinct from the webOS/Tizen TV runtimes.
export function detectMobileOs() {
  if (isIOS()) {
    return "ios";
  }
  if (isAndroid()) {
    return "android";
  }
  return "other";
}
