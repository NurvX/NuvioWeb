import { attachLongPress } from "../navigation/gestureEngine.js";

// Phone-only poster card, ported from NuvioMobile's poster-card visual system (top-sheen
// overlay, watched badge, continue-watching progress bar — see .scratch/mobile-parity/spec.md
// and ticket 00-04). Not a TV/D-pad component — the existing TV poster rendering in
// js/ui/screens/home layout files and js/ui/components/contentCard.js is untouched.
//
// Tap goes through the existing onPointerActivate contract (the card just needs the
// `focusable` class plus `data-action`/`data-id`, matching catalogSeeAllScreen.js's
// `.seeall-card.focusable[data-action]` convention) — nothing new is needed for that.
// Long-press is wired via gestureEngine.js's attachLongPress; the calling screen supplies
// `onLongPress` (this component does not hardcode what long-press does).

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clampProgress(progress) {
  if (progress === null || progress === undefined) {
    return null;
  }
  const value = Number(progress);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Returns markup for one phone poster card. `aspect` is `"portrait"` (2:3, the default —
 * `--phone-radius-poster` at 126x189px), `"landscape"` (16:9, used by episode cards and some
 * catalog styles), or `"circle"` (1:1 circular avatar, used by cast rows — ticket 02-01).
 * `progress` is a 0..1 fraction; pass `null`/`undefined` to omit the continue-watching
 * progress bar entirely (distinct from `0`, which renders an empty bar). `action`/`id` become
 * `data-action`/`data-id` on the tappable element so the calling screen's own
 * `onPointerActivate(target)` (the existing shared contract, e.g. catalogSeeAllScreen.js's
 * `target.closest("[data-action]")` pattern) can read them — posterCard.js does not dispatch
 * navigation itself.
 */
export function renderPosterCard({
  id = "",
  posterUrl = "",
  title = "",
  subtitle = "",
  aspect = "portrait",
  action = "openDetail",
  hideLabels = false,
  watched = false,
  progress = null
} = {}) {
  const aspectClass =
    aspect === "landscape"
      ? "phone-poster-card-landscape"
      : aspect === "circle"
        ? "phone-poster-card-circle"
        : "phone-poster-card-portrait";
  const clampedProgress = clampProgress(progress);

  const watchedBadgeMarkup = watched
    ? `
      <span class="phone-poster-watched-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" focusable="false">
          <path
            fill="currentColor"
            d="M9.55 17.6 4.4 12.45l1.4-1.4 3.75 3.75 8.65-8.65 1.4 1.4z"
          />
        </svg>
      </span>
    `
    : "";

  const progressMarkup =
    clampedProgress === null
      ? ""
      : `
      <span class="phone-poster-progress-track" aria-hidden="true">
        <span
          class="phone-poster-progress-fill"
          style="width:${(clampedProgress * 100).toFixed(2)}%"
        ></span>
      </span>
    `;

  const labelsMarkup = hideLabels
    ? ""
    : `
      <div class="phone-poster-labels">
        <div class="phone-poster-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="phone-poster-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
    `;

  return `
    <div class="phone-poster">
      <button
        type="button"
        class="phone-poster-card ${aspectClass} focusable"
        data-action="${escapeHtml(action)}"
        data-id="${escapeHtml(id)}"
        aria-label="${escapeHtml(title)}"
      >
        ${
          posterUrl
            ? `<img class="phone-poster-image" src="${escapeHtml(posterUrl)}" alt="" loading="lazy" />`
            : `<span class="phone-poster-image phone-poster-image-empty" aria-hidden="true"></span>`
        }
        <span class="phone-poster-sheen" aria-hidden="true"></span>
        ${watchedBadgeMarkup}
        ${progressMarkup}
      </button>
      ${labelsMarkup}
    </div>
  `;
}

/**
 * Wires long-press on every `.phone-poster-card` found under `container` via
 * `gestureEngine.attachLongPress`. `onLongPress(id, cardElement, event)` is invoked with the
 * card's `data-id`; tap is intentionally not re-wired here — it already flows through
 * `FocusEngine`'s existing `onPointerActivate` dispatch off the `focusable`/`data-action`
 * markup `renderPosterCard` renders, and `attachLongPress` marks `suppressNextTap` on a
 * genuine long-press so that trailing click doesn't also fire. `threshold`/`moveTolerance`
 * are passed straight through to `gestureEngine.attachLongPress` (hold duration in ms and
 * pointer-move cancel tolerance in px) — omit either to use its defaults. Returns a teardown
 * function.
 */
export function bindPosterCardEvents(container, { onLongPress, threshold, moveTolerance } = {}) {
  const cards = Array.from(container?.querySelectorAll?.(".phone-poster-card") || []);
  if (!cards.length || typeof onLongPress !== "function") {
    return () => {};
  }

  const detachers = cards.map((card) =>
    attachLongPress(card, {
      threshold,
      moveTolerance,
      onLongPress: (event) => onLongPress(String(card.dataset.id || ""), card, event)
    })
  );

  return () => {
    detachers.forEach((detach) => detach());
  };
}
