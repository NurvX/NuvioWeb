// Shared windowed poster-grid core (spec #34, research #32).
// Fixed-grid windowing for uniform poster grids: only the visible row window
// (plus overscan) stays mounted. DOM-free math lives in computeWindow so it is
// unit-testable; screens own scroll wiring and event binding and call in.

export const WINDOW_ITEM_THRESHOLD = 60;
export const DEFAULT_OVERSCAN_ROWS = 2;

export function shouldWindow(itemCount) {
  return Number(itemCount || 0) > WINDOW_ITEM_THRESHOLD;
}

export function computeWindow({
  itemCount = 0,
  columns = 3,
  rowHeight = 200,
  rowGap = 0,
  scrollTop = 0,
  viewportHeight = 600,
  overscanRows = DEFAULT_OVERSCAN_ROWS
} = {}) {
  const total = Math.max(0, Math.floor(Number(itemCount) || 0));
  const cols = Math.max(1, Math.floor(Number(columns) || 3));
  const rowStride = Math.max(1, Number(rowHeight || 0) + Number(rowGap || 0));
  if (!total) {
    return { startIndex: 0, endIndex: 0, topSpacerPx: 0, bottomSpacerPx: 0 };
  }
  const totalRows = Math.ceil(total / cols);
  const visibleRows = Math.max(1, Math.ceil(Number(viewportHeight || 0) / rowStride));
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, Number(scrollTop) || 0) / rowStride));
  const overscan = Math.max(0, Math.floor(Number(overscanRows) || 0));
  const startRow = Math.max(0, firstVisibleRow - overscan);
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRows + overscan);
  return {
    startIndex: Math.min(total, startRow * cols),
    endIndex: Math.min(total, endRow * cols),
    topSpacerPx: startRow * rowStride,
    bottomSpacerPx: Math.max(0, (totalRows - endRow) * rowStride)
  };
}

export function renderWindowedGrid(
  grid,
  { items = [], renderCard = null, range = null, scroller = null } = {}
) {
  if (!grid || typeof renderCard !== "function") {
    return;
  }
  const list = Array.isArray(items) ? items : [];
  // Fail open: a missing or malformed range renders everything. An unwound
  // grid costs scroll performance; an empty grid loses the user's data.
  const hasRange =
    Number.isFinite(Number(range?.startIndex)) && Number.isFinite(Number(range?.endIndex));
  const start = hasRange ? Math.max(0, Number(range.startIndex)) : 0;
  const end = hasRange
    ? Math.min(list.length, Math.max(start, Number(range.endIndex)))
    : list.length;
  const top = hasRange ? Math.max(0, Number(range.topSpacerPx) || 0) : 0;
  const bottom = hasRange ? Math.max(0, Number(range.bottomSpacerPx) || 0) : 0;
  const spacer = (px) =>
    px > 0 ? `<div class="phone-grid-spacer" aria-hidden="true" style="height:${px}px"></div>` : "";
  const cards = list
    .slice(start, end)
    .map((item) => renderCard(item))
    .join("");
  // Replacing innerHTML can collapse scroll height for a frame and clamp the
  // scroller back to the top — pin and restore around the write so the window
  // swap never moves the user's scroll position.
  const savedTop = scroller ? Number(scroller.scrollTop) || 0 : 0;
  grid.innerHTML = `${spacer(top)}${cards}${spacer(bottom)}`;
  if (scroller && savedTop > 0) {
    try {
      scroller.scrollTop = savedTop;
    } catch (_) {}
  }
}

// Measures live grid geometry: column count from the computed track list,
// row height from the first card, gap from computed style. Falls back to
// estimates when layout is unavailable (tests, pre-paint).
export function measureGrid(grid, { fallbackColumns = 3, fallbackRowHeight = 200 } = {}) {
  const fallback = {
    columns: fallbackColumns,
    rowHeight: fallbackRowHeight,
    rowGap: 0
  };
  try {
    if (!grid || typeof globalThis?.getComputedStyle !== "function") {
      return fallback;
    }
    const style = globalThis.getComputedStyle(grid);
    const tracks = String(style?.gridTemplateColumns || "")
      .split(" ")
      .filter(Boolean).length;
    const rowGap = Number.parseFloat(String(style?.rowGap || "")) || 0;
    const firstCard = grid.querySelector?.(".phone-poster, .phone-poster-card");
    const rowHeight = Number(firstCard?.offsetHeight) || 0;
    return {
      columns: tracks > 0 ? tracks : fallbackColumns,
      rowHeight: rowHeight > 0 ? rowHeight : fallbackRowHeight,
      rowGap: rowGap >= 0 ? rowGap : 0
    };
  } catch (_) {
    return fallback;
  }
}
