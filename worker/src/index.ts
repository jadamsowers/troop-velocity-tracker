/**
 * Cloudflare Worker — CORS proxy for BSA Scouting API.
 *
 * Routes:
 *   POST /auth/*  → https://auth.scouting.org/*   (login)
 *   *    /api/*   → https://api.scouting.org/*     (data)
 *
 * Adds CORS headers so the frontend can call BSA from any origin.
 */

interface Env {
  ALLOWED_ORIGIN: string;
}

const UPSTREAM: Record<string, string> = {
  '/auth/': 'https://auth.scouting.org/',
  '/api/':  'https://api.scouting.org/',
};

function corsHeaders(origin: string, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  // In production, lock to your domain. During development, allow any.
  const allowOrigin = allowed === '*' ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-esb-url',
    'Access-Control-Max-Age': '86400',
  };
}

function matchUpstream(pathname: string): { upstream: string; stripped: string } | null {
  for (const [prefix, base] of Object.entries(UPSTREAM)) {
    if (pathname.startsWith(prefix)) {
      return {
        upstream: base,
        stripped: pathname.slice(prefix.length),
      };
    }
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const match = matchUpstream(url.pathname);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Build upstream request
    const upstreamUrl = match.upstream + match.stripped + url.search;

    const headers = new Headers();
    // Forward relevant headers
    for (const key of ['content-type', 'accept', 'authorization', 'x-esb-url']) {
      const val = request.headers.get(key);
      if (val) headers.set(key, val);
    }
    // BSA expects a browser-like UA
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Return response with CORS headers
    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const [k, v] of Object.entries(cors)) {
      responseHeaders.set(k, v);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
} satisfies ExportedHandler<Env>;
