import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // One .env at the repo root serves the server, the stub, and this build —
  // see .env.example. Without this, Vite would only look in packages/web/.
  const envDir = "../..";
  // Vite only auto-exposes VITE_-prefixed vars to import.meta.env. AUTH_MODE
  // is the server's env var name (config.ts); rather than making the
  // operator also set a separate VITE_AUTH_MODE and keep the two in sync,
  // `loadEnv` reads the same root .env directly (ignoring the prefix
  // filter) and `define` bakes it in under the VITE_ name env.ts expects.
  // Not secret, so safe to inline at build time same as the Clerk key below.
  const env = loadEnv(mode, envDir, "");

  return {
    plugins: [react()],
    envDir,
    define: {
      "import.meta.env.VITE_AUTH_MODE": JSON.stringify(env.AUTH_MODE ?? "password"),
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
    server: {
      port: 5173,
      proxy: {
        // Local dev only: the built app is served by the backend itself in
        // production (single container, see README "Deploy"). In dev, Vite's
        // own server proxies API/WS calls to the backend so the browser only
        // ever talks to one origin either way.
        "/api": "http://127.0.0.1:8787",
        "/ws": { target: "ws://127.0.0.1:8787", ws: true },
      },
    },
  };
});
