import { attachSwipe } from "../../navigation/gestureEngine.js";

// Phone-only bottom-anchored track picker for the player's Subtitles/Audio/Speed capsule-bar
// entries (ticket 04-03, mobile-parity epic — see .scratch/mobile-parity/spec.md and
// .scratch/mobile-parity/issues/04-03-player-overlay-chrome.md). Deliberately NOT a
// `bottomSheet.js` reuse — the ticket calls for a distinct "vertical rail over a dimmed
// full-screen scrim" shape (a checkmarked track list, not an action-row sheet) — but it reuses
// the same lower-level `attachSwipe` primitive bottomSheet.js itself is built on for its
// drag-to-dismiss handle, so the two components share gesture behavior without one wrapping
// the other. Callers pass already-resolved track/option data (from playerScreen.js's existing
// `getSubtitleLanguageRailItems()` / `getAudioEntries()` / `getPlaybackSpeedOptions()`
// getters) — this module owns presentation only, never track-selection logic itself.

const DISMISS_DRAG_DISTANCE_PX = 60;
const DISMISS_FLICK_VELOCITY = 0.5; // px/ms — matches bottomSheet.js's "genuinely fast flick" bar

let activeController = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Opens a bottom-anchored vertical rail listing `items` ({id, label, secondary, selected,
 * disabled}) as tappable rows with a checkmark on the selected one. Only one rail (and at
 * most one bottom sheet, since they occupy the same visual layer) is meant to be open at a
 * time — opening a new rail closes any existing one first. `onSelect(id)` fires on tap of an
 * enabled row; the rail always closes itself afterward. Returns a controller exposing
 * `destroy()`.
 */
export function openPickerRail({ title = "", items = [], onSelect, onClose } = {}) {
  closeActivePickerRail();

  const backdrop = document.createElement("div");
  backdrop.className = "phone-picker-rail-backdrop";
  backdrop.innerHTML = `
    <div class="phone-picker-rail" role="dialog" aria-modal="true">
      <div class="phone-picker-rail-drag-region">
        <div class="phone-picker-rail-handle"></div>
      </div>
      ${title ? `<div class="phone-picker-rail-title">${escapeHtml(title)}</div>` : ""}
      <div class="phone-picker-rail-list">
        ${items
          .map(
            (item, index) => `
          <button type="button"
                  class="phone-picker-rail-item${item.selected ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}"
                  data-index="${index}"
                  ${item.disabled ? 'aria-disabled="true"' : ""}>
            <span class="phone-picker-rail-item-copy">
              <span class="phone-picker-rail-item-label">${escapeHtml(item.label || "")}</span>
              ${item.secondary ? `<span class="phone-picker-rail-item-secondary">${escapeHtml(item.secondary)}</span>` : ""}
            </span>
            ${
              item.selected
                ? `<span class="phone-picker-rail-item-check" aria-hidden="true">
                     <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
                       <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z" fill="currentColor"></path>
                     </svg>
                   </span>`
                : ""
            }
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const rail = backdrop.querySelector(".phone-picker-rail");
  const dragRegion = backdrop.querySelector(".phone-picker-rail-drag-region");

  let destroyed = false;

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    detachSwipe();
    document.removeEventListener("keydown", onKeyDown, true);
    backdrop.remove();
    if (activeController === controller) {
      activeController = null;
    }
    onClose?.();
  };

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      destroy();
    }
  };

  backdrop.querySelectorAll(".phone-picker-rail-item").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(button.dataset.index || 0);
      const item = items[index] || null;
      if (!item || item.disabled) {
        return;
      }
      destroy();
      onSelect?.(item.id, item);
    };
  });

  const onKeyDown = (event) => {
    if (event.key === "Escape" || Number(event.keyCode) === 27) {
      event.preventDefault();
      destroy();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  const detachSwipe = attachSwipe(dragRegion, {
    axis: "y",
    onSwipeMove: ({ dy }) => {
      if (dy > 0) {
        rail.style.transform = `translateY(${dy}px)`;
      }
    },
    onSwipeEnd: () => {
      rail.style.transform = "";
    },
    onDismiss: destroy,
    minDistance: DISMISS_DRAG_DISTANCE_PX,
    minVelocity: DISMISS_FLICK_VELOCITY
  });

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
  });

  const controller = { destroy };
  activeController = controller;
  return controller;
}

/** Closes whatever picker rail is currently open, if any. Safe to call when none is open. */
export function closeActivePickerRail() {
  activeController?.destroy();
}
