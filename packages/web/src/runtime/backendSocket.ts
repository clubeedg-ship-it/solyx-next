import type { ClientFrame, ServerFrame } from "./protocol.js";

// Plain `Omit` over a union type collapses it to the properties common to
// every member, which would erase everything that makes ClientFrame a
// discriminated union. This distributes the Omit across each member first.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// A tiny subset of the browser WebSocket interface — enough for
// BackendSocket, small enough to fake in tests without jsdom or a real
// socket. The real browser WebSocket satisfies this structurally.
export interface MinimalSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void): void;
}

export type SocketFactory = () => MinimalSocket;

const OPEN = 1;

// Backoff between reconnection attempts; the final value repeats. Reconnecting
// never gives up on its own: this is a dashboard the client leaves open for
// hours, and Cloudflare, a laptop lid, or a backend restart will all close the
// socket eventually.
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10_000];

// How long a request waits for an in-flight reconnection before giving up, so
// a message typed during a blip lands instead of erroring immediately.
const REQUEST_WAIT_MS = 15_000;

/**
 * One persistent WebSocket connection to this project's own backend (never
 * to the OpenClaw Gateway directly — see README "Architecture"). Multiplexes
 * request/response pairs by id and fans out server-pushed frames
 * (assistant.delta, tool.event, sessions.changed, ...) to subscribers.
 *
 * This is the seam assistant-ui's ChatModelAdapter and RemoteThreadListAdapter
 * are built on top of (see chatModelAdapter.ts / threadListAdapter.ts).
 *
 * Reconnection lives here rather than in App.tsx so every consumer gets it.
 * Server-side subscriptions need no replaying: the backend re-subscribes per
 * browser connection (server ws/wsServer.ts handleConnection), so a fresh
 * socket arrives already subscribed.
 *
 * Two invariants keep reconnection from making things worse, and both were
 * learned the hard way — an earlier version violated each:
 *
 *  1. At most one connection attempt is ever in flight. `opening` is the
 *     shared handle for it, and it is re-armed on a drop *before* the retry is
 *     scheduled, so a request arriving mid-outage joins that attempt instead
 *     of opening a competing socket of its own.
 *  2. A socket that has been superseded can no longer affect anything. Every
 *     socket carries a generation; handlers from an older generation are
 *     ignored, so a late close from a dead socket cannot reject the live
 *     socket's in-flight requests or schedule a second reconnect loop.
 */
export class BackendSocket {
  private socket: MinimalSocket | undefined;
  private nextId = 0;
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly listeners = new Map<string, Set<(frame: ServerFrame) => void>>();

  // Distinguishes "the app is unmounting" from "the network dropped us" — the
  // difference between letting the socket stay shut and fighting to get it back.
  private closedByCaller = false;
  private opening: Promise<void> | undefined;
  private resolveOpening: (() => void) | undefined;
  private generation = 0;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly connectionListeners = new Set<(open: boolean) => void>();

  constructor(private readonly createSocket: SocketFactory) {}

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  /**
   * Opens the socket, retrying until it succeeds. Resolves on the first
   * successful connection and does not reject — a caller that awaited this
   * once (App.tsx) must not be stranded on a permanent "Connecting…" screen
   * because the very first attempt happened during a blip.
   */
  connect(): Promise<void> {
    this.closedByCaller = false;
    return this.open();
  }

  close(): void {
    this.closedByCaller = true;
    this.generation += 1; // orphan every existing socket's handlers
    this.clearReconnect();
    this.opening = undefined;
    this.resolveOpening = undefined;
    this.socket?.close();
    this.socket = undefined;
  }

  /** Subscribe to open/closed transitions. Returns an unsubscribe function. */
  onConnectionChange(handler: (open: boolean) => void): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  request<T>(frame: DistributiveOmit<ClientFrame, "id">): Promise<T> {
    // Dispatch synchronously when the socket is already up, so an ordinary
    // send is not deferred a microtask behind the reconnection path.
    if (this.socket && this.socket.readyState === OPEN) {
      return this.dispatch<T>(this.socket, frame);
    }
    if (this.closedByCaller) return Promise.reject(new Error("Backend socket is not open"));
    return this.awaitOpenSocket().then((socket) => this.dispatch<T>(socket, frame));
  }

