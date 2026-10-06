# login-helper/

Node service that runs inside the combined Docker image and serves three things
on one port. The tracker's own Setup screen is the sign-in UI: it posts the
user's my.scouting.org username and password to `/api/login`, stores the
returned token in the browser's local storage, and never asks the user to
copy or paste anything.

| Path               | What                                                        |
| ------------------ | ----------------------------------------------------------- |
| `/`                | Built tracker SPA (from `dist/`)                            |
| `POST /api/login`  | Credential-replay backend that calls `auth.scouting.org`    |
| `ANY /scouting-api/*` | Transparent proxy to `api.scouting.org` for the tracker  |
| `/healthz`         | JSON `{ok:true}`                                            |

Zero runtime dependencies — Node 22+ built-ins only.

## Files

- `server.mjs` — HTTP server, routing, `/scouting-api` proxy, static serving.
- `scouting.mjs` — `POST auth.scouting.org/api/users/{u}/authenticate` +
  unit-list discovery. Also imported by the Vite dev plugin so `npm run dev`
  signs in the same way.
- `ratelimit.mjs` — In-memory 5/60s token bucket, per hashed client IP.
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
proxies `/scouting-api` and serves the same `POST /api/login` via
`plugins/vite-plugin-scoutbook-login.ts`.

## Deploy

Build and run from the repo root:

```
docker build -t troop-velocity-tracker .
docker run -d --name tvt -p 8080:8080 troop-velocity-tracker
```

## Credential handling

- Credentials are forwarded once to `auth.scouting.org` and then discarded.
  The server writes no request bodies, usernames, passwords, or tokens to its
  logs. `login.attempt` lines carry only a hashed client IP, the status, and
  the unit count.
- Responses are `Cache-Control: no-store`.
- The token lives only in the user's browser (`localStorage`). The tracker
  checks the JWT `exp` on load and on a timer, and sends the user back to
  sign-in when it expires. The chosen unit is remembered, so re-login goes
  straight to the dashboard.
- Put the app behind HTTPS (the bundled cloudflared tunnel does this) so
  credentials are encrypted in transit.

## Environment

| Var          | Default        | Notes                                                                                     |
| ------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `PORT`       | `8080`         |                                                                                           |
| `TRUST_PROXY`| `cloudflare` in Docker, `off` in local dev | `cloudflare` = prefer `CF-Connecting-IP`, then `X-Forwarded-For`. `1`/`true` = same. Anything else falls back to the socket peer. Never trust these headers on a directly-exposed listener — an attacker can spoof them. |

## Contract fragility

`POST auth.scouting.org/api/users/{username}/authenticate` was reverse-
engineered from Scoutbook Plus's JS bundle. Scouting America has no public
docs and can change it without notice. If it breaks:

1. Users can still paste a bearer token under "Advanced: use an existing
   token" on the sign-in screen.
2. Re-diff `advancements.scouting.org/main.*.js` for the
   `authenticate:e.mutation` block and update `scouting.mjs`.
