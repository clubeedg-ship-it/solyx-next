import { describe, expect, it } from "vitest";
import {
  CENTER_MIN_WIDTH,
  COLLAPSE_SNAP_DISTANCE,
  DEFAULT_PANEL_LAYOUT,
  PANEL_LIMITS,
  RAIL_WIDTH,
  clampPanelWidth,
  columnWidth,
  nudgePanel,
  parsePanelLayout,
  reflow,
  resetPanel,
  resizeFromPointer,
  serializePanelLayout,
  setCollapsed,
  togglePanel,
  widthFromPointer,
  type PanelLayoutState,
} from "../runtime/panelLayout.js";

const WIDE = 1600;

function layout(left: Partial<PanelLayoutState["left"]> = {}, right: Partial<PanelLayoutState["right"]> = {}): PanelLayoutState {
  return {
    left: { ...DEFAULT_PANEL_LAYOUT.left, ...left },
    right: { ...DEFAULT_PANEL_LAYOUT.right, ...right },
  };
}

describe("columnWidth", () => {
  it("reports the rail width for a collapsed panel and the real width otherwise", () => {
    expect(columnWidth({ width: 300, collapsed: true })).toBe(RAIL_WIDTH);
    expect(columnWidth({ width: 300, collapsed: false })).toBe(300);
  });
});

describe("clampPanelWidth", () => {
  it("holds each panel inside its own min/max", () => {
    expect(clampPanelWidth("left", 50, layout(), WIDE)).toBe(PANEL_LIMITS.left.min);
    expect(clampPanelWidth("left", 9999, layout(), WIDE)).toBe(PANEL_LIMITS.left.max);
    expect(clampPanelWidth("right", 10, layout(), WIDE)).toBe(PANEL_LIMITS.right.min);
    expect(clampPanelWidth("right", 9999, layout(), WIDE)).toBe(PANEL_LIMITS.right.max);
  });

  it("never lets a panel squeeze the chat pane below its minimum", () => {
    // 1200px window, a 500px preview: the sidebar gets what's left over
    // after the chat pane's minimum, not its own 420px maximum.
    const state = layout({}, { width: 500 });
    expect(clampPanelWidth("left", 420, state, 1200)).toBe(1200 - 500 - CENTER_MIN_WIDTH);
  });

  it("measures the other side as a rail once that side is collapsed", () => {
    // The same 800px window gives the sidebar far more room with the
    // preview collapsed than with it open — a rail costs 44px, not 460.
    const collapsedRight = layout({}, { collapsed: true });
    expect(clampPanelWidth("left", 420, collapsedRight, 800)).toBe(800 - RAIL_WIDTH - CENTER_MIN_WIDTH);
    expect(clampPanelWidth("left", 420, layout(), 800)).toBe(PANEL_LIMITS.left.min);
  });

  it("keeps the panel at its own minimum when the window is too narrow for everyone", () => {
    // The chat pane takes the squeeze here: a sidebar below its minimum is
    // unreadable, a slightly narrow chat column is merely tight.
    expect(clampPanelWidth("left", 300, layout(), 600)).toBe(PANEL_LIMITS.left.min);
  });
});

describe("widthFromPointer", () => {
  it("reads the left panel from the pointer and the right one from the far edge", () => {
    expect(widthFromPointer("left", 320, WIDE)).toBe(320);
    expect(widthFromPointer("right", 1100, WIDE)).toBe(WIDE - 1100);
  });
});

describe("resizeFromPointer", () => {
  it("resizes to wherever the divider is dragged", () => {
    expect(resizeFromPointer(layout(), "left", 340, WIDE).left).toEqual({ width: 340, collapsed: false });
    expect(resizeFromPointer(layout(), "right", 1000, WIDE).right).toEqual({ width: 600, collapsed: false });
  });

  it("clamps rather than following the pointer past a limit", () => {
    expect(resizeFromPointer(layout(), "left", 5000, WIDE).left.width).toBe(PANEL_LIMITS.left.max);
  });

  it("holds at the minimum until the drag goes far enough past it to mean collapse", () => {
    const justInside = PANEL_LIMITS.left.min - COLLAPSE_SNAP_DISTANCE + 1;
    expect(resizeFromPointer(layout(), "left", justInside, WIDE).left).toEqual({
      width: PANEL_LIMITS.left.min,
      collapsed: false,
    });
  });

  it("collapses once the drag passes the snap distance, keeping the width for later", () => {
    const state = layout({ width: 380 });
    const collapsed = resizeFromPointer(state, "left", PANEL_LIMITS.left.min - COLLAPSE_SNAP_DISTANCE - 1, WIDE);
    expect(collapsed.left).toEqual({ width: 380, collapsed: true });
  });

  it("collapses the right panel by dragging toward its own edge", () => {
    const pointerX = WIDE - (PANEL_LIMITS.right.min - COLLAPSE_SNAP_DISTANCE - 1);
    expect(resizeFromPointer(layout(), "right", pointerX, WIDE).right.collapsed).toBe(true);
  });

  it("expands a collapsed panel when its divider is dragged back out", () => {
    const state = layout({ width: 380, collapsed: true });
    expect(resizeFromPointer(state, "left", 300, WIDE).left).toEqual({ width: 300, collapsed: false });
  });
});

