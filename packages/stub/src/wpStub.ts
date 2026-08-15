import { createServer } from "node:http";

// Local stand-in for WordPress's draft preview endpoint, used only for
// running the draft proxy end-to-end in dev without ever contacting
// 2026.solyxenergy.nl or www.solyxenergy.nl (both are off-limits for this
// project — see AGENTS.md / the build brief). Speaks just enough of the real
// surface for the proxy to exercise its actual logic: HTTP Basic auth
// (WordPress Application Passwords, RFC 7617) and a `?p=<id>&preview=true`
// URL shape.

const PORT = Number(process.env.WP_STUB_PORT ?? 8788);
const USER = process.env.WORDPRESS_APP_USER ?? "sol-agent";
const PASSWORD = process.env.WORDPRESS_APP_PASSWORD ?? "stub stub stub stub";

function page(postId: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Concept ${postId} — Solyx Energy (stub)</title>
  <link rel="stylesheet" href="/wp-content/stub-theme.css">
</head>
<body>
  <main>
    <h1>Concept pagina ${postId}</h1>
    <p>Dit is een lokale stub-versie van een WordPress-conceptpagina, gebruikt
       om de draft-proxy te testen zonder de echte site te benaderen.</p>
    <img src="/wp-content/uploads/stub-image.png" alt="">
  </main>
</body>
</html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  const auth = req.headers.authorization;
  const expected = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
  if (auth !== expected) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="wp-stub"' }).end("Unauthorized");
    return;
  }

  if (url.searchParams.get("preview") === "true" && url.searchParams.has("p")) {
    const postId = url.searchParams.get("p") ?? "0";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page(postId));
    return;
  }

  res.writeHead(404).end("Not found (stub only serves ?p=<id>&preview=true)");
});

server.listen(PORT, () => {
  console.log(`WordPress stub listening on http://127.0.0.1:${PORT}`);
  console.log(`Point WORDPRESS_ORIGIN at this and WORDPRESS_APP_USER/PASSWORD at "${USER}" / the stub password.`);
});
