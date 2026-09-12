import { attachSwipe } from "../navigation/gestureEngine.js";

// Phone-only slide-up modal sheet host, ported from NuvioMobile's NuvioModalBottomSheet /
// NuvioBottomSheetActionRow (BottomSheet.kt) and shared by every phone bottom sheet (see
// parity ticket #51). Not a TV/D-pad component — `NuvioDialog` (nuvioDialog.js) remains the
// modal system for the TV UI.
//
// Two entry points over one host:
// - `openBottomSheet({ items, onDismiss })` — bare action rows (the original API, kept so
//   existing callers are untouched).
// - `openModalSheet({ title, subtitle, items, onDismiss })` — the same host with a sheet
//   header, mirroring how NuvioMobile sheets compose NuvioModalBottomSheet with an
//   EpisodeActionSheetHeader-style title/subtitle header (EpisodeWatchedActionSheet.kt).
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

function renderSheetHeader({ title, subtitle }) {
  const hasTitle = Boolean(String(title || "").trim());
  const hasSubtitle = Boolean(String(subtitle || "").trim());
  if (!hasTitle && !hasSubtitle) {
    return "";
  }
  return `
      <div class="phone-sheet-header">
        ${hasTitle ? `<div class="phone-sheet-title">${escapeHtml(title)}</div>` : ""}
        ${hasSubtitle ? `<div class="phone-sheet-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
  `;
}

function renderSheetMarkup({ headerHtml = "", noticeHtml = "", items = [] }) {
  return `
    <div class="phone-sheet" role="dialog" aria-modal="true">
      <div class="phone-sheet-drag-region">
        <div class="phone-sheet-handle"></div>
      </div>
      ${headerHtml}
      ${noticeHtml}
      <div class="phone-sheet-actions">
        ${items
          .map(
            (item, index) => `
          <button type="button" class="phone-sheet-action" data-index="${index}">
            ${item.icon ? `<span class="phone-sheet-action-icon">${item.icon}</span>` : ""}
            <span class="phone-sheet-action-title">${escapeHtml(item.title || "")}</span>
            ${item.trailing ? `<span class="phone-sheet-action-trailing">${item.trailing}</span>` : ""}
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

/**
 * Shared host behind `openBottomSheet`/`openModalSheet`. Only one sheet may be open at a
 * time — opening a new one closes any existing one first. Returns a controller exposing
 * `destroy()` and the live sheet `root` element.
 *
 * Selection contract: `openSheet` closes the sheet first and invokes the row's `onSelect`
 * afterwards (dismissFirst) — the same order NuvioMobile's sheets use
 * (`dismissNuvioBottomSheet(...)` before the action callback) so the caller's callback
 * never runs against a sheet that's still mounted. Rows that must stay open (in-place
 * toggles, picker rows) set `dismissFirst: false` and manage the controller themselves.
 */
function openSheet({ headerHtml = "", noticeHtml = "", items = [], onDismiss } = {}) {
  closeActiveBottomSheet();

  const backdrop = document.createElement("div");
  backdrop.className = "phone-sheet-backdrop";
  backdrop.innerHTML = renderSheetMarkup({ headerHtml, noticeHtml, items });
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
      // `dismissFirst: false` rows (in-place toggles/picker rows) stay open and manage the
      // sheet themselves — see the openSheet docblock's selection contract.
      if (item?.dismissFirst === false) {
        item.onSelect?.();
        return;
      }
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

/**
 * Opens a bottom sheet listing `items` ({icon, title, onSelect}) as full-width tappable
 * rows. Only one bottom sheet may be open at a time — opening a new one closes any existing
 * one first. Returns a controller exposing `destroy()`.
 */
export function openBottomSheet({ items = [], onDismiss } = {}) {
  return openSheet({ items, onDismiss });
}

/**
 * Opens the same host with a sheet header (`title` + optional `subtitle`), the composition
 * NuvioMobile's own sheets use (NuvioModalBottomSheet + EpisodeActionSheetHeader). Pass a raw
 * `headerHtml` to override the default text header with custom markup (e.g. the CW action
 * sheet's poster-header), and a raw `noticeHtml` for a non-interactive notice line between the
 * header and the action rows (e.g. the tracking picker's save-error). Returns the same
 * controller contract as `openBottomSheet`.
 */
export function openModalSheet({
  title = "",
  subtitle = "",
  headerHtml = "",
  noticeHtml = "",
  items = [],
  onDismiss
} = {}) {
  return openSheet({
    headerHtml: headerHtml !== "" ? headerHtml : renderSheetHeader({ title, subtitle }),
    noticeHtml,
    items,
    onDismiss
  });
}

/** Closes whatever bottom sheet is currently open, if any. Safe to call when none is open. */
export function closeActiveBottomSheet() {
  activeController?.destroy();
}
