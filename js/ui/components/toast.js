// Shared phone toast, ported from NuvioMobile's NuvioToastHost / NuvioToastController
// (Components.kt) — see parity ticket #51. One toast at a time (a new show replaces the
// current one), auto-dismissed after its duration, top-anchored under the status bar like
// the mobile host. TV keeps its own render-based toast (`profile-pin-toast` in
// components.css); this is the phone-path primitive screens migrate onto instead of
// hand-rolling `.something-toast` markup + timers per screen.

const DEFAULT_DURATION_MS = 2500; // matches NuvioToastController's default durationMillis
const TOAST_EXIT_MS = 180; // .phone-toast's exit transition length (css/phone.css)

let activeToast = null;
let nextToastId = 0;

/**
 * Shows `message` as the current toast, replacing any toast already showing. Returns a
 * controller (`{ id, dismiss }`), or `null` when `message` is blank (no-op, mirroring the
 * profile screen's empty-message behavior).
 */
export function showToast(message, { durationMs = DEFAULT_DURATION_MS } = {}) {
  const text = String(message ?? "").trim();
  if (!text) {
    return null;
  }

  // A replacement swaps instantly — no exit transition for the outgoing toast.
  dismissToast(null, { immediate: true });
  nextToastId += 1;
  const id = nextToastId;

  const root = document.createElement("div");
  root.className = "phone-toast";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.textContent = text;
  document.body.appendChild(root);
  requestAnimationFrame(() => {
    if (activeToast?.id === id) {
      root.classList.add("visible");
    }
  });

  const timer = setTimeout(
    () => {
      dismissToast(id);
    },
    Math.max(0, Number(durationMs) || 0)
  );

  activeToast = { id, root, timer };
  return {
    id,
    dismiss: () => dismissToast(id)
  };
}

/** Dismisses the current toast — immediately when `id` matches, never when it doesn't (a
 * stale controller dismissing a newer toast would be surprising). Safe to call when no
 * toast is showing. Replacements pass `immediate` so the outgoing root is dropped at once
 * instead of lingering through its exit transition. */
export function dismissToast(id = null, { immediate = false } = {}) {
  const toast = activeToast;
  if (!toast || (id !== null && toast.id !== id)) {
    return;
  }
  activeToast = null;
  clearTimeout(toast.timer);
  toast.root.classList.remove("visible");
  if (immediate) {
    toast.root.remove();
  } else {
    setTimeout(() => toast.root.remove(), TOAST_EXIT_MS);
  }
}
