// @vitest-environment jsdom
//
// The only rendering test in this package. Every other test here targets pure
// logic and runs in node (see vitest.config.ts) — that default is deliberate
// and stays, so this file opts itself into jsdom rather than switching the
// suite over.
//
// It exists because the bug it guards was invisible to a logic-only suite:
// assistant-ui's default text renderer is a plain <p>, so Sol's markdown
// reached the screen as literal characters for as long as the app has been
// running. Nothing about that is observable without a DOM.

import { TextMessagePartProvider } from "@assistant-ui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownText } from "../components/MarkdownText.js";

afterEach(cleanup);

/**
 * Renders a single assistant text part exactly the way ChatPane does, minus
 * the thread runtime. TextMessagePartProvider is assistant-ui's own seam for
 * supplying one text part outside a message — `isRunning: false` marks the
 * part complete, so the smooth-reveal animation resolves immediately and the
 * assertions below see the finished output rather than a partial frame.
 */
function renderMarkdown(text: string) {
  return render(
    <TextMessagePartProvider text={text} isRunning={false}>
      <MarkdownText />
    </TextMessagePartProvider>,
  );
}

describe("MarkdownText", () => {
  it("renders a heading as a real heading element", () => {
    renderMarkdown("## Besparing per jaar");

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Besparing per jaar");
  });

  it("renders emphasis as elements rather than literal asterisks", () => {
    const { container } = renderMarkdown("Dit is **belangrijk**.");

    expect(container.querySelector("strong")?.textContent).toBe("belangrijk");
    expect(container.textContent).not.toContain("**");
  });

  it("renders a bullet list as list items", () => {
    const { container } = renderMarkdown("- Nymo\n- Nymo met boiler");

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe("Nymo");
  });

  it("keeps a wide table scrollable inside the column instead of widening it", () => {
    // The chat pane is the middle of three columns. An unwrapped table sets
    // its own intrinsic width, so a few columns of model output would push a
    // horizontal scrollbar onto the whole app.
    const { container } = renderMarkdown("| Product | Prijs |\n| --- | --- |\n| Nymo | 1.995 |");

    const table = container.querySelector("table");
    expect(table?.parentElement?.className).toContain("message-md-table-wrap");
  });

  it("renders a GFM table, which base markdown would leave as pipes", () => {
    // Proves remark-gfm is actually wired in — without it this stays one
    // paragraph of pipe characters.
    const { container } = renderMarkdown("| Product | Prijs |\n| --- | --- |\n| Nymo | 1.995 |");

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("renders a fenced code block", () => {
    const { container } = renderMarkdown("```\n[solyx_shortcode]\n```");

    const code = container.querySelector("pre code");
    expect(code?.textContent).toContain("[solyx_shortcode]");
  });

  it("opens links in a new tab without handing the opener over", () => {
    // This app is a single page holding a conversation and a live draft
    // panel; an in-place navigation would discard both.
    renderMarkdown("[Bekijk de pagina](https://example.com/pagina)");

    const link = screen.getByRole("link", { name: "Bekijk de pagina" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("exposes streaming state on the container for the cursor to attach to", () => {
    // styles.css hangs the blinking cursor off [data-status="running"] with an
    // ::after on the last block, because an inline sibling after block-level
    // markdown lands on a line of its own. If this attribute ever stops being
    // emitted the cursor disappears silently, so it is pinned here.
    const streaming = render(
      <TextMessagePartProvider text="Ik pas de kop aan" isRunning={true}>
        <MarkdownText />
      </TextMessagePartProvider>,
    );
    expect(streaming.container.querySelector(".message-md")?.getAttribute("data-status")).toBe("running");
    cleanup();

    const { container } = renderMarkdown("Klaar.");
    expect(container.querySelector(".message-md")?.getAttribute("data-status")).toBe("complete");
  });

  describe("raw HTML in model output", () => {
    // Sol's replies are model output from an agent holding WordPress
    // credentials, rendered same-origin with an authenticated WordPress draft
    // proxy. Raw HTML must stay inert text. If these ever fail, rehype-raw (or
    // something like it) has been added and the proxy is reachable from
    // injected markup.

    it("does not execute a script tag", () => {
      const { container } = renderMarkdown("<script>window.__pwned = true;</script>");

      expect(container.querySelector("script")).toBeNull();
      expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    });

    it("does not create an element carrying an inline event handler", () => {
      const { container } = renderMarkdown('<img src="x" onerror="window.__pwned = true;" />');

      expect(container.querySelector("img")).toBeNull();
      expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    });
  });
});

describe("code block copy control", () => {
  // Sol drafts WordPress content, so a fenced block is usually a shortcode or
  // a snippet the owner has to get out of the conversation and into WordPress.
  // Selecting it by hand out of a scrolling transcript is the failure this
  // avoids.

  it("labels the block with its language", () => {
    renderMarkdown("```html\n<p>Hallo</p>\n```");

    expect(screen.getByText("html")).toBeDefined();
  });

  it("copies the block's source when the control is pressed", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
    });

    renderMarkdown("```\n[solyx_shortcode id=1]\n```");
    const button = screen.getByRole("button", { name: "Copy code" });
    button.click();

    expect(written).toEqual(["[solyx_shortcode id=1]\n"]);
    await screen.findByRole("button", { name: "Code copied" });
  });
});
