# Deployment

## Architecture

The app consists of two parts:

1. **Frontend** — Static React PWA (Vite build output in `dist/`)
2. **CORS Proxy** — Cloudflare Worker (`worker/`) that proxies requests to BSA's APIs

In development, Vite's built-in proxy handles CORS. In production, the Cloudflare Worker serves this role.

### Worker routes

| Route | Upstream | Purpose |
|-------|----------|---------|
| `POST /auth/*` | `https://auth.scouting.org/*` | Login (username/password) |
| `* /api/*` | `https://api.scouting.org/*` | Scouting data API |

## Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login          # one-time Cloudflare auth
npx wrangler deploy
```

This produces a URL like `https://velocity-tracker-api.<your-subdomain>.workers.dev`.

### Configure the allowed origin

Lock the Worker to your production domain so it can't be used as an open proxy:

```bash
cd worker
npx wrangler secret put ALLOWED_ORIGIN
# enter your production URL, e.g.: https://velocity.example.com
```

During development or testing you can set `ALLOWED_ORIGIN = "*"` in `wrangler.toml`, but **do not leave this in production**.

## Build the frontend

Set `VITE_WORKER_URL` to your deployed Worker URL:

```bash
VITE_WORKER_URL=https://velocity-tracker-api.<your-subdomain>.workers.dev npm run build
```

Or create a `.env.production` file:

```
VITE_WORKER_URL=https://velocity-tracker-api.<your-subdomain>.workers.dev
```

The build output is in `dist/` — deploy it to any static host (Cloudflare Pages, Vercel, Netlify, GitHub Pages, etc.).

## Local development

No Worker needed locally. Vite proxies requests directly:

- `/scouting-api/*` → `https://api.scouting.org/*`
- `/auth-api/*` → `https://auth.scouting.org/*`

```bash
npm run dev
```

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_WORKER_URL` | Frontend build | Worker URL for production API calls |
| `ALLOWED_ORIGIN` | Worker (secret) | Lock CORS to your domain |
