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

export function renderWindowedGrid(grid, { items = [], renderCard = null, window = null } = {}) {
  if (!grid || typeof renderCard !== "function") {
    return;
  }
  const list = Array.isArray(items) ? items : [];
  const start = Math.max(0, Number(window?.startIndex) || 0);
  const end = Math.min(list.length, Math.max(start, Number(window?.endIndex) || 0));
  const top = Math.max(0, Number(window?.topSpacerPx) || 0);
  const bottom = Math.max(0, Number(window?.bottomSpacerPx) || 0);
  const spacer = (px) =>
    px > 0 ? `<div class="phone-grid-spacer" aria-hidden="true" style="height:${px}px"></div>` : "";
  const cards = list
    .slice(start, end)
    .map((item) => renderCard(item))
    .join("");
  grid.innerHTML = `${spacer(top)}${cards}${spacer(bottom)}`;
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