  /** Subscribe to server-pushed frames of a given type. Returns an unsubscribe function. */
  on<T extends ServerFrame["type"]>(type: T, handler: (frame: Extract<ServerFrame, { type: T }>) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler as (frame: ServerFrame) => void);
    this.listeners.set(type, set);
    return () => set.delete(handler as (frame: ServerFrame) => void);
  }

  private dispatch<T>(socket: MinimalSocket, frame: DistributiveOmit<ClientFrame, "id">): Promise<T> {
    const id = String(this.nextId++);
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
    socket.send(JSON.stringify({ ...frame, id } as ClientFrame));
    return promise;
  }

  /**
   * Resolves with a socket that is actually open, joining whatever
   * reconnection is already in flight. Stays bounded: a backend that never
   * comes back must surface as an error, not a spinner that hangs forever.
   */
  private async awaitOpenSocket(): Promise<MinimalSocket> {
    if (this.socket && this.socket.readyState === OPEN) return this.socket;
    if (this.closedByCaller) throw new Error("Backend socket is not open");

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.open(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Backend socket is not open")), REQUEST_WAIT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (!this.socket || this.socket.readyState !== OPEN) {
      throw new Error("Backend socket is not open");
    }
    return this.socket;
  }

  /**
   * The single in-flight connection attempt. Never rejects: a failed attempt
   * schedules the next one and this promise stays pending until one succeeds.
   */
  private open(): Promise<void> {
    if (this.opening) return this.opening;
    const opening = this.armOpening();
    this.attempt = 0;
    this.attach();
    return opening;
  }

  private armOpening(): Promise<void> {
    if (!this.opening) {
      this.opening = new Promise<void>((resolve) => {
        this.resolveOpening = resolve;
      });
    }
    return this.opening;
  }

  private attach(): void {
    if (this.closedByCaller) return;
    const generation = ++this.generation;
    const socket = this.createSocket();
    this.socket = socket;

    socket.addEventListener("message", (event) => {
      if (generation !== this.generation) return;
      this.handleMessage(event.data);
    });
    socket.addEventListener("open", () => {
      if (generation !== this.generation) return;
      this.attempt = 0;
      this.opening = undefined;
      const resolve = this.resolveOpening;
      this.resolveOpening = undefined;
      this.notifyConnection(true);
      resolve?.();
    });
    socket.addEventListener("close", () => this.handleDrop(generation, new Error("Backend connection closed")));
    socket.addEventListener("error", () => this.handleDrop(generation, new Error("Backend connection error")));
  }

  /**
   * A socket died. Fail anything waiting on it — a half-finished turn cannot
   * be silently resumed on a new connection — then queue the next attempt.
   */
  private handleDrop(generation: number, error: Error): void {
    // Superseded socket: it may not reject the live socket's work, and it may
    // not start a second reconnect loop.
    if (generation !== this.generation) return;

    const wasOpen = this.socket?.readyState === OPEN;
    this.rejectAllPending(error);
    if (wasOpen) this.notifyConnection(false);
    if (this.closedByCaller || this.reconnectTimer !== undefined) return;

    // Re-arm *before* scheduling so a request arriving during the wait joins
    // this attempt rather than opening a competing socket.
    this.armOpening();

    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.attach();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private notifyConnection(open: boolean): void {
    for (const handler of this.connectionListeners) handler(open);
  }

  private handleMessage(data: string): void {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }

    if (frame.type === "result") {
      const waiter = this.pending.get(frame.id);
      if (!waiter) return;
      this.pending.delete(frame.id);
      if (frame.ok) waiter.resolve(frame.result);
      else waiter.reject(new Error(frame.error));
      return;
    }

    for (const handler of this.listeners.get(frame.type) ?? []) {
      handler(frame);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}
