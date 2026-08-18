import { describe, expect, it, vi } from "vitest";
import { commitTitleEdit } from "../runtime/titleEdit.js";

describe("commitTitleEdit", () => {
  it("cancels without renaming when the draft is empty", async () => {
    const rename = vi.fn(async () => {});
    const outcome = await commitTitleEdit({ currentTitle: "Besparingen", draft: "", rename });

    expect(outcome).toEqual({ action: "cancelled" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("cancels without renaming when the draft is whitespace-only", async () => {
    const rename = vi.fn(async () => {});
    const outcome = await commitTitleEdit({ currentTitle: "Besparingen", draft: "   \n  ", rename });

    expect(outcome).toEqual({ action: "cancelled" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("treats a trimmed draft equal to the current title as unchanged", async () => {
    const rename = vi.fn(async () => {});
    const outcome = await commitTitleEdit({ currentTitle: "Besparingen", draft: "  Besparingen  ", rename });

    expect(outcome).toEqual({ action: "unchanged" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("renames with the trimmed draft when it differs from the current title", async () => {
    const rename = vi.fn(async () => {});
    const outcome = await commitTitleEdit({ currentTitle: "Besparingen", draft: "  Nieuwe titel  ", rename });

    expect(outcome).toEqual({ action: "renamed", title: "Nieuwe titel" });
    expect(rename).toHaveBeenCalledWith("Nieuwe titel");
  });

  it("propagates a rename failure to the caller instead of swallowing it", async () => {
    const rename = vi.fn(async () => {
      throw new Error("Gateway offline");
    });

    await expect(commitTitleEdit({ currentTitle: "Besparingen", draft: "Nieuwe titel", rename })).rejects.toThrow(
      "Gateway offline",
    );
  });
});
