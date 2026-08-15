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

describe("createChatModelAdapter", () => {
  it("sends chat.send with the latest user message text and the bound session key", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, "s1");
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

    await Promise.resolve();
    expect(fake.sent[0]).toMatchObject({ type: "chat.send", sessionKey: "s1", text: "Verander de titel" });

    fake.fire({ type: "assistant.done", sessionKey: "s1" });
    await expect(runPromise).resolves.toEqual([]);
  });

  it("yields each cumulative assistant.delta as a text content update", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, "s1");
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

    // Each `.next()` call resumes the generator synchronously up to its next
    // suspend point (registering the assistant.delta listener before the
    // first call even settles) — so the matching fire() must happen right
    // after starting `.next()`, not after awaiting it, or there is nothing
    // listening yet and the fired event is lost.
    const p1 = iterator.next();
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "Bezig" });
    results.push((await p1).value);

    const p2 = iterator.next();
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "Bezig..." });
    results.push((await p2).value);

    const p3 = iterator.next();
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
    const adapter = createChatModelAdapter(fake.socket, "s1");
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
    fake.fire({ type: "assistant.delta", sessionKey: "s2", text: "niet voor mij" });
    fake.fire({ type: "assistant.delta", sessionKey: "s1", text: "wel voor mij" });
    const first = await p1;

    expect(first.value).toEqual({ content: [{ type: "text", text: "wel voor mij" }] });

    const p2 = iterator.next();
    fake.fire({ type: "assistant.done", sessionKey: "s1" });
    await p2;
  });

  it("propagates assistant.error as a thrown error", async () => {
    const fake = createFakeSocket();
    const adapter = createChatModelAdapter(fake.socket, "s1");
    const controller = new AbortController();

    const iterable = adapter.run({
      messages: [userMessage("hoi")],
      abortSignal: controller.signal,
      runConfig: {},
      context: { getModelContext: () => ({}) } as never,
      unstable_getMessage: () => userMessage("hoi"),
    } as never) as AsyncGenerator<unknown>;

    // collect() must be started first so its `for await` registers the
    // assistant.error listener before the event fires.
    const resultPromise = collect(iterable);
    fake.fire({ type: "assistant.error", sessionKey: "s1", error: "gateway offline" });

    await expect(resultPromise).rejects.toThrow("gateway offline");
  });
});
