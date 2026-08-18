import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuiState } from "@assistant-ui/react";
import type { DraftSelectionStore } from "../runtime/draftSelection.js";

export interface DraftPanelProps {
  store: DraftSelectionStore;
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
export function DraftPanel({ store }: DraftPanelProps) {
  const state = useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.get(),
  );
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [isFrameLoading, setIsFrameLoading] = useState(false);

  // Ask the server which drafts exist the moment the panel mounts, so a
  // fresh page load shows the client's saved drafts instead of waiting for
  // the agent to touch one.
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
    if (!state.currentPostId) return;
    setIsFrameLoading(true);
    const fallback = setTimeout(() => setIsFrameLoading(false), 4000);
    return () => clearTimeout(fallback);
  }, [state.currentPostId]);

  return (
    <section className="draft-panel">
      <header className="draft-panel-header">
        <label htmlFor="draft-select" className="draft-panel-label">
          Draft
        </label>
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
        {isRunning && (
          <span className="draft-status-pill" role="status">
            <span className="status-dot" aria-hidden="true" />
            Sol is working
          </span>
        )}
      </header>
      <div className="draft-panel-body">
        <div className="draft-frame-card">
          <div className="draft-frame-viewport">
            {state.currentPostId ? (
              <>
                <iframe
                  key={state.currentPostId}
                  title="Draft preview"
                  src={`/api/draft/${state.currentPostId}`}
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
              <EmptyDraft />
            )}
          </div>
        </div>
      </div>
    </section>
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
