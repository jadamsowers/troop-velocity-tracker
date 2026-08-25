const AUTH_BASE = "https://auth.scouting.org";
const API_BASE = "https://api.scouting.org";
const ORIGIN = "https://advancements.scouting.org";
const LOGIN_REFERER = `${ORIGIN}/login`;
const ROSTER_URL = `${ORIGIN}/roster`;

const ESB_LOGIN = Buffer.from(LOGIN_REFERER).toString("base64");
const ESB_ROSTER = Buffer.from(ROSTER_URL).toString("base64");

const UPSTREAM_TIMEOUT_MS = 10_000;

function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString());
  } catch {
    return null;
  }
}

async function fetchUnits(token, userId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-esb-url": ESB_ROSTER,
    Accept: "application/json",
  };
  const seen = new Set();
  const units = [];
  const add = (org) => {
    const guid = org.organizationGuid || org.orgGuid;
    if (!guid || seen.has(guid)) return;
    const name = `${org.unitType || "Unit"} ${org.unitNumber || org.number || ""}`.trim();
    units.push({ guid, name });
    seen.add(guid);
  };

  const both = await Promise.allSettled([
    fetch(`${API_BASE}/persons/v2/${userId}/personprofile`, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }),
    fetch(`${API_BASE}/persons/${userId}/myScout`, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }),
  ]);

  if (both[0].status === "fulfilled" && both[0].value.ok) {
    const p = await both[0].value.json().catch(() => ({}));
    (p.organizationPositions || []).forEach(add);
  }
  if (both[1].status === "fulfilled" && both[1].value.ok) {
    const s = await both[1].value.json().catch(() => []);
    if (Array.isArray(s)) s.forEach(add);
  }
  return units;
}

export async function authenticate({ username, password }) {
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    return { status: 400, body: { error: "Username and password are required." } };
  }

  let res;
  try {
    res = await fetch(
      `${AUTH_BASE}/api/users/${encodeURIComponent(username)}/authenticate`,
      {
        method: "POST",
        headers: {
          Accept: "application/json; version = 2",
          "Content-Type": "application/json",
          "x-esb-url": ESB_LOGIN,
          Origin: ORIGIN,
          Referer: LOGIN_REFERER,
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return {
      status: 502,
      body: { error: timedOut ? "scouting.org timed out." : "Could not reach scouting.org." },
    };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return {
        status: 401,
        body: {
          error: data?.message || "Invalid username or password.",
          code: data?.code,
        },
      };
    }
    if (res.status === 429) {
      return {
        status: 429,
        body: {
          error:
            "scouting.org is temporarily rate-limiting logins from this server. Please wait a minute and try again, or use the fallback instructions.",
          code: data?.code,
        },
      };
    }
    return {
      status: 502,
      body: {
        error:
          "scouting.org rejected the login. Try again in a moment, or use the fallback instructions.",
        code: data?.code,
      },
    };
  }

  if (!data?.token) {
    return { status: 502, body: { error: "scouting.org returned no token." } };
  }

  const payload = decodeJwt(data.token);
  if (!payload?.uid) {
    return { status: 502, body: { error: "Token missing uid claim." } };
  }

  const units = await fetchUnits(data.token, payload.uid);
  return { status: 200, body: { token: data.token, units } };
}
