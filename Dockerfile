# Multi-stage: build the tracker SPA, then ship a tiny Node runtime that
# serves the SPA + the sign-in endpoint + a scouting.org API proxy on one port.

FROM node:22-alpine AS builder
WORKDIR /build

ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts index.html ./
COPY plugins ./plugins
# vite.config.ts imports the dev login middleware, which shares this module.
COPY login-helper/scouting.mjs login-helper/scouting.d.mts ./login-helper/
COPY public ./public
COPY src ./src

RUN npm run build


FROM node:22-alpine
WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY login-helper/server.mjs login-helper/scouting.mjs login-helper/ratelimit.mjs ./login-helper/

ENV NODE_ENV=production \
    PORT=8080 \
    TRUST_PROXY=cloudflare

EXPOSE 8080
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "login-helper/server.mjs"]
