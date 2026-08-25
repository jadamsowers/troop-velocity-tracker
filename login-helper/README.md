# login-helper/

Node service that runs inside the combined Docker image and serves three things
on one port:

| Path               | What                                                        |
| ------------------ | ----------------------------------------------------------- |
| `/`                | Built tracker SPA (from `dist/`)                            |
| `/token`, `/token/*` | Login helper page (this directory's `public/`)            |
| `POST /api/login`  | Credential-replay backend that calls `auth.scouting.org`    |
| `ANY /scouting-api/*` | Transparent proxy to `api.scouting.org` for the tracker  |
| `/healthz`         | JSON `{ok:true}`                                            |

Zero runtime dependencies — Node 22+ built-ins only.

## Files

- `server.mjs` — HTTP server, routing, `/scouting-api` proxy, static serving.
- `scouting.mjs` — `POST auth.scouting.org/api/users/{u}/authenticate` +
  unit-list discovery (ported from `scripts/browser-login.mjs`).
- `ratelimit.mjs` — In-memory 5/60s token bucket, per hashed client IP.
- `public/` — Vanilla HTML/CSS/JS for the `/token` page.
- `package.json` — Just the ESM+engines declaration; kept so `node .`
  works from this directory during local dev.

## Local dev

The full app (tracker + helper + proxy):

```
npm run build              # produces ./dist for the tracker
node login-helper/server.mjs
# → http://localhost:8080  (set PORT to override)
```

The tracker's own dev server (`npm run dev`) still works standalone; Vite
proxies `/scouting-api` and runs the Playwright plugin at `POST /api/login`.

## Deploy

Build and run from the repo root:

```
docker build -t troop-velocity-tracker .
docker run -d --name tvt -p 8080:8080 troop-velocity-tracker
```

## Environment

| Var          | Default        | Notes                                                                                     |
| ------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `PORT`       | `8080`         |                                                                                           |
| `TRUST_PROXY`| `cloudflare` in Docker, `off` in local dev | `cloudflare` = prefer `CF-Connecting-IP`, then `X-Forwarded-For`. `1`/`true` = same. Anything else falls back to the socket peer. Never trust these headers on a directly-exposed listener — an attacker can spoof them. |

## Contract fragility

`POST auth.scouting.org/api/users/{username}/authenticate` was reverse-
engineered from Scoutbook Plus's JS bundle. Scouting America has no public
docs and can change it without notice. If it breaks:

1. Users still have the "Log in another way" DevTools fallback on `/token`.
2. Re-diff `advancements.scouting.org/main.*.js` for the
   `authenticate:e.mutation` block and update `scouting.mjs`.
