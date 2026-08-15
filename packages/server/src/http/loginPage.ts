// AUTH_MODE=password only. A single self-contained HTML document — inline
// <style>, a plain <form method="post">, no client-side JS, no build step —
// so it can be served before any authentication check even exists yet
// (loginRoutes.ts) and keeps working even if the React bundle is broken or
// missing. Visual tokens (colors, font stack) are hand-kept in sync with
// packages/web/src/styles.css rather than shared via import: this page must
// render correctly independent of the frontend build, so it deliberately
// does not depend on it. Quiet and considered on purpose, same design
// language as the rest of the app (styles.css's own top comment) — no
// marketing copy, just an orienting line and the two fields.

export interface LoginPageOptions {
  /** Never more specific than this — see passwordAuth.ts / README "Auth"
   *  "no timing oracle": the message must not be able to reveal whether a
   *  submitted username exists, so failure is always the same generic
   *  string regardless of which field was wrong. */
  error?: "invalid" | "rate-limited";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLoginPage(options: LoginPageOptions = {}): string {
  const errorMessage =
    options.error === "invalid"
      ? "Incorrect username or password."
      : options.error === "rate-limited"
        ? "Too many attempts. Wait a few minutes and try again."
        : undefined;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — Solyx</title>
<style>
:root {
  --canvas: #f6f5f2;
  --surface: #ffffff;
  --surface-sunken: #efede8;
  --border: rgba(28, 27, 24, 0.14);
  --border-subtle: rgba(28, 27, 24, 0.08);
  --text-primary: #1c1b18;
  --text-secondary: #5c5850;
  --text-tertiary: #6e6a63;
  --accent: #1b6e4f;
  --accent-strong: #14503a;
  --accent-contrast: #ffffff;
  --danger: #ae4530;
  --danger-soft: rgba(174, 69, 48, 0.1);
  --shadow-color: rgba(28, 27, 24, 0.1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #0d0e10;
    --surface: #16171a;
    --surface-sunken: #1b1d20;
    --border: rgba(255, 255, 255, 0.12);
    --border-subtle: rgba(255, 255, 255, 0.06);
    --text-primary: #edece8;
    --text-secondary: #a6a39b;
    --text-tertiary: #89857d;
    --accent: #3fa980;
    --accent-strong: #56c296;
    --accent-contrast: #08120d;
    --danger: #e2897b;
    --danger-soft: rgba(226, 137, 123, 0.14);
    --shadow-color: rgba(0, 0, 0, 0.55);
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: var(--text-primary);
  background: var(--canvas);
  display: flex;
  align-items: center;
  justify-content: center;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card {
  width: 100%;
  max-width: 320px;
  margin: 1.5rem;
  padding: 2rem 1.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 1px 2px var(--shadow-color), 0 24px 48px -24px var(--shadow-color);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.brand-mark {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  flex: none;
}
.brand-name { font-weight: 600; font-size: 0.9375rem; letter-spacing: -0.01em; }
h1 {
  margin: 0 0 0.35rem;
  font-size: 1.625rem; /* matches --text-xl in styles.css, reserved there for this heading */
  font-weight: 600;
  letter-spacing: -0.01em;
}
.subtext {
  margin: 0 0 1.5rem;
  color: var(--text-secondary);
  font-size: 0.84375rem;
  line-height: 1.5;
}
form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
label {
  font-size: 0.78125rem;
  font-weight: 500;
  color: var(--text-secondary);
}
input {
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  font: inherit;
  font-size: 0.9375rem;
  background: var(--surface);
  color: var(--text-primary);
}
input:focus-visible { border-color: var(--accent); }
button {
  margin-top: 0.25rem;
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-contrast);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
button:hover { background: var(--accent-strong); }
.error {
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 0.8125rem;
  line-height: 1.4;
  margin: 0;
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; }
}
</style>
</head>
<body>
<div class="card">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="brand-name">Solyx</span>
  </div>
  <h1>Sign in</h1>
  <p class="subtext">Sign in to talk to Sol and review the drafts it's working on.</p>
  <form method="post" action="/login">
    <div class="field">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" autofocus>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    ${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
    <button type="submit">Sign in</button>
  </form>
</div>
</body>
</html>
`;
}
