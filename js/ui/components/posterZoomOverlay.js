// Phone-only long-press poster zoom overlay, ported from NuvioMobile's poster
// long-press-to-zoom interaction (see .scratch/mobile-parity/spec.md and ticket 01-01). Not a
// TV/D-pad component — the existing TV poster-hold-menu (homeScreen.js's
// posterHoldMenu/mountPosterHoldDialog) is untouched.
//
// Generic and reusable by design: the caller supplies the pressed poster element, the
// title/subtitle/artwork to show, and a plain `actions` list ({icon, label, onSelect,
// destructive}) — this module has no idea what screen or content type it's showing. The first
// consumer is js/ui/screens/home/homeScreenPhone.js, but nothing here is Home-specific; a
// future screen's own long-press handler can call `openPosterZoomOverlay` the same way.
//
// The zoom itself is a FLIP-lite transform: the pressed poster's on-screen rect is captured
// before the overlay opens, and the whole overlay sheet (poster + title/subtitle + actions)
// starts scaled/translated so its center sits at the poster's pressed position, then
// transitions to its natural centered/full-size layout via CSS `transform`/`transition` using
// `--phone-ease-emphasized` — not spring physics, per the epic spec's Fidelity trade-offs.
// Dismissing (backdrop tap, Escape, drag-down past threshold, or picking an action) reverses
// to a plain scale+fade rather than re-flying back to the exact press point.

const DISMISS_DRAG_DISTANCE_PX = 70;

let activeController = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actionIconMarkup(icon) {
  return icon ? `<span class="phone-zoom-action-icon">${icon}</span>` : "";
}

/**
 * Opens the zoom overlay for one poster. `posterElement` is the on-screen `.phone-poster-card`
 * (or any element) that was long-pressed — its current `getBoundingClientRect()` is used as
 * the animation's start point; pass `null` to skip the FLIP-lite animation and simply
 * scale/fade the overlay in centered (used when no live element is available, e.g. a
 * synthetic test).
 * `posterUrl`/`title`/`subtitle` describe the content; `aspect` is `"portrait"` (default) or
 * `"landscape"`, matching `posterCard.js`'s own aspect values. `actions` is a plain array of
 * `{ id, icon, label, onSelect, destructive }` rendered as a cascading list below the poster —
 * selecting one closes the overlay and then calls `onSelect()`. Only one overlay may be open
 * at a time — opening a new one closes any existing one first. Returns a controller exposing
 * `destroy()`.
 */
export function openPosterZoomOverlay({
  posterElement = null,
  posterUrl = "",
  title = "",
  subtitle = "",
  aspect = "portrait",
  actions = []
} = {}) {
  closeActivePosterZoomOverlay();

  const startRect = posterElement?.getBoundingClientRect?.() || null;

  const backdrop = document.createElement("div");
  backdrop.className = "phone-zoom-backdrop";
  backdrop.innerHTML = `
    <div class="phone-zoom-sheet">
      <div class="phone-zoom-poster-wrap">
        <div class="phone-zoom-poster phone-zoom-poster-${aspect === "landscape" ? "landscape" : "portrait"}">
          ${
            posterUrl
              ? `<img class="phone-zoom-poster-image" src="${escapeHtml(posterUrl)}" alt="" />`
              : `<span class="phone-zoom-poster-image phone-zoom-poster-image-empty" aria-hidden="true"></span>`
          }
        </div>
      </div>
      <div class="phone-zoom-copy">
        ${title ? `<div class="phone-zoom-title">${escapeHtml(title)}</div>` : ""}
        ${subtitle ? `<div class="phone-zoom-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <div class="phone-zoom-actions">
        ${actions
          .map(
            (action, index) => `
          <button type="button"
                  class="phone-zoom-action${action.destructive ? " phone-zoom-action-destructive" : ""}"
                  data-index="${index}"
                  style="transition-delay:${40 * index}ms">
            ${actionIconMarkup(action.icon)}
            <span class="phone-zoom-action-label">${escapeHtml(action.label || "")}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const sheet = backdrop.querySelector(".phone-zoom-sheet");

  // FLIP-lite: rather than tracking the poster's own fixed-position rect through the
  // overlay's whole layout (title/subtitle/actions all reflow around it), the entire sheet
  // is given a starting transform that places its center at the pressed poster's on-screen
  // center, scaled down to roughly the poster's own size — then transitions to its natural
  // centered/full-size layout position. This reads as "the poster grows from where you
  // pressed it, to center" without needing fixed-position math for every child.
  if (sheet && startRect) {
    const startCenterX = startRect.left + startRect.width / 2;
    const startCenterY = startRect.top + startRect.height / 2;
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const dx = startCenterX - viewportCenterX;
    const dy = startCenterY - viewportCenterY;
    const scale = Math.max(0.28, Math.min(0.6, startRect.width / 220));
    sheet.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    sheet.style.opacity = "0";
  }

  let destroyed = false;

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    backdrop.remove();
    if (activeController === controller) {
      activeController = null;
    }
  };

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      destroy();
    }
  };

  backdrop.querySelectorAll(".phone-zoom-action").forEach((button) => {
    button.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const index = Number(button.dataset.index || 0);
      const action = actions[index] || null;
      destroy();
      action?.onSelect?.();
    };
  });

  const onKeyDown = (event) => {
    if (event.key === "Escape" || Number(event.keyCode) === 27) {
      event.preventDefault();
      destroy();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  let dragStartY = null;
  backdrop.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.target.closest(".phone-zoom-poster-wrap, .phone-zoom-copy")) {
        return;
      }
      dragStartY = event.clientY;
    },
    { passive: true }
  );
  backdrop.addEventListener(
    "pointermove",
    (event) => {
      if (dragStartY === null) {
        return;
      }
      const dy = event.clientY - dragStartY;
      if (dy > 0 && sheet) {
        sheet.style.transform = `translateY(${dy}px)`;
      }
    },
    { passive: true }
  );
  const endDrag = (event) => {
    if (dragStartY === null) {
      return;
    }
    const dy = (event.clientY || 0) - dragStartY;
    dragStartY = null;
    if (sheet) {
      sheet.style.transform = "";
    }
    if (dy > DISMISS_DRAG_DISTANCE_PX) {
      destroy();
    }
  };
  backdrop.addEventListener("pointerup", endDrag, { passive: true });
  backdrop.addEventListener("pointercancel", endDrag, { passive: true });

  // Flip from the pressed-poster start transform (set above) to the sheet's natural
  // centered/full-size layout on the next frame, so the browser animates the change via the
  // CSS `transition` on `.phone-zoom-sheet`.
  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.opacity = "";
    }
  });

  const controller = { destroy };
  activeController = controller;
  return controller;
}

/** Closes whatever zoom overlay is currently open, if any. Safe to call when none is open. */
export function closeActivePosterZoomOverlay() {
  activeController?.destroy();
}
