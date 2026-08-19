/**
 * Secret scrubber for anything on its way into the systemd journal.
 *
 * This process holds the Gateway token, the WordPress application password and
 * the session signing secret, and hands the whole Config to the request
 * listener. One JSON.stringify of the wrong object would put a live credential
 * in the journal forever, so every field logged goes through here first.
 *
 * Matching is on a normalised (lowercased, separator-stripped) key and is
 * deliberately substring-based: "gatewayToken", "Set-Cookie" and
 * "wordpressAppPassword" must all be caught without maintaining an exact list
 * that silently misses the next field someone adds.
 */
export const REDACTED = "[redacted]";

const SECRET_KEY_PARTS = [
  "authorization",
  "cookie",
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "credential",
];

// A per-request path: bounded so a deep or huge value can never dominate the
// cost of the request it describes.
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

// "Basic <base64>" / "Bearer <jwt>" reaching us as a bare value rather than
// under an Authorization key — draftProxy.ts builds exactly this string.
const CREDENTIAL_VALUE = /^(basic|bearer)\s+\S+/i;

function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEY_PARTS.some((part) => normalised.includes(part));
}

export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet<object>());
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return CREDENTIAL_VALUE.test(value) ? REDACTED : value;
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return value.toString();
    return value;
  }

  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Buffer.isBuffer(value)) return `[buffer ${value.length}b]`;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
      return items;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : walk(item, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}
