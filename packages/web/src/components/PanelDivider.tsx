import { useEffect, useRef, useState } from "react";
import { PANEL_LIMITS, RAIL_WIDTH, type PanelSide } from "../runtime/panelLayout.js";

export interface PanelDividerProps {
  side: PanelSide;
  /** Announced to screen readers, e.g. "Resize sidebar". */
  label: string;
  /** The adjacent panel's current width, for aria-valuenow. */
  width: number;
  collapsed: boolean;
  onResize: (pointerX: number) => void;
  onNudge: (deltaPx: number) => void;
  onReset: () => void;
  onToggle: () => void;
}

/** How far one arrow-key press moves a divider. */
const KEYBOARD_STEP = 16;

/**
 * The draggable line between two panes. Implemented on Pointer Events with
 * `setPointerCapture` rather than document-level mousemove listeners: the
 * capture is what keeps a fast drag from "falling off" the 1px line, and it
 * keeps the pointer stream aimed at this element even as it travels over
 * the draft panel's iframe — a cross-document target that would otherwise
 * swallow the rest of the gesture. (styles.css also drops pointer events on
 * the iframe while dragging, as belt and braces for that same case.)
 *
 * Live on a collapsed rail too, so the panel can be dragged back out the
 * same way it was dragged shut. Keyboard: arrows resize, Enter collapses
 * or restores — the WAI-ARIA window-splitter pattern.
 */
export function PanelDivider({ side, label, width, collapsed, onResize, onNudge, onReset, onToggle }: PanelDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // A drag that ends with the tab hidden, or a divider unmounted mid-drag,
  // must not leave the whole document stuck in the resizing cursor.
  useEffect(() => {
    return () => document.body.classList.remove("is-resizing");
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Primary button only — a right-click here is a context menu, not a drag.
    if (event.button !== 0) return;
    // Stops the drag from selecting text across the panes it passes over.
    event.preventDefault();
    ref.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    document.body.classList.add("is-resizing");
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    onResize(event.clientX);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove("is-resizing");
    // Guarded: releasing a pointer this element never captured throws.
    if (ref.current?.hasPointerCapture(event.pointerId)) {
      ref.current.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudge(-KEYBOARD_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudge(KEYBOARD_STEP);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onToggle();
    }
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={collapsed ? RAIL_WIDTH : width}
      aria-valuemin={RAIL_WIDTH}
      aria-valuemax={PANEL_LIMITS[side].max}
      tabIndex={0}
      className="panel-divider"
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}
