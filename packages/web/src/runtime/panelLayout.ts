// All the arithmetic behind the two resizable side panels, kept as pure
// functions so the parts that are easy to get subtly wrong — the chat pane
// silently squeezing to nothing, a drag past the minimum, restoring a
// stored width from a previous session against a narrower window — can be
// pinned down without rendering anything (see panelLayout.test.ts).
//
// Nothing here touches the DOM, `window`, or storage. The React side of it
// lives in usePanelLayout.ts.

export type PanelSide = "left" | "right";

export interface PanelState {
  /** Width in px when expanded. Kept while collapsed on purpose: expanding
   *  a rail restores the width you last dragged it to, not a default. */
  width: number;
  collapsed: boolean;
}

export interface PanelLayoutState {
  left: PanelState;
  right: PanelState;
}

export interface PanelLimits {
  min: number;
  max: number;
  default: number;
}

/** Width of a collapsed panel — the "very thin vertical bar" that holds
 *  only the expand control and, on the right, a vertical label. Wide enough
 *  for a 32px icon button plus breathing room. */
export const RAIL_WIDTH = 44;

/** The chat pane is the one column that must never be squeezed away: it is
 *  what the app is for. Both panels are clamped against it rather than
 *  against the window alone. */
export const CENTER_MIN_WIDTH = 360;

/** Drag a divider this far past a panel's minimum and it collapses, so the
 *  gesture alone gets you to the rail without hunting for the button.
 *  Dragging back out expands it again — the divider stays live on a rail. */
export const COLLAPSE_SNAP_DISTANCE = 60;

export const PANEL_LIMITS: Record<PanelSide, PanelLimits> = {
  // Below ~208px the two-line thread rows start truncating titles to
  // uselessness; above ~420px the sidebar stops reading as a sidebar.
  left: { min: 208, max: 420, default: 264 },
  // The draft preview renders a real WordPress page, so its minimum is the
  // point below which that page's own layout starts collapsing into its
  // mobile breakpoint and stops being a useful preview of the desktop site.
  right: { min: 320, max: 760, default: 460 },
};

export const DEFAULT_PANEL_LAYOUT: PanelLayoutState = {
  left: { width: PANEL_LIMITS.left.default, collapsed: false },
  right: { width: PANEL_LIMITS.right.default, collapsed: false },
};

export const PANEL_LAYOUT_STORAGE_KEY = "solyx.panel-layout.v1";

function withPanel(state: PanelLayoutState, side: PanelSide, panel: PanelState): PanelLayoutState {
  // Written out rather than `{ ...state, [side]: panel }` — a computed key
  // widens the result's type and loses PanelLayoutState.
  return side === "left" ? { ...state, left: panel } : { ...state, right: panel };
}

function otherSide(side: PanelSide): PanelSide {
  return side === "left" ? "right" : "left";
}

/** What this panel actually occupies in the grid right now. */
export function columnWidth(panel: PanelState): number {
  return panel.collapsed ? RAIL_WIDTH : panel.width;
}

/**
 * The widest this panel may become without pushing the chat pane below
 * CENTER_MIN_WIDTH. Never returns less than the panel's own minimum: on a
 * window too narrow to satisfy everyone, the panels hold their minimums and
 * the chat pane takes the squeeze, because a sidebar thinner than its
 * minimum is unreadable while a slightly narrow chat column is merely tight.
 *
 * `viewportWidth` may be Infinity, which means "no window constraint known
 * yet" — used when reading a stored layout back before mount.
 */
export function maxWidthFor(side: PanelSide, state: PanelLayoutState, viewportWidth: number): number {
  const room = viewportWidth - columnWidth(state[otherSide(side)]) - CENTER_MIN_WIDTH;
  return Math.max(PANEL_LIMITS[side].min, Math.min(PANEL_LIMITS[side].max, room));
}

export function clampPanelWidth(
  side: PanelSide,
  width: number,
  state: PanelLayoutState,
  viewportWidth: number,
): number {
  const bounded = Math.min(Math.max(width, PANEL_LIMITS[side].min), maxWidthFor(side, state, viewportWidth));
  return Math.round(bounded);
}

