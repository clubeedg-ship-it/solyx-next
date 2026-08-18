import { describe, expect, it } from "vitest";
import { deriveTitle } from "../src/ws/deriveTitle.js";

describe("deriveTitle", () => {
  it("trims leading/trailing whitespace", () => {
    expect(deriveTitle("   Update the homepage headline   ")).toBe("Update the homepage headline");
  });

  it("collapses newlines and repeated whitespace into single spaces", () => {
    expect(deriveTitle("Update the\nhomepage   headline\n\nplease")).toBe("Update the homepage headline please");
  });

  it("falls back to New chat for empty input", () => {
    expect(deriveTitle("")).toBe("New chat");
  });

  it("falls back to New chat for whitespace-only input", () => {
    expect(deriveTitle("   \n\t  ")).toBe("New chat");
  });

  it("returns short text unchanged, with no ellipsis", () => {
    expect(deriveTitle("Change the accent color")).toBe("Change the accent color");
  });

  it("cuts long text at a word boundary near 40 chars and adds an ellipsis", () => {
    const text = "Update the homepage headline to mention our new solar panel installation service";
    const result = deriveTitle(text);
    expect(result.length).toBeLessThanOrEqual(41); // 40 chars + ellipsis char
    expect(result.endsWith("…")).toBe(true);
    // The cut must land on a word boundary — no trailing partial word before the ellipsis.
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
  });

  it("hard-cuts a single word longer than 40 chars and adds an ellipsis", () => {
    const longWord = "a".repeat(60);
    const result = deriveTitle(longWord);
    expect(result).toBe(`${"a".repeat(40)}…`);
  });

  it("does not add an ellipsis when the text is exactly the cutoff length", () => {
    const text = "a".repeat(40);
    expect(deriveTitle(text)).toBe(text);
  });
});
