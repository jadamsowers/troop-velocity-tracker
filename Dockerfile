# Multi-stage: build the tracker SPA, then ship a tiny Node runtime that
# serves the SPA + the login helper + a scouting.org API proxy on one port.

FROM node:22-alpine AS builder
WORKDIR /build

# Skip Playwright's ~200MB Chromium download — it's a devDependency of the
# tracker used only by the local Vite login plugin, never in the built app.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CI=true

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts index.html ./
COPY plugins ./plugins
COPY public ./public
COPY src ./src

RUN npm run build


FROM node:22-alpine
WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY login-helper/server.mjs login-helper/scouting.mjs login-helper/ratelimit.mjs ./login-helper/
COPY login-helper/public ./login-helper/public

ENV NODE_ENV=production \
    PORT=8080 \
    TRUST_PROXY=cloudflare

EXPOSE 8080
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "login-helper/server.mjs"]
