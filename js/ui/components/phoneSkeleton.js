// Phone-only skeleton/shimmer loading placeholders, ported from NuvioMobile's shimmer
// loading system (see .scratch/mobile-parity/spec.md and ticket 00-06). These are pure
// markup helpers — later Phase 1+ screens (Home, Search, Library, Detail) import them for
// their own loading states; this ticket ships zero real screen consumers. Not a TV/D-pad
// component — no TV loading-state markup is touched.
//
// The shimmer sweep itself is a single CSS animation (`.phone-skeleton::after`, see
// css/phone.css) shared by every skeleton shape below — these helpers only decide sizing
// (matching posterCard.js's own dimensions/radius) and layout, not the shimmer effect.

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns markup for one generic rounded-rect skeleton block — a shimmering placeholder for
 * an arbitrary text line, button, or other rectangular UI shape. `width`/`height` accept any
 * valid CSS length (e.g. `"60%"`, `"120px"`); `radius` defaults to `--phone-radius-sm`. Pass
 * a `className` to add extra hooks (e.g. layout spacing) without needing a wrapper element.
 */
export function renderSkeletonBlock({
  width = "100%",
  height = "16px",
  radius = "var(--phone-radius-sm)",
  className = ""
} = {}) {
  const classes = ["phone-skeleton", className].filter(Boolean).join(" ");
  const style = `width:${escapeHtml(width)};height:${escapeHtml(height)};border-radius:${escapeHtml(
    radius
  )}`;
  return `<div class="${classes}" style="${style}" aria-hidden="true"></div>`;
}

/**
 * Returns markup for one poster-card-shaped skeleton, matching `posterCard.js`'s own
 * dimensions/radius (`.phone-poster` at 126px wide, `.phone-poster-card-portrait`/
 * `-landscape` aspect ratios, `--phone-radius-poster` corners). `aspect` is `"portrait"`
 * (default) or `"landscape"`, mirroring `renderPosterCard`'s own `aspect` prop. `hideLabels`
 * suppresses the two label-line placeholders below the artwork (pass `true` when the calling
 * screen also renders its real cards with `hideLabels: true`).
 */
export function renderSkeletonPosterCard({ aspect = "portrait", hideLabels = false } = {}) {
  const aspectClass =
    aspect === "landscape" ? "phone-poster-card-landscape" : "phone-poster-card-portrait";

  const labelsMarkup = hideLabels
    ? ""
    : `
      <div class="phone-poster-labels">
        ${renderSkeletonBlock({ width: "80%", height: "13px" })}
        ${renderSkeletonBlock({ width: "45%", height: "11px" })}
      </div>
    `;

  return `
    <div class="phone-poster phone-skeleton-poster">
      <div
        class="phone-skeleton phone-poster-card ${aspectClass}"
        aria-hidden="true"
      ></div>
      ${labelsMarkup}
    </div>
  `;
}

/**
 * Returns markup for one shelf-row-shaped skeleton — a title-bar placeholder plus a
 * horizontal row of `renderSkeletonPosterCard` placeholders, matching `phoneShelf.js`'s own
 * `.phone-shelf`/`.phone-shelf-header`/`.phone-shelf-row` structure. Used by Home/Search/
 * Library loading states while the real shelf data is still in flight. `count` controls how
 * many poster skeletons fill the row (default 4, enough to fill a typical phone viewport
 * width without the row needing to actually scroll). `aspect` is forwarded to every poster
 * skeleton in the row, matching `renderPhoneShelf`'s own `variant`-driven aspect.
 */
export function renderSkeletonShelf({ count = 4, aspect = "portrait" } = {}) {
  const safeCount = Math.max(1, Number(count) || 0);
  const cardsMarkup = Array.from({ length: safeCount })
    .map(() => renderSkeletonPosterCard({ aspect }))
    .join("");

  return `
    <section class="phone-shelf phone-skeleton-shelf" aria-hidden="true">
      <div class="phone-shelf-header">
        ${renderSkeletonBlock({ width: "140px", height: "22px" })}
      </div>
      <div class="phone-shelf-row">${cardsMarkup}</div>
    </section>
  `;
}
