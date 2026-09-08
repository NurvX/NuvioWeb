export function isWebOsImageProxyUrl() {
  return false;
}

export function isWebOsImageProxyReady() {
  return true;
}

export function onWebOsImageProxyReady(_listener) {
  return () => {};
}

export function ensureWebOsImageProxyReady() {
  return Promise.resolve(false);
}

export function proxifyImageUrl(value = "") {
  return String(value || "").trim();
}

export function normalizeImageUrl(value = "") {
  return String(value || "").trim();
}
