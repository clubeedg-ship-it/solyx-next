import { describe, expect, it } from "vitest";
import { createChatModelAdapter } from "../runtime/chatModelAdapter.js";
import type { BackendSocket } from "../runtime/backendSocket.js";
import type { ClientFrame, ServerFrame } from "../runtime/protocol.js";
import type { ThreadMessage } from "@assistant-ui/react";

type Handler = (frame: never) => void;

function createFakeSocket() {
  const sent: ClientFrame[] = [];
  const handlers = new Map<string, Set<Handler>>();

  const socket: Pick<BackendSocket, "on" | "request"> = {
    on: (type, handler) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler as Handler);
      handlers.set(type, set);
      return () => set.delete(handler as Handler);
    },
    request: async (frame) => {
      sent.push({ ...frame, id: "test-id" } as ClientFrame);
      return undefined as never;
    },
  };

  return {
    socket,
    sent,
    fire: (frame: ServerFrame) => {
      for (const handler of handlers.get(frame.type) ?? []) (handler as (f: ServerFrame) => void)(frame);
    },
  };
}

function userMessage(text: string): ThreadMessage {
  return {
    id: "m1",
    role: "user",
    content: [{ type: "text", text }],
    createdAt: new Date(),
    attachments: [],
    metadata: { custom: {} },
  } as unknown as ThreadMessage;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

/**
 * Let `run()` get as far as subscribing before a test fires a frame at it.
 *
 * `await Promise.resolve()` used to be enough, but run() now awaits the
 * session key first, so a single microtask no longer reaches the listeners.
 * Production is unaffected: run() subscribes before it issues chat.send, and
 * chat.send is what causes any frame to exist, so nothing can arrive earlier.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createChatModelAdapter", () => {
  it("sends chat.send with the latest user message text and the bound session key", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, async () => "s1");
    const controller = new AbortController();

    const runPromise = collect(
      adapter.run({
        messages: [userMessage("Verander de titel")],
        abortSignal: controller.signal,
        runConfig: {},
        context: { getModelContext: () => ({}) } as never,
        unstable_getMessage: () => userMessage("Verander de titel"),
      } as never) as AsyncGenerator<{ content: readonly { type: string; text: string }[] }>,
    );

    await flush();
    expect(fake.sent[0]).toMatchObject({ type: "chat.send", sessionKey: "s1", text: "Verander de titel" });

    fake.fire({ type: "assistant.done", sessionKey: "s1" });
    await expect(runPromise).resolves.toEqual([]);
  });

  it("yields each cumulative assistant.delta as a text content update", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, async () => "s1");
    const controller = new AbortController();

    const results: { content: readonly { type: string; text: string }[] }[] = [];
    const iterator = (
      adapter.run({
        messages: [userMessage("hoi")],
        abortSignal: controller.signal,
        runConfig: {},
        context: { getModelContext: () => ({}) } as never,
        unstable_getMessage: () => userMessage("hoi"),
      } as never) as AsyncGenerator<{ content: readonly { type: string; text: string }[] }>
    )[Symbol.asyncIterator]();

    // Start `.next()`, then let it settle, then fire. The listeners are
    // registered synchronously when the generator body starts, but a frame
    // only counts once the session key has resolved — and resolving it is
    // asynchronous, because the thread is persisted lazily by this very send.
    // Production never hits that window: the frames exist only in response to
    // chat.send, which is issued after the key resolves.
    const p1 = iterator.next();
    await flush();
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "Bezig" });
    results.push((await p1).value);

    const p2 = iterator.next();
    await flush();
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "Bezig..." });
    results.push((await p2).value);

    const p3 = iterator.next();
    await flush();
    fake.fire({ type: "assistant.done", sessionKey: "s1" });
    const final = await p3;

    expect(results).toEqual([
      { content: [{ type: "text", text: "Bezig" }] },
      { content: [{ type: "text", text: "Bezig..." }] },
    ]);
    expect(final.done).toBe(true);
  });

  it("ignores frames for other sessions", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, async () => "s1");
    const controller = new AbortController();

    const iterator = (
      adapter.run({
        messages: [userMessage("hoi")],
        abortSignal: controller.signal,
        runConfig: {},
        context: { getModelContext: () => ({}) } as never,
        unstable_getMessage: () => userMessage("hoi"),
      } as never) as AsyncGenerator<{ content: readonly { type: string; text: string }[] }>
    )[Symbol.asyncIterator]();

    const p1 = iterator.next();
    await flush();
    fake.fire({ type: "assistant.delta", sessionKey: "s2", text: "niet voor mij" });
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "wel voor mij" });
    const first = await p1;

    expect(first.value).toEqual({ content: [{ type: "text", text: "wel voor mij" }] });

    const p2 = iterator.next();
    await flush();
    fake.fire({ type: "assistant.done", sessionKey: "s1" });
    await p2;
  });

  it("propagates assistant.error as a thrown error", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, async () => "s1");
    const controller = new AbortController();

    const iterable = adapter.run({
      messages: [userMessage("hoi")],
      abortSignal: controller.signal,
      runConfig: {},
      context: { getModelContext: () => ({}) } as never,
      unstable_getMessage: () => userMessage("hoi"),
    } as never) as AsyncGenerator<unknown>;

    // collect() must be started first so its `for await` drives the generator
    // far enough to register the assistant.error listener, and then settle, so
    // the session key has resolved by the time the event fires. A frame that
    // arrives before the key is known belongs to no turn yet and is ignored —
    // which cannot happen in production, where the frames exist only in
    // response to the chat.send issued after the key resolves.
    const resultPromise = collect(iterable);
    await flush();
    fake.fire({ type: "assistant.error", sessionKey: "s1", error: "gateway offline" });

    await expect(resultPromise).rejects.toThrow("gateway offline");
  });
});

describe("session key resolution", () => {
  it("reads the session key when the turn runs, not when the adapter is built", async () => {
    const fake = createFakeSocket();

    // A thread is local until it is persisted, and sessions are created lazily
    // on first send — so at construction time all that exists is assistant-ui's
    // own __LOCALID_ placeholder. The real key appears only once initialize()
    // has run, which the submit path awaits before it sends.
    let key = "__LOCALID_abc";
    const adapter = createChatModelAdapter(fake.socket, async () => key);
    key = "agent:solyx:dashboard:real";

    const controller = new AbortController();
    const runPromise = collect(
      adapter.run({
        messages: [userMessage("hoi")],
        abortSignal: controller.signal,
        runConfig: {},
        context: { getModelContext: () => ({}) } as never,
        unstable_getMessage: () => userMessage("hoi"),
      } as never) as AsyncGenerator<{ content: readonly { type: string; text: string }[] }>,
    );

    await flush();
    // The Gateway parses this as agent:<id>:<session>. A __LOCALID_ key does
    // not parse, falls back to agent "main", and every send is rejected with
    // `invalid agent params` — exactly what shipped once the eager session
    // creation that had been masking it was removed.
    expect(fake.sent[0]).toMatchObject({
      type: "chat.send",
      sessionKey: "agent:solyx:dashboard:real",
      text: "hoi",
    });

    fake.fire({ type: "assistant.done", sessionKey: "agent:solyx:dashboard:real" });
    await expect(runPromise).resolves.toEqual([]);
  });

  it("never sends when the key cannot be resolved", async () => {
    const fake = createFakeSocket();
    // What the resolver does when a thread is never persisted: it gives up
    // rather than handing the Gateway a `__LOCALID_` key it will reject with
    // `invalid agent params`. A visible failure beats a cryptic one.
    const adapter = createChatModelAdapter(fake.socket, async () => {
      throw new Error("Sol kon dit gesprek niet openen.");
    });

    const controller = new AbortController();
    const run = collect(
      adapter.run({
        messages: [userMessage("hoi")],
        abortSignal: controller.signal,
        runConfig: {},
        context: { getModelContext: () => ({}) } as never,
        unstable_getMessage: () => userMessage("hoi"),
      } as never) as AsyncGenerator<{ content: readonly { type: string; text: string }[] }>,
    );

    await expect(run).rejects.toThrow(/niet openen/);
    expect(fake.sent).toEqual([]);
  });
});