describe("setCollapsed / togglePanel", () => {
  it("collapses and expands without losing the expanded width", () => {
    const state = layout({ width: 390 });
    const collapsed = togglePanel(state, "left");
    expect(collapsed.left).toEqual({ width: 390, collapsed: true });
    expect(togglePanel(collapsed, "left").left).toEqual({ width: 390, collapsed: false });
  });

  it("returns the same object when nothing changes", () => {
    const state = layout();
    expect(setCollapsed(state, "left", false)).toBe(state);
  });

  it("leaves the other side alone", () => {
    const state = layout();
    expect(togglePanel(state, "left").right).toBe(state.right);
  });
});

describe("nudgePanel", () => {
  it("widens the sidebar when its divider is pushed right", () => {
    expect(nudgePanel(layout({ width: 264 }), "left", 16, WIDE).left.width).toBe(280);
    expect(nudgePanel(layout({ width: 264 }), "left", -16, WIDE).left.width).toBe(248);
  });

  it("flips the sign for the right divider, so 'right' always looks like right on screen", () => {
    expect(nudgePanel(layout({}, { width: 460 }), "right", 16, WIDE).right.width).toBe(444);
    expect(nudgePanel(layout({}, { width: 460 }), "right", -16, WIDE).right.width).toBe(476);
  });

  it("does nothing to a collapsed panel", () => {
    const state = layout({ collapsed: true });
    expect(nudgePanel(state, "left", 16, WIDE)).toBe(state);
  });
});

describe("resetPanel", () => {
  it("restores the shipped width and expands a collapsed panel", () => {
    const state = layout({ width: 400, collapsed: true });
    expect(resetPanel(state, "left", WIDE).left).toEqual({ width: PANEL_LIMITS.left.default, collapsed: false });
  });
});

describe("reflow", () => {
  it("leaves a layout that already fits untouched", () => {
    const state = layout();
    expect(reflow(state, WIDE)).toEqual(state);
  });

  it("pulls both panels back in when the window shrinks under them", () => {
    const state = layout({ width: 420 }, { width: 760 });
    const next = reflow(state, 1100);
    expect(next.left.width + next.right.width + CENTER_MIN_WIDTH).toBeLessThanOrEqual(1100);
  });

  it("keeps collapsed panels collapsed", () => {
    const next = reflow(layout({ width: 420, collapsed: true }, { width: 760 }), 1100);
    expect(next.left.collapsed).toBe(true);
  });
});

describe("parsePanelLayout", () => {
  it("restores what a previous session stored", () => {
    const stored = serializePanelLayout(layout({ width: 300 }, { width: 520, collapsed: true }));
    expect(parsePanelLayout(stored)).toEqual(layout({ width: 300 }, { width: 520, collapsed: true }));
  });

  it("falls back to defaults for missing, empty, or unparseable storage", () => {
    expect(parsePanelLayout(null)).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout("")).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout("{not json")).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(parsePanelLayout('"a string"')).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it("falls back per field rather than discarding the whole layout", () => {
    const parsed = parsePanelLayout(JSON.stringify({ left: { width: 300, collapsed: false } }));
    expect(parsed.left.width).toBe(300);
    expect(parsed.right).toEqual(DEFAULT_PANEL_LAYOUT.right);
  });

  it("clamps stored widths that are out of range or not numbers", () => {
    const parsed = parsePanelLayout(JSON.stringify({ left: { width: 9999 }, right: { width: "wide" } }));
    expect(parsed.left.width).toBe(PANEL_LIMITS.left.max);
    expect(parsed.right.width).toBe(PANEL_LIMITS.right.default);
  });

  it("only accepts a literal true as collapsed", () => {
    const parsed = parsePanelLayout(JSON.stringify({ left: { width: 264, collapsed: "yes" } }));
    expect(parsed.left.collapsed).toBe(false);
  });
});
