import { useEffect, useState, useSyncExternalStore } from "react";
import { PageBrowser, type ContentItem } from "./PageBrowser.js";
import { useAuiState } from "@assistant-ui/react";
import type { DraftSelectionStore } from "../runtime/draftSelection.js";
import { PanelToggleButton } from "./PanelToggleButton.js";

export interface DraftPanelProps {
  store: DraftSelectionStore;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Right column: the selected draft, live — rendered via the proxy (the
 * owner's decision: fetch the draft HTML server-side, authenticated as the
 * agent's WordPress account, and re-serve it same-origin so it embeds
 * without cross-origin problems; see server/src/proxy/draftProxy.ts).
 *
 * This is the hero of the app — the one place that shows real, working
 * output — so it reads as the page itself: a quiet, clearly-delineated
 * region (border + surface shift), not a simulated browser window. No fake
 * traffic-light dots or title bar — this app already runs inside a real
 * browser, and simulating one inside itself only makes the draft look like
 * a different tab instead of the thing it actually is.
 *
 * No publish control here or anywhere in this app — this panel only ever
 * shows what a draft looks like. Going live happens in WordPress, by a
 * human, elsewhere.
 */
export function DraftPanel({ store, collapsed, onToggleCollapsed }: DraftPanelProps) {
  const state = useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.get(),
  );
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  // A published page being looked at, chosen from the card grid. Separate from
  // the draft selection above: a draft and a live page are different things to
  // be looking at, and picking one must not silently change the other.
  const [viewing, setViewing] = useState<ContentItem | null>(null);

  // Ask the server which drafts exist the moment the panel mounts, so a fresh
  // page load shows the client's saved drafts instead of sitting empty until
  // the agent happens to touch one. Tool events only ever reveal drafts
  // touched while this page was open, which is not the same set.
  useEffect(() => {
    void store.loadFromServer();
  }, [store]);

  // The iframe below remounts (via `key`) whenever the selected draft
  // changes, so a fresh load genuinely starts here — this isn't a
  // simulated delay, it tracks the real network fetch through the proxy.
  // The iframe's own `load` event is the primary signal (below); the
  // timeout is only a backstop so a slow or stalled subresource on the
  // draft's own page (a theme font, a hung third-party embed) can never
  // leave this overlay showing forever — legible states must resolve.
  useEffect(() => {
    if (!state.currentPostId && !viewing) return;
    setIsFrameLoading(true);
    const fallback = setTimeout(() => setIsFrameLoading(false), 4000);
    return () => clearTimeout(fallback);
  }, [state.currentPostId, viewing]);

  // After every hook, never before — the rail is a different tree, not a
  // different early exit from this one.
  //
  // Collapsing unmounts the iframe, so expanding re-fetches the draft
  // through the proxy. That is the intended trade: a preview that was
  // hidden for a while should come back current rather than showing
  // whatever the page looked like before the agent last touched it, and
  // the load state below already covers the fetch.
  if (collapsed) {
    return <DraftRail onExpand={onToggleCollapsed} isRunning={isRunning} />;
  }

  return (
    <section className="draft-panel">
      <header className="draft-panel-header">
        {viewing ? (
          <button type="button" className="browse-back browse-back-header" onClick={() => setViewing(null)}>
            <span aria-hidden="true">&#8249;</span> Terug
          </button>
        ) : null}
        <label htmlFor="draft-select" className="draft-panel-label">
          {viewing ? viewing.title : "Draft"}
        </label>
        {viewing ? null : (
        <div className="draft-select-wrap">
          <select
            id="draft-select"
            className="draft-select"
            value={state.currentPostId ?? ""}
            disabled={state.drafts.length === 0}
            onChange={(event) => store.select(event.target.value)}
          >
            {state.drafts.length === 0 && <option value="">No drafts yet</option>}
            {state.drafts.map((draft) => (
              <option key={draft.postId} value={draft.postId}>
                {draft.label}
              </option>
            ))}
          </select>
          <ChevronIcon className="draft-select-chevron" />
        </div>
        )}
        {isRunning && (
          <span className="draft-status-pill" role="status">
            <span className="status-dot" aria-hidden="true" />
            Sol is working
          </span>
        )}
        <PanelToggleButton
          direction="right"
          label="Collapse draft preview"
          className="panel-collapse-button"
          onClick={onToggleCollapsed}
        />
      </header>
      <div className="draft-panel-body">
        <div className="draft-frame-card">
          <div className="draft-frame-viewport">
            {viewing || state.currentPostId ? (
              <>
                <iframe
                  key={viewing ? `${viewing.type}-${viewing.id}` : state.currentPostId}
                  title={viewing ? `Preview van ${viewing.title}` : "Draft preview"}
                  src={viewing ? `/api/page/${viewing.type}/${viewing.id}` : `/api/draft/${state.currentPostId}`}
                  className="draft-frame"
                  onLoad={() => setIsFrameLoading(false)}
                />
                {isFrameLoading && (
                  <div className="draft-frame-loading" role="status" aria-label="Loading draft">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                )}
              </>
            ) : (
              // Nothing chosen yet: the card navigation is the resting state of
              // this panel, not an empty message. EmptyDraft is gone -- there is
              // always something to look at now, because the whole published
              // site is reachable from here.
              <PageBrowser onSelect={setViewing} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The collapsed draft panel. Keeps the "Sol is working" dot: the whole
 * reason to collapse this panel is to stop watching it, so the one thing
 * worth 44px is the signal that there is something new to come back to.
 */
function DraftRail({ onExpand, isRunning }: { onExpand: () => void; isRunning: boolean }) {
  return (
    <aside className="draft-rail">
      <PanelToggleButton direction="left" label="Expand draft preview" className="rail-button" onClick={onExpand} />
      <span className="rail-label" aria-hidden="true">
        Draft
      </span>
      {isRunning && <span className="status-dot rail-status-dot" role="status" aria-label="Sol is working" />}
    </aside>
  );
}

function EmptyDraft() {
  return (
    <div className="draft-empty">
      <div className="draft-skeleton" aria-hidden="true">
        <span className="draft-skeleton-bar" />
        <span className="draft-skeleton-hero" />
        <span className="draft-skeleton-line" />
        <span className="draft-skeleton-line short" />
        <span className="draft-skeleton-button" />
      </div>
      <p className="draft-empty-text">
        Nothing to preview yet. Once Sol starts on a page, the draft will appear here as it takes shape.
      </p>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