/**
 * The panel width implied by a divider sitting at `pointerX` (viewport
 * coordinates). The layout grid starts at x=0 and fills the window, so the
 * left panel's width is the pointer position itself and the right panel's
 * is the distance from the pointer to the right edge — no element offsets
 * to measure, and no accumulated delta to drift.
 */
export function widthFromPointer(side: PanelSide, pointerX: number, viewportWidth: number): number {
  return side === "left" ? pointerX : viewportWidth - pointerX;
}

/** One frame of a divider drag. */
export function resizeFromPointer(
  state: PanelLayoutState,
  side: PanelSide,
  pointerX: number,
  viewportWidth: number,
): PanelLayoutState {
  const desired = widthFromPointer(side, pointerX, viewportWidth);
  if (desired < PANEL_LIMITS[side].min - COLLAPSE_SNAP_DISTANCE) {
    return setCollapsed(state, side, true);
  }
  // Reached from a collapsed rail too: dragging the divider back out is the
  // mirror of the gesture that collapsed it.
  return withPanel(state, side, {
    width: clampPanelWidth(side, desired, state, viewportWidth),
    collapsed: false,
  });
}

export function setCollapsed(state: PanelLayoutState, side: PanelSide, collapsed: boolean): PanelLayoutState {
  const panel = state[side];
  if (panel.collapsed === collapsed) return state;
  return withPanel(state, side, { ...panel, collapsed });
}

export function togglePanel(state: PanelLayoutState, side: PanelSide): PanelLayoutState {
  return setCollapsed(state, side, !state[side].collapsed);
}

/**
 * Keyboard resize from a focused divider (arrow keys). The sign flips with
 * the side: a left divider pushed right widens the sidebar, a right divider
 * pushed right narrows the preview, which is what "right" looks like from
 * the user's side of the screen in both cases.
 */
export function nudgePanel(
  state: PanelLayoutState,
  side: PanelSide,
  deltaPx: number,
  viewportWidth: number,
): PanelLayoutState {
  const panel = state[side];
  if (panel.collapsed) return state;
  const signed = side === "left" ? deltaPx : -deltaPx;
  return withPanel(state, side, {
    ...panel,
    width: clampPanelWidth(side, panel.width + signed, state, viewportWidth),
  });
}

/** Double-click a divider: back to the width the app ships with. */
export function resetPanel(state: PanelLayoutState, side: PanelSide, viewportWidth: number): PanelLayoutState {
  return withPanel(state, side, {
    width: clampPanelWidth(side, PANEL_LIMITS[side].default, state, viewportWidth),
    collapsed: false,
  });
}

/**
 * Re-clamp both panels against a (usually new) window width — on mount
 * after restoring a stored layout, and on every window resize. Left is
 * clamped first and right is then clamped against that result, so the two
 * can't each independently claim the same remaining pixels.
 */
export function reflow(state: PanelLayoutState, viewportWidth: number): PanelLayoutState {
  const afterLeft = withPanel(state, "left", {
    ...state.left,
    width: clampPanelWidth("left", state.left.width, state, viewportWidth),
  });
  return withPanel(afterLeft, "right", {
    ...afterLeft.right,
    width: clampPanelWidth("right", afterLeft.right.width, afterLeft, viewportWidth),
  });
}

function readPanel(raw: unknown, side: PanelSide): PanelState {
  const fallback = DEFAULT_PANEL_LAYOUT[side];
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const width = typeof obj.width === "number" && Number.isFinite(obj.width) ? obj.width : fallback.width;
  return {
    // Clamped against the static limits only — the window width isn't known
    // at parse time, so reflow() finishes the job on mount.
    width: clampPanelWidth(side, width, DEFAULT_PANEL_LAYOUT, Number.POSITIVE_INFINITY),
    collapsed: obj.collapsed === true,
  };
}

/**
 * Restores a layout persisted by a previous session. Anything unparseable,
 * missing, or out of range falls back per-field rather than throwing —
 * a corrupt storage entry must not cost someone their app.
 */
export function parsePanelLayout(raw: string | null | undefined): PanelLayoutState {
  if (!raw) return DEFAULT_PANEL_LAYOUT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_PANEL_LAYOUT;
  const obj = parsed as Record<string, unknown>;
  return { left: readPanel(obj.left, "left"), right: readPanel(obj.right, "right") };
}

export function serializePanelLayout(state: PanelLayoutState): string {
  return JSON.stringify(state);
}
