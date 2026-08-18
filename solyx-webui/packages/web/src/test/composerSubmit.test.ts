import { describe, expect, it, vi } from "vitest";
import { createComposerSubmitHandler, submitComposerMessage } from "../runtime/composerSubmit.js";

// Regression tests for the actual composer bug: typing was never blocked
// (assistant-ui's LocalRuntime-backed composer has no gate that depends on
// backend/session state — confirmed by reading @assistant-ui/core's source
// and by reproducing the app locally against a stub Gateway with
// sessions.create made to fail), but a message could vanish with zero
// feedback the moment it was *sent* while the thread's lazy `initialize()`
// (sessions.create) was failing — see threadReadiness.ts and ChatPane.tsx.
// These tests prove the fix at the exact point that mattered: assistant-ui's
// own `composer.send()` — the only call that clears the composer's text —
// must never run while the thread isn't ready.
describe("submitComposerMessage", () => {
  it("never calls send for blank input, and never even attempts a readiness check", async () => {
    const ensureReady = vi.fn();
    const send = vi.fn();

    const outcome = await submitComposerMessage({ getText: () => "   ", ensureReady, send });

    expect(outcome).toEqual({ sent: false, reason: "empty" });
    expect(ensureReady).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("calls send exactly once when the thread is ready", async () => {
    const send = vi.fn();

    const outcome = await submitComposerMessage({
      getText: () => "Update the homepage headline",
      ensureReady: async () => ({ ok: true }),
      send,
    });

    expect(outcome).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never calls send when the thread isn't ready — the typed text is never touched, so it can't vanish", async () => {
    const send = vi.fn();
    const notReadyError = new Error("no model credentials configured for this agent");

    const outcome = await submitComposerMessage({
      getText: () => "Add a new FAQ entry",
      ensureReady: async () => ({ ok: false, error: notReadyError }),
      send,
    });

    expect(outcome).toEqual({ sent: false, reason: "not-ready", error: notReadyError });
    // The load-bearing assertion: assistant-ui's composer.send() is the only
    // thing that clears the composer's text. Never calling it here is what
    // guarantees the user's message is still sitting in the box afterwards.
    expect(send).not.toHaveBeenCalled();
  });
});

// Regression test for a second instance of the exact same bug class,
// discovered by reproducing this app locally against a stub Gateway with
// sessions.create made to reject (the real "no model credentials" failure):
// ComposerPrimitive.Send's onClick called assistant-ui's own raw, unguarded
// composer.send() directly — never going through submitComposerMessage at
// all — so clicking Send (as opposed to pressing Enter, which was already
// routed through the guarded form onSubmit) silently cleared the typed text
// with no banner and no error the moment the thread's lazy initialize
// failed. ChatPane.tsx now wires the *same* handler, built by
// createComposerSubmitHandler, to both entry points. These tests prove that
// wiring is actually safe against assistant-ui's real composition
// mechanism, not just that submitComposerMessage itself is correct in
// isolation.
describe("createComposerSubmitHandler", () => {
  // Mirrors @radix-ui/primitive's composeEventHandlers exactly as used by
  // the pinned @assistant-ui/react 0.15.14 at both of the call sites this
  // handler is wired to in ChatPane.tsx:
  //   - ComposerPrimitive.Root: `onSubmit={composeEventHandlers(onSubmit, handleSubmit)}`
  //     (node_modules/@assistant-ui/react/src/primitives/composer/ComposerRoot.tsx)
  //   - ComposerPrimitive.Send: `onClick: composeEventHandlers(primitiveProps.onClick, callback)`
  //     (node_modules/@assistant-ui/react/src/utils/createActionButton.tsx)
  // Both call the caller-supplied handler first, and only fall through to
  // assistant-ui's own built-in handler ("assistantUisRawHandler" below —
  // standing in for the unguarded `aui.composer.send()` that used to run
  // through ComposerPrimitive.Send) if the event wasn't already prevented.
  type FakeEvent = { defaultPrevented: boolean; preventDefault: () => void };

  function composeLikeAssistantUi(
    ours: (event: FakeEvent) => void,
    assistantUisRawHandler: (event: FakeEvent) => void,
  ): (event: FakeEvent) => void {
    return (event: FakeEvent) => {
      ours(event);
      if (!event.defaultPrevented) assistantUisRawHandler(event);
    };
  }

  function fakeEvent(): FakeEvent {
    const event = {
      defaultPrevented: false,
      preventDefault: () => {
        event.defaultPrevented = true;
      },
    };
    return event;
  }

  it("calls preventDefault synchronously, before the readiness check even starts", () => {
    const handler = createComposerSubmitHandler(
      { getText: () => "hello", ensureReady: () => new Promise(() => {}), send: vi.fn() },
      () => {},
    );

    const event = fakeEvent();
    handler(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("wired as ComposerPrimitive.Send's onClick, never lets assistant-ui's own raw composer.send() run when the thread isn't ready — the exact bug: the Send button had no readiness guard at all", async () => {
    const assistantUisRawSend = vi.fn(); // stands in for the real, unguarded aui.composer.send()
    const guardedSend = vi.fn();
    const outcomes: unknown[] = [];

    const handler = createComposerSubmitHandler(
      {
        getText: () => "Update the homepage headline",
        ensureReady: async () => ({ ok: false, error: new Error("no model credentials configured for this agent") }),
        send: guardedSend,
      },
      (outcome) => outcomes.push(outcome),
    );

    const onClick = composeLikeAssistantUi(handler, assistantUisRawSend);
    onClick(fakeEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Neither send ever ran: not assistant-ui's raw one (composition skipped
    // it because we called preventDefault), and not the guarded one either
    // (ensureReady failed). The typed text was therefore never touched by
    // anything that could clear it.
    expect(assistantUisRawSend).not.toHaveBeenCalled();
    expect(guardedSend).not.toHaveBeenCalled();
    expect(outcomes).toEqual([{ sent: false, reason: "not-ready", error: expect.any(Error) }]);
  });

  it("wired as ComposerPrimitive.Root's onSubmit, sends exactly once through the guarded path when the thread is ready — never assistant-ui's own raw handler", async () => {
    const assistantUisRawSubmit = vi.fn();
    const guardedSend = vi.fn();

    const handler = createComposerSubmitHandler(
      { getText: () => "Add a new FAQ entry", ensureReady: async () => ({ ok: true }), send: guardedSend },
      () => {},
    );

    const onSubmit = composeLikeAssistantUi(handler, assistantUisRawSubmit);
    onSubmit(fakeEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(assistantUisRawSubmit).not.toHaveBeenCalled();
    expect(guardedSend).toHaveBeenCalledTimes(1);
  });

  it("never calls onOutcome for blank input, matching submitComposerMessage's own empty-input short circuit", async () => {
    const ensureReady = vi.fn();
    const onOutcome = vi.fn();

    const handler = createComposerSubmitHandler({ getText: () => "   ", ensureReady, send: vi.fn() }, onOutcome);
    handler(fakeEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ensureReady).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith({ sent: false, reason: "empty" });
  });
});
