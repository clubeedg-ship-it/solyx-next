// @vitest-environment jsdom
//
// EditableChatTitle is deliberately decoupled from assistant-ui (it takes
// `title` and `onRename` as plain props — see its own file for why), which
// is what makes it possible to render and interact with here without
// standing up a whole RemoteThreadListRuntime + BackendSocket. The decision
// logic it delegates to (empty-cancels, unchanged-is-a-no-op, trimming) is
// covered separately and more thoroughly in titleEdit.test.ts; this file is
// about the DOM contract: click-to-edit, Enter/Escape/blur, and that a
// failed rename surfaces its reason and reverts the visible title.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableChatTitle } from "../components/EditableChatTitle.js";

afterEach(cleanup);

describe("EditableChatTitle", () => {
  it("renders the title as a keyboard-focusable button, not editing", () => {
    render(<EditableChatTitle title="Besparingen" onRename={vi.fn()} onErrorChange={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Besparingen/ });
    expect(button.tagName).toBe("BUTTON");
  });

  it("switches to an editable input pre-filled with the current title on click", () => {
    render(<EditableChatTitle title="Besparingen" onRename={vi.fn()} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Besparingen");
  });

  it("saves the trimmed title on Enter and returns to the button view", async () => {
    const onRename = vi.fn(async () => {});
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Nieuwe titel  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith("Nieuwe titel"));
    await vi.waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("cancels on Escape without calling onRename and reverts the draft", () => {
    const onRename = vi.fn(async () => {});
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Een andere titel" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Besparingen/ })).toBeTruthy();
  });

  it("saves on blur, the same as Enter", async () => {
    const onRename = vi.fn(async () => {});
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Vernieuwde titel" } });
    fireEvent.blur(input);

    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith("Vernieuwde titel"));
  });

  it("does not double-save when Enter is immediately followed by the resulting blur", async () => {
    const onRename = vi.fn(async () => {});
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Eenmalige titel" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    await vi.waitFor(() => expect(onRename).toHaveBeenCalledTimes(1));
  });

  it("cancels rather than saving a blank title on Enter", () => {
    const onRename = vi.fn(async () => {});
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Besparingen/ })).toBeTruthy();
  });

  it("surfaces the failure reason and reverts the title when rename rejects", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("Gateway offline");
    });
    const onErrorChange = vi.fn();
    render(<EditableChatTitle title="Besparingen" onRename={onRename} onErrorChange={onErrorChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Nieuwe titel" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(onErrorChange).toHaveBeenCalledWith("Gateway offline"));
    // Reverts to the last known-good title rather than leaving the failed
    // draft on screen — assistant-ui's own runtime rolls the underlying
    // thread title back the same way (see ChatPane.tsx's comment on why).
    expect(screen.getByRole("button", { name: /Besparingen/ })).toBeTruthy();
  });

  it("clears a previous error as soon as editing starts again", () => {
    const onErrorChange = vi.fn();
    render(<EditableChatTitle title="Besparingen" onRename={vi.fn()} onErrorChange={onErrorChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Besparingen/ }));

    expect(onErrorChange).toHaveBeenCalledWith(undefined);
  });
});
