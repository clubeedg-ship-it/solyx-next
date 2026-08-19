import remarkGfm from "remark-gfm";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

/**
 * Renders an assistant text part as markdown.
 *
 * Without this, MessagePrimitive.Content falls back to assistant-ui's default
 * Text component, which prints the raw string. Every `**bold**`, heading, list,
 * table and code fence Sol wrote arrived on screen as literal characters,
 * because @assistant-ui/react-markdown was simply never a dependency of this
 * package. Installing it and passing this as the `Text` slot is the whole fix.
 *
 * `smooth` is off on purpose. The primitive defaults to a typing animation that
 * reveals text more slowly than it actually streams, and ChatPane already draws
 * its own thinking dots and a blinking cursor for exactly that state. Two
 * reveal effects layered over one stream reads as lag, not as polish.
 */
export function MarkdownText() {
  return <MarkdownTextPrimitive className="markdown" remarkPlugins={[remarkGfm]} smooth={false} />;
}
