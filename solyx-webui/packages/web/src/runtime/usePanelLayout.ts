import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  nudgePanel,
  parsePanelLayout,
  reflow,
  resetPanel,
  resizeFromPointer,
  serializePanelLayout,
  togglePanel,
  type PanelLayoutState,
  type PanelSide,
} from "./panelLayout.js";

export interface PanelLayoutController {
  state: PanelLayoutState;
  /** One frame of a divider drag, in viewport coordinates. */
  resize(side: PanelSide, pointerX: number): void;
  /** Arrow keys on a focused divider. */
  nudge(side: PanelSide, deltaPx: number): void;
  /** Double-click a divider. */
  reset(side: PanelSide): void;
  toggle(side: PanelSide): void;
}

/**
 * The one place the panel layout meets the browser: `window.innerWidth`,
 * `localStorage`, and the resize event. Every decision it makes is a call
 * into panelLayout.ts, which is where the arithmetic is tested.
 *
 * The layout persists per browser: someone who works with the preview
 * collapsed shouldn't have to collapse it again every morning. Storage
 * failures are swallowed on purpose — Safari in private mode throws on
 * `setItem`, and a layout preference is not worth an unusable app.
 */
export function usePanelLayout(): PanelLayoutController {
  const [state, setState] = useState<PanelLayoutState>(() => {
    let stored: PanelLayoutState;
    try {
      stored = parsePanelLayout(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY));
    } catch {
      stored = DEFAULT_PANEL_LAYOUT;
    }
    // A layout stored on a wide monitor and restored on a laptop would
    // otherwise leave no room for the chat pane.
    return reflow(stored, window.innerWidth);
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, serializePanelLayout(state));
    } catch {
      // See the doc comment: a preference isn't worth throwing over.
    }
  }, [state]);

  useEffect(() => {
    const onResize = () => setState((prev) => reflow(prev, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // `window.innerWidth` is read inside each callback rather than captured,
  // so a drag that started before a window resize still measures against
  // the window as it is now.
  const resize = useCallback(
    (side: PanelSide, pointerX: number) =>
      setState((prev) => resizeFromPointer(prev, side, pointerX, window.innerWidth)),
    [],
  );
  const nudge = useCallback(
    (side: PanelSide, deltaPx: number) => setState((prev) => nudgePanel(prev, side, deltaPx, window.innerWidth)),
    [],
  );
  const reset = useCallback(
    (side: PanelSide) => setState((prev) => resetPanel(prev, side, window.innerWidth)),
    [],
  );
  const toggle = useCallback((side: PanelSide) => setState((prev) => togglePanel(prev, side)), []);

  return { state, resize, nudge, reset, toggle };
}
