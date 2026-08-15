/**
 * Guards against a real gap in assistant-ui's own RemoteThreadListRuntime
 * (@assistant-ui/react 0.15.14): when a thread's lazy `initialize()` call
 * (RemoteThreadListAdapter.initialize → sessions.create, see
 * threadListAdapter.ts) rejects, the composer's `send()` swallows the
 * rejection completely — see BaseComposerRuntimeCore.send() in
 * @assistant-ui/core, which only restores the drafted text for its own
 * internal `MessageNotSentError`, and otherwise just discards both the
 * typed message and the error with no re-throw, no event, nothing. The
 * message the user typed vanishes with zero feedback. That's the actual
 * mechanism behind "the composer looks inert" when the Gateway can't start
 * a session (e.g. no model credentials configured) — confirmed by reading
 * @assistant-ui/core's source and reproducing it locally against the stub
 * gateway with sessions.create made to fail (typing itself was never
 * blocked; assistant-ui's own isDisabled/isEditing are always
 * false/true respectively for a LocalRuntime-backed thread — the message
 * silently disappearing on send was the real, reproducible bug).
 *
 * Two things this class deliberately does NOT do, both learned from testing
 * against the real deployed failure (not just the local stub):
 *
 * 1. It never starts an attempt on its own. `sessions.create` is a real,
 *    persisted write — calling it eagerly on every page load/thread-switch
 *    spammed the sidebar with an empty "New chat" per load. The caller
 *    (ChatPane.tsx) only calls `ensureReady()` from the actual submit path,
 *    so a thread is created lazily, on first real send — same as before
 *    this file existed — and the composer/message-list machinery already
 *    tolerates a purely local, never-persisted "new" thread just fine.
 *
 * 2. It never lets a caller wait in silence for as long as the real
 *    Gateway might take to answer. @openclaw/gateway-client's own
 *    request timeout defaults to 30s (DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS) —
 *    against the real "no model credentials" failure, `sessions.create`
 *    doesn't reject quickly the way the local stub's thrown Error does; it
 *    sits pending for most of that 30s. A UI that only reacts once the
 *    promise *settles* stays blank that whole time, which is the same
 *    silent failure as the original bug wearing a different hat. So
 *    `ensureReady()` gives the real attempt `reportTimeoutMs` (well under
 *    30s) before reporting failure on its own — status flips to
 *    "unavailable" either way, and the real attempt keeps running
 *    underneath; if it *does* eventually succeed, status flips to "ready"
 *    on its own and the caller's next attempt goes straight through.
 */
export type ThreadReadinessStatus = "idle" | "checking" | "ready" | "unavailable";

export interface ThreadReadinessResult {
  ok: boolean;
  error?: Error;
}

const DEFAULT_REPORT_TIMEOUT_MS = 6000;

export class ThreadReadiness {
  private status: ThreadReadinessStatus = "idle";
  private inFlight: Promise<void> | undefined;
  private readonly listeners = new Set<(status: ThreadReadinessStatus) => void>();

  constructor(
    private readonly initialize: () => Promise<unknown>,
    private readonly reportTimeoutMs: number = DEFAULT_REPORT_TIMEOUT_MS,
  ) {}

  getStatus(): ThreadReadinessStatus {
    return this.status;
  }

  subscribe(listener: (status: ThreadReadinessStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: ThreadReadinessStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  /**
   * Starts (or reuses) the one real underlying attempt for this thread.
   * Never called on its own by this class — only `ensureReady()` (i.e. an
   * actual send) triggers it, so nothing is created just because a thread
   * became active. Never rejects: outcome is reported via status, not via
   * this promise's settlement, so a late resolution after ensureReady()'s
   * own timeout still updates status correctly.
   */
  private start(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.status === "ready") return Promise.resolve();

    this.setStatus("checking");
    const attempt = this.initialize()
      .then(() => {
        this.setStatus("ready");
      })
      .catch(() => {
        this.setStatus("unavailable");
      })
      .finally(() => {
        if (this.inFlight === attempt) this.inFlight = undefined;
      });

    this.inFlight = attempt;
    return attempt;
  }

  /**
   * Waits for the thread to become ready, bounded by `reportTimeoutMs` —
   * never the real Gateway client's own ~30s request timeout. Always
   * resolves (never rejects) with a definite ok/not-ok answer so a caller
   * can show a real, immediate error instead of waiting in silence.
   */
  async ensureReady(): Promise<ThreadReadinessResult> {
    if (this.status === "ready") return { ok: true };

    const attempt = this.start();
    await Promise.race([attempt, wait(this.reportTimeoutMs)]);

    if (this.getStatus() === "ready") return { ok: true };
    if (this.getStatus() === "checking") {
      // The real attempt is still pending past our own patience budget —
      // report it as unavailable now rather than leave the caller waiting;
      // `start()`'s own .then/.catch will still flip status for real once
      // it eventually settles, in the background.
      this.setStatus("unavailable");
    }
    return { ok: false, error: new Error("Sol can't be reached right now.") };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
