import type { ThreadReadinessResult } from "./threadReadiness.js";

export interface ComposerSubmitDeps {
  /** Reads the composer's current text. Never mutated here. */
  getText: () => string;
  ensureReady: () => Promise<ThreadReadinessResult>;
  /** assistant-ui's own `aui.composer.send()` — the only thing that clears
   *  the composer's text. Called if and only if the thread is ready. */
  send: () => void;
}

export type ComposerSubmitOutcome = { sent: true } | { sent: false; reason: "empty" | "not-ready"; error?: Error };

/**
 * The composer's entire submit contract, in one pure, dependency-injected
 * function: typing is never this function's business (it only ever reads
 * text, never clears or blocks it) — the guarantee it exists to make is
 * narrower and load-bearing: `send` — the one call that clears the
 * composer's text — is invoked if and only if the thread is actually ready.
 *
 * This is what closes the real bug (see threadReadiness.ts's doc comment
 * for the full mechanism): assistant-ui's own composer.send() clears the
 * text unconditionally and then silently discards both the message and any
 * non-`MessageNotSentError` failure from the thread's lazy initialize.
 * Gating the call to `send` here means that failure path is never entered
 * at all — on a not-ready thread, the typed text is simply still sitting in
 * the composer afterwards, untouched, exactly where the user left it.
 */
export async function submitComposerMessage(deps: ComposerSubmitDeps): Promise<ComposerSubmitOutcome> {
  const text = deps.getText();
  if (!text.trim()) return { sent: false, reason: "empty" };

  const result = await deps.ensureReady();
  if (!result.ok) return { sent: false, reason: "not-ready", error: result.error };

  deps.send();
  return { sent: true };
}

/**
 * The one event handler ChatPane wires to both of assistant-ui's own send
 * entry points: the composer form's `onSubmit` (Enter key,
 * `ComposerPrimitive.Root`) and the Send button's `onClick`
 * (`ComposerPrimitive.Send`). Both of those primitives compose a
 * caller-supplied handler for that same event *ahead of* their own built-in
 * one, via `@radix-ui/primitive`'s `composeEventHandlers` — see
 * `ComposerRoot.tsx`'s `onSubmit={composeEventHandlers(onSubmit, handleSubmit)}`
 * and `createActionButton.tsx`'s
 * `onClick: composeEventHandlers(primitiveProps.onClick, callback)`, both in
 * the pinned `@assistant-ui/react` 0.15.14. That composition calls the
 * caller-supplied handler first and skips its own only if the event already
 * arrived with `defaultPrevented` true — so calling `event.preventDefault()`
 * synchronously, before anything async, is what keeps assistant-ui's own
 * `composer.send()` (unconditional, unguarded — see threadReadiness.ts's
 * doc comment for what it silently discards on a failed lazy initialize)
 * from ever running.
 *
 * Using this one factory at *both* call sites is what makes that guarantee
 * structural rather than a convention someone has to remember to repeat: a
 * second wiring point can no longer quietly fall back to assistant-ui's own
 * unguarded handler the way `ComposerPrimitive.Send`'s onClick used to.
 */
export function createComposerSubmitHandler(
  deps: ComposerSubmitDeps,
  onOutcome: (outcome: ComposerSubmitOutcome) => void,
): (event: { preventDefault: () => void }) => void {
  return (event) => {
    event.preventDefault();
    void submitComposerMessage(deps).then(onOutcome);
  };
}
