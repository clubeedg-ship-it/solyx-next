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

/**
 * One persistent WebSocket connection to this project's own backend (never
 * to the OpenClaw Gateway directly — see README "Architecture"). Multiplexes
 * request/response pairs by id and fans out server-pushed frames
 * (assistant.delta, tool.event, sessions.changed, ...) to subscribers.
 *
 * This is the seam assistant-ui's ChatModelAdapter and RemoteThreadListAdapter
 * are built on top of (see chatModelAdapter.ts / threadListAdapter.ts).
 */
export class BackendSocket {
  private socket: MinimalSocket | undefined;
  private nextId = 0;
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly listeners = new Map<string, Set<(frame: ServerFrame) => void>>();

  constructor(private readonly createSocket: SocketFactory) {}

  connect(): Promise<void> {
    const socket = this.createSocket();
    this.socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => this.rejectAllPending(new Error("Backend connection closed")));
    socket.addEventListener("error", () => this.rejectAllPending(new Error("Backend connection error")));

    return new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve);
      socket.addEventListener("error", (event) => reject(event instanceof Error ? event : new Error("connect failed")));
    });
  }

  close(): void {
    this.socket?.close();
  }

  request<T>(frame: DistributiveOmit<ClientFrame, "id">): Promise<T> {
    if (!this.socket || this.socket.readyState !== OPEN) {
      return Promise.reject(new Error("Backend socket is not open"));
    }
    const id = String(this.nextId++);
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
    this.socket.send(JSON.stringify({ ...frame, id } as ClientFrame));
    return promise;
  }

  /** Subscribe to server-pushed frames of a given type. Returns an unsubscribe function. */
  on<T extends ServerFrame["type"]>(type: T, handler: (frame: Extract<ServerFrame, { type: T }>) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler as (frame: ServerFrame) => void);
    this.listeners.set(type, set);
    return () => set.delete(handler as (frame: ServerFrame) => void);
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
