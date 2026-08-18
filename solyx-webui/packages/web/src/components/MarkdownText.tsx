import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
} from "@assistant-ui/react-markdown";
import { memo, useEffect, useState } from "react";
import remarkGfm from "remark-gfm";

/**
 * Renders one assistant text part as rich text.
 *
 * Sol replies in markdown, and until this component existed nothing parsed
 * it: ChatPane rendered `<MessagePrimitive.Content />` with no `components`
 * override, so assistant-ui fell back to its own default Text part — a bare
 * `<p style="white-space:pre-line">` around the raw string. Headings, bold,
 * lists, links and tables all reached the screen as their source characters.
 * Line breaks survived, which is exactly why it read as a styling bug rather
 * than a missing parser.
 *
 * Only assistant messages get this (see ChatPane's MessageBubble). What the
 * owner types stays literal — someone writing `*een ster*` means the
 * asterisks, and reformatting her own words back at her would be wrong.
 *
 * SECURITY — raw HTML must stay inert text. react-markdown escapes HTML
 * unless `rehype-raw` is added; it must not be added here. These messages are
 * model output from an agent holding WordPress credentials, and this app
 * serves an authenticated WordPress draft proxy on the same origin, so an
 * injected `<img onerror>` would execute somewhere it can reach that proxy.
 * test/markdownText.test.tsx locks that behaviour down.
 */
const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="message-md"
      components={components}
      // Each streamed frame carries the whole message again (see
      // chatModelAdapter.ts), so the parse cost grows with the reply. Deferring
      // it keeps typing and scrolling responsive on a long answer; skipped
      // intermediate frames are invisible, and the final text always renders.
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

/**
 * Header strip above a fenced block: what language it is, and a way to get it
 * out. Sol drafts WordPress content, so a fenced block here is usually a
 * shortcode or a snippet destined for the WordPress editor — selecting it by
 * hand out of a scrolling transcript is the thing worth removing.
 */
const CodeHeader = ({ language, code }: CodeHeaderProps) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    // Only confirm once the write actually resolved — a "Copied" that lies is
    // worse than no button, because she'd paste stale content and not know.
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="message-md-code-header">
      <span className="message-md-code-lang">{language ?? ""}</span>
      <button
        type="button"
        className="message-md-code-copy"
        onClick={copy}
        aria-label={copied ? "Code copied" : "Copy code"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
};

/**
 * Memoized so a streamed message re-parsing on every frame doesn't rebuild
 * the whole element tree each time — assistant-ui's own helper for this.
 */
const components = memoizeMarkdownComponents({
  CodeHeader,
  // `node` is already stripped by memoizeMarkdownComponents' own wrapper, so
  // these receive plain element props.
  table: (props) => (
    // The chat pane is the middle of three columns, so a table wide enough to
    // matter has to scroll within itself. Unwrapped, it sets its own intrinsic
    // width and pushes a horizontal scrollbar onto the whole app.
    <div className="message-md-table-wrap">
      <table {...props} />
    </div>
  ),
  a: (props) => (
    // A conversation and a live draft panel share this one page; letting a
    // link navigate in place would throw both away. `noreferrer` rides along
    // with `noopener` because the target is arbitrary model-authored output.
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
});

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="4.75" y="4.75" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M9.25 4.75V3.5a1.75 1.75 0 0 0-1.75-1.75h-4A1.75 1.75 0 0 0 1.75 3.5v4A1.75 1.75 0 0 0 3.5 9.25h1.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m2.75 7.25 2.75 2.75 5.75-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
