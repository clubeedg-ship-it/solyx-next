export interface PanelToggleButtonProps {
  /** Which way the panel moves when this is pressed — the chevrons point
   *  that way, so the control reads as "send this edge over there". */
  direction: "left" | "right";
  label: string;
  className: string;
  onClick: () => void;
}

/**
 * The collapse/expand control, shared by both side panels in both states:
 * in a pane header it collapses, on a rail it expands. `title` as well as
 * `aria-label` — on a 44px rail the icon is the only thing left, so a
 * hover tooltip is what tells a mouse user what it does.
 */
export function PanelToggleButton({ direction, label, className, onClick }: PanelToggleButtonProps) {
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      <ChevronsIcon direction={direction} />
    </button>
  );
}

/** Double chevron — a single one reads as "next", two as "all the way". */
function ChevronsIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={direction === "right" ? undefined : { transform: "scaleX(-1)" }}
    >
      <path
        d="M3 3.5 6.5 7 3 10.5M8 3.5 11.5 7 8 10.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
