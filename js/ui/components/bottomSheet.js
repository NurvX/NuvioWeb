import { attachSwipe } from "../navigation/gestureEngine.js";

// Phone-only slide-up action sheet, ported from NuvioMobile's NuvioModalBottomSheet /
// NuvioBottomSheetActionRow (see .scratch/mobile-parity/spec.md). Not a TV/D-pad component —
// `NuvioDialog` (nuvioDialog.js) remains the modal system for the TV UI.
//
// Screens integrate it the same way castDetailScreen.js/catalogSeeAllScreen.js already
// integrate PosterOptionsDialogController: keep the returned controller, and check it in the
// screen's own `consumeBackRequest()` — no new backstack concept.

const DISMISS_DRAG_DISTANCE_PX = 60;
const DISMISS_FLICK_VELOCITY = 0.5; // px/ms — a genuinely fast downward flick

let activeController = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Opens a bottom sheet listing `items` ({icon, title, onSelect}) as full-width tappable
 * rows. Only one bottom sheet may be open at a time — opening a new one closes any existing
 * one first. Returns a controller exposing `destroy()`.
 */
export function openBottomSheet({ items = [], onDismiss } = {}) {
  closeActiveBottomSheet();

  const backdrop = document.createElement("div");
  backdrop.className = "phone-sheet-backdrop";
  backdrop.innerHTML = `
    <div class="phone-sheet" role="dialog" aria-modal="true">
      <div class="phone-sheet-drag-region">
        <div class="phone-sheet-handle"></div>
      </div>
      <div class="phone-sheet-actions">
        ${items
          .map(
            (item, index) => `
          <button type="button" class="phone-sheet-action" data-index="${index}">
            ${item.icon ? `<span class="phone-sheet-action-icon">${item.icon}</span>` : ""}
            <span class="phone-sheet-action-title">${escapeHtml(item.title || "")}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const sheet = backdrop.querySelector(".phone-sheet");
  const dragRegion = backdrop.querySelector(".phone-sheet-drag-region");

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
    onDismiss?.();
  };

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      destroy();
    }
  };

  backdrop.querySelectorAll(".phone-sheet-action").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.index || 0);
      const item = items[index] || null;
      destroy();
      item?.onSelect?.();
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
        sheet.style.transform = `translateY(${dy}px)`;
      }
    },
    onSwipeEnd: () => {
      sheet.style.transform = "";
    },
    onDismiss: destroy,
    minDistance: DISMISS_DRAG_DISTANCE_PX,
    // attachSwipe's default minVelocity (tuned for a general "flick" gesture) is easy to
    // cross even during a slow, deliberate drag well short of the dismiss distance — a
    // sheet shouldn't disappear under someone's finger just because they dragged smoothly.
    // Require a genuinely fast flick to dismiss on velocity alone.
    minVelocity: DISMISS_FLICK_VELOCITY
  });

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
  });

  const controller = { destroy };
  activeController = controller;
  return controller;
}

/** Closes whatever bottom sheet is currently open, if any. Safe to call when none is open. */
export function closeActiveBottomSheet() {
  activeController?.destroy();
}
