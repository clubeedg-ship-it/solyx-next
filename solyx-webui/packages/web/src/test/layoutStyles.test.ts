import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

/** The declarations of a single rule, by exact selector. */
function ruleBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule found for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

// These assert stylesheet text rather than rendered geometry, because jsdom
// performs no layout — nothing in this suite can measure the actual bug. What
// they can do is pin the two declarations the full-height layout depends on.
//
// The bug they guard against, measured in a real browser at 923px viewport
// with only two messages on screen: the page overflowed by 283px and
// .thread-viewport was not scrollable at all, because .layout declared
// `height: 100vh` but left its single implicit row `auto` — so the row grew
// to fit the transcript instead of clipping it, and the window kept growing
// as the conversation did. Constraining the row fixed both (overflow 0,
// viewport scrollable).
describe("full-height chat layout", () => {
  it("constrains the .layout grid row so the page cannot grow past the viewport", () => {
    const layout = ruleBlock(".layout");
    expect(layout).toMatch(/height:\s*100vh/);
    // The 0 minimum is the load-bearing part: grid items default to
    // min-height: auto and will not shrink below their content without it.
    expect(layout).toMatch(/grid-template-rows:\s*minmax\(\s*0\s*,/);
  });

  it("keeps the transcript itself scrollable", () => {
    expect(ruleBlock(".thread-viewport")).toMatch(/overflow-y:\s*auto/);
  });
});
