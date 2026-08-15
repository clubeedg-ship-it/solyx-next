# Single image: the built static frontend plus the thin backend that serves
# it and bridges to OpenClaw + WordPress. One container is what makes
# scale-to-zero via Sablier work (see docker-compose.fragment.yml) — there is
# nothing else to stop or start.
#
# Not the smallest possible image (the runtime stage keeps the full,
# workspace-hoisted node_modules rather than a hand-pruned per-package tree)
# — a deliberate simplicity trade-off for a one-user internal tool. Revisit
# only if image size or cold-start time actually becomes a problem (see
# PLAN.md §4 on measuring real cold-start cost before optimizing it).

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/stub/package.json packages/stub/package.json
COPY tsconfig.base.json ./
RUN npm ci

COPY packages/server packages/server
COPY packages/web packages/web

# AUTH_MODE ("password", "access", or "clerk") is baked into the frontend
# bundle at build time by packages/web/vite.config.ts (not secret, just a
# mode string) — omit this build arg entirely for the default
# AUTH_MODE=password build (its runtime config — SESSION_SECRET,
# AUTH_PASSWORD_HASH, etc. — is env-only, set in the compose fragment's
# env_file, not a build arg). The Clerk publishable key is not secret
# either — it ships in the frontend bundle by design (see .env.example) —
# so both are build args, not runtime secrets. Only relevant together, for
# AUTH_MODE=clerk builds:
# docker build --build-arg AUTH_MODE=clerk --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
ARG AUTH_MODE
ENV AUTH_MODE=${AUTH_MODE}
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

RUN npm run build --workspace packages/web \
 && npm run build --workspace packages/server \
 && npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --create-home --shell /usr/sbin/nologin webui

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

USER webui
WORKDIR /app/packages/server
ENV STATIC_DIR=../web/dist
EXPOSE 8787

CMD ["node", "dist/index.js"]
