import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { authenticate } from "./scouting.mjs";
import { hit as rateLimitHit } from "./ratelimit.mjs";

const PORT = Number(process.env.PORT || 8080);
const TRUST_PROXY = (process.env.TRUST_PROXY || "").toLowerCase();
const HERE = fileURLToPath(new URL(".", import.meta.url));
const HELPER_DIR = resolve(HERE, "public");
const TRACKER_DIR = resolve(HERE, "..", "dist");
const MAX_BODY_BYTES = 4096;
const PROXY_TIMEOUT_MS = 20_000;
const SCOUTING_API_ORIGIN = "https://api.scouting.org";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

// Headers we DO NOT forward to/from the upstream API. `Host` would misroute;
// `Content-Length` gets recomputed by fetch; hop-by-hop headers per RFC 7230.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);
const STRIP_REQUEST_HEADERS = new Set([...HOP_BY_HOP, "host", "content-length"]);
const STRIP_RESPONSE_HEADERS = new Set([...HOP_BY_HOP, "content-encoding", "content-length"]);

function clientIp(req) {
  if (TRUST_PROXY === "cloudflare" || TRUST_PROXY === "1" || TRUST_PROXY === "true") {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff) return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function clientKey(req) {
  return createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 12);
}

function log(event, fields = {}) {
  const line = { ts: new Date().toISOString(), event, ...fields };
  process.stdout.write(JSON.stringify(line) + "\n");
}

function securityHeaders() {
  // CSP is intentionally permissive: the tracker SPA needs inline styles from
  // Vite's build and connects to same-origin /scouting-api. Frame-ancestors is
  // still locked. Add per-response overrides where a stricter policy fits.
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(res, status, body, extra = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...extra,
  });
  res.end(payload);
}

async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (maxBytes > 0 && size > maxBytes) {
        rejectPromise(new Error("body-too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", rejectPromise);
  });
}

async function handleLogin(req, res) {
  const key = clientKey(req);

  if ((req.headers["content-type"] || "").split(";")[0].trim() !== "application/json") {
    sendJson(res, 415, { error: "Content-Type must be application/json." });
    return;
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 413, { error: "Request body too large." });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const rl = rateLimitHit(key);
  if (!rl.allowed) {
    log("login.rate_limited", { ipHash: key, retryAfter: rl.retryAfter });
    sendJson(
      res,
      429,
      { error: `Too many attempts. Try again in ${rl.retryAfter}s.` },
      { "Retry-After": String(rl.retryAfter) },
    );
    return;
  }

  const result = await authenticate({
    username: body.username,
    password: body.password,
  });

  log("login.attempt", {
    ipHash: key,
    status: result.status,
    ok: result.status === 200,
    upstreamCode: result.body?.code,
    units: result.body?.units?.length,
  });

  sendJson(res, result.status, result.body);
}

async function proxyScoutingApi(req, res) {
  const url = new URL(req.url, "http://x");
  // Strip the /scouting-api prefix; forward pathname + search.
  const rest = url.pathname.replace(/^\/scouting-api/, "") || "/";
  const upstream = `${SCOUTING_API_ORIGIN}${rest}${url.search}`;

  const outHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (STRIP_REQUEST_HEADERS.has(k.toLowerCase())) continue;
    if (Array.isArray(v)) outHeaders[k] = v.join(", ");
    else if (v != null) outHeaders[k] = String(v);
  }

  let body;
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    try {
      // Cap proxied bodies at 512KB — well above anything scouting.org expects
      // and enough to block obvious abuse from a malicious tunnel client.
      body = await readBody(req, 512 * 1024);
    } catch {
      sendJson(res, 413, { error: "Proxied request body too large." });
      return;
    }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: outHeaders,
      body: body && body.length ? body : undefined,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    log("proxy.error", {
      path: rest,
      message: err?.message,
      timedOut,
    });
    sendJson(res, 502, {
      error: timedOut ? "scouting.org timed out." : "Could not reach scouting.org.",
    });
    return;
  }

  const respHeaders = {};
  upstreamRes.headers.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    respHeaders[key] = value;
  });
  Object.assign(respHeaders, securityHeaders());

  res.writeHead(upstreamRes.status, respHeaders);
  if (upstreamRes.body) {
    const reader = upstreamRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

async function serveFile(res, absPath, ext, { cacheControl } = {}) {
  const buf = await readFile(absPath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": buf.length,
    "Cache-Control": cacheControl || (ext === ".html" ? "no-store" : "public, max-age=300"),
    ...securityHeaders(),
  });
  res.end(buf);
}

async function serveFromDir({ res, rootDir, relPath, spaFallback }) {
  const normalized = normalize(relPath.startsWith("/") ? relPath.slice(1) : relPath);
  const abs = resolve(rootDir, normalized);
  if (!abs.startsWith(rootDir + sep) && abs !== rootDir) {
    sendJson(res, 400, { error: "Bad path." });
    return;
  }
  let target = abs;
  try {
    const s = await stat(target);
    if (s.isDirectory()) target = join(target, "index.html");
    else if (!s.isFile()) throw new Error("not-file");
  } catch {
    if (spaFallback) {
      target = join(rootDir, "index.html");
    } else {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
  }

  const ext = extname(target).toLowerCase();
  try {
    await serveFile(res, target, ext);
  } catch (err) {
    log("static.error", { path: relPath, message: err?.message });
    sendJson(res, 404, { error: "Not found." });
  }
}

async function handleGet(req, res) {
  const url = new URL(req.url, "http://x");
  const path = decodeURIComponent(url.pathname);

  if (path === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (path === "/token" || path === "/token/") {
    await serveFromDir({
      res,
      rootDir: HELPER_DIR,
      relPath: "/index.html",
      spaFallback: false,
    });
    return;
  }

  if (path.startsWith("/token/")) {
    await serveFromDir({
      res,
      rootDir: HELPER_DIR,
      relPath: path.slice("/token".length),
      spaFallback: false,
    });
    return;
  }

  await serveFromDir({
    res,
    rootDir: TRACKER_DIR,
    relPath: path,
    spaFallback: true,
  });
}

const server = createServer(async (req, res) => {
  try {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://x");

    if (url.pathname === "/api/login" && method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (url.pathname === "/scouting-api" || url.pathname.startsWith("/scouting-api/")) {
      await proxyScoutingApi(req, res);
      return;
    }

    if (method === "GET" || method === "HEAD") {
      await handleGet(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (err) {
    log("server.error", { message: err?.message });
    if (!res.headersSent) sendJson(res, 500, { error: "Internal error." });
    else res.end();
  }
});

server.listen(PORT, () => {
  log("server.listen", {
    port: PORT,
    trustProxy: TRUST_PROXY || "off",
    helperDir: HELPER_DIR,
    trackerDir: TRACKER_DIR,
  });
});
