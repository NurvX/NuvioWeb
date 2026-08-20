import { I18n } from "../../i18n/index.js";
import { renderPosterCard, bindPosterCardEvents } from "./posterCard.js";

// Phone-only horizontal shelf/row primitive, ported from NuvioMobile's catalog-row layout
// (see .scratch/mobile-parity/spec.md and ticket 00-05). This is the highest-reuse component
// in the mobile-parity effort — Home catalog/collection rows, Detail related-content rows,
// Library horizontal mode, and Folder rows-mode all render one `renderPhoneShelf` per row
// once their own tickets wire them up. Not a TV/D-pad component — the TV home screen's
// manual-transform row positioning (`homeScreen.js`'s row scroller) is untouched, and this
// component deliberately does NOT port that mechanism: scrolling here is native browser
// horizontal scroll (`overflow-x: auto`), which is explicitly the epic spec's Out of Scope
// call for this ticket.
//
// Poster rendering itself is not reimplemented here — every card in the row is a real
// `posterCard.js` instance (`renderPosterCard`/`bindPosterCardEvents`), so tap-to-open
// continues to flow through the existing `onPointerActivate`/`focusable`/`data-action`
// contract those cards already wire up, and long-press continues to flow through
// `gestureEngine.attachLongPress` the same way a bare poster grid would.
//
// The "view all" chevron pill is chrome owned by this component (not a poster card), so it's
// wired with a native `.onclick` handler in `bindPhoneShelfEvents`, matching the same
// chrome-level tap convention already established by `phoneNavBar.js`/`bottomSheet.js`
// rather than depending on `FocusEngine`'s `onPointerActivate` dispatch.

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Poster aspect used per shelf `variant`. `"portrait"` (the default) is the standard catalog
 * row of upright poster cards; `"continueWatching"` renders the larger continue-watching-
 * style landscape cards NuvioMobile uses for in-progress items; `"cast"` (ticket 02-01)
 * renders small circular-avatar cards for a cast row.
 */
const VARIANT_ASPECT = {
  portrait: "portrait",
  continueWatching: "landscape",
  cast: "circle"
};

/**
 * Returns markup for one phone shelf/row: a `--phone-type-title-lg` section title, an
 * optional "view all" chevron pill on the right (rendered only when `viewAllLabel` is
 * truthy — pass it whenever the caller also supplies an `onViewAll` callback to
 * `bindPhoneShelfEvents`), and a horizontally-scrolling row of `posterCard.js` instances
 * built from `items`.
 *
 * `items` are plain objects forwarded as-is to `renderPosterCard` (`id`, `posterUrl`,
 * `title`, `subtitle`, `action`, `hideLabels`, `watched`, `progress`) — this function does
 * not reshape them, it only supplies the `aspect` implied by `variant` as each item's
 * default. An item carrying its own `aspect` (e.g. a collection-folder tile mixed into an
 * otherwise-portrait row) overrides that default, so a single row can mix card shapes.
 * `variant` is `"portrait"` (default, standard poster cards) or `"continueWatching"` (larger
 * landscape cards, sized via the `.phone-shelf-continuous` CSS scope). Returns an empty
 * string when `items` is empty — an empty shelf has nothing useful to render.
 */
export function renderPhoneShelf({
  id = "",
  title = "",
  items = [],
  variant = "portrait",
  viewAllLabel = ""
} = {}) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }

  const isContinuous = variant === "continueWatching";
  const isCast = variant === "cast";
  const aspect = VARIANT_ASPECT[variant] || VARIANT_ASPECT.portrait;

  const cardsMarkup = items.map((item) => renderPosterCard({ aspect, ...item })).join("");

  const viewAllMarkup = viewAllLabel
    ? `
      <button type="button" class="phone-shelf-view-all" data-shelf-view-all>
        <span>${escapeHtml(viewAllLabel)}</span>
        <svg
          class="phone-shelf-view-all-chevron"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 6l6 6-6 6"
          />
        </svg>
      </button>
    `
    : "";

  return `
    <section
      class="phone-shelf${isContinuous ? " phone-shelf-continuous" : ""}${isCast ? " phone-shelf-cast" : ""}"
      ${id ? `data-shelf-id="${escapeHtml(id)}"` : ""}
    >
      <div class="phone-shelf-header">
        <h2 class="phone-shelf-title">${escapeHtml(title)}</h2>
        ${viewAllMarkup}
      </div>
      <div class="phone-shelf-row">${cardsMarkup}</div>
    </section>
  `;
}

/**
 * Convenience wrapper around `t("action_see_all", ...)` so callers don't need to import
 * `I18n` themselves just to build a `viewAllLabel` for `renderPhoneShelf`.
 */
export function defaultPhoneShelfViewAllLabel() {
  return t("action_see_all", {}, "See All");
}

/**
 * Wires one rendered shelf's interactive chrome. `container` is any ancestor of a single
 * `renderPhoneShelf` output (the shelf `<section>` itself or a wrapper around it). Wires:
 *
 * - The "view all" button's tap to `onViewAll()` (native `.onclick`, chrome-level — see the
 *   file header comment for why this doesn't go through `FocusEngine`). No-op if the shelf
 *   was rendered without a `viewAllLabel`, or if `onViewAll` isn't supplied.
 * - Long-press on every poster card in the row, delegating straight to
 *   `posterCard.bindPosterCardEvents` (`onLongPress`/`threshold`/`moveTolerance` are passed
 *   through unchanged) — tap-to-open is not rewired here, it already flows through the
 *   poster cards' own `onPointerActivate` contract.
 *
 * Returns a teardown function that undoes both.
 */
export function bindPhoneShelfEvents(
  container,
  { onViewAll, onLongPress, threshold, moveTolerance } = {}
) {
  const viewAllButton = container?.querySelector?.(".phone-shelf-view-all") || null;
  if (viewAllButton && typeof onViewAll === "function") {
    viewAllButton.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      onViewAll();
    };
  }

  const detachLongPress = bindPosterCardEvents(container, {
    onLongPress,
    threshold,
    moveTolerance
  });

  return () => {
    if (viewAllButton) {
      viewAllButton.onclick = null;
    }
    detachLongPress();
  };
}
