#!/usr/bin/env node

/**
 * Standalone Playwright login script.
 * Spawned by the Vite plugin as a child process to avoid in-process conflicts.
 *
 * Outputs a single JSON line to stdout on success:
 *   { "token": "...", "units": [...] }
 * Or on error:
 *   { "error": "..." }
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, unlinkSync } from "fs";

const LOGIN_URL = "https://advancements.scouting.org/login";
const API_BASE = "https://api.scouting.org";
const ESB_URL = "aHR0cHM6Ly9hZHZhbmNlbWVudHMuc2NvdXRpbmcub3JnL3Jvc3Rlcg==";
const BROWSER_PROFILE = join(homedir(), ".scouts-cli", "browser-profile");

const LOCK_FILES = [
  "SingletonCookie",
  "SingletonSocket",
  "SingletonLock",
  "RunningChromeVersion",
];

function cleanLocks(dir) {
  for (const name of LOCK_FILES) {
    try { unlinkSync(join(dir, name)); } catch { /* ok */ }
  }
}

function decodeJwt(token) {
  try {
    const [, payload] = token.split(".");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString());
  } catch {
    return null;
  }
}

async function fetchUnits(token, userId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-esb-url": ESB_URL,
    Accept: "application/json",
  };

  const units = [];
  const seen = new Set();

  const add = (org) => {
    const guid = org.organizationGuid || org.orgGuid;
    if (guid && !seen.has(guid)) {
      units.push({
        guid,
        name: `${org.unitType || "Unit"} ${org.unitNumber || org.number || ""}`.trim(),
      });
      seen.add(guid);
    }
  };

  try {
    const pRes = await fetch(`${API_BASE}/persons/v2/${userId}/personprofile`, { headers });
    if (pRes.ok) {
      const p = await pRes.json();
      (p.organizationPositions || []).forEach(add);
    }
    const sRes = await fetch(`${API_BASE}/persons/${userId}/myScout`, { headers });
    if (sRes.ok) {
      const s = await sRes.json();
      if (Array.isArray(s)) s.forEach(add);
    }
  } catch (e) {
    process.stderr.write(`[browser-login] fetch error: ${e.message}\n`);
  }

  return units;
}

async function main() {
  let context;
  try {
    mkdirSync(BROWSER_PROFILE, { recursive: true });
    cleanLocks(BROWSER_PROFILE);

    context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });

    const page = context.pages()[0] || await context.newPage();

    // Clear stale login data
    try {
      await page.goto("https://advancements.scouting.org/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.evaluate(() => localStorage.removeItem("LOGIN_DATA"));
    } catch { /* ok */ }

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Poll for token (up to 5 minutes)
    let token = null;
    const deadline = Date.now() + 5 * 60 * 1000;

    while (Date.now() < deadline) {
      try {
        const raw = await page.evaluate(() => localStorage.getItem("LOGIN_DATA"));
        if (raw) {
          const data = JSON.parse(raw);
          if (data.token) { token = data.token; break; }
        }
      } catch { /* page navigated */ }
      await new Promise(r => setTimeout(r, 1000));
    }

    await context.close();
    context = undefined;

    if (!token) {
      console.log(JSON.stringify({ error: "Login timed out (5 minutes)" }));
      process.exit(1);
    }

    const payload = decodeJwt(token);
    const userId = payload?.uid;
    if (!userId) {
      console.log(JSON.stringify({ error: "Token missing uid claim", token }));
      process.exit(1);
    }

    const units = await fetchUnits(token, userId);
    console.log(JSON.stringify({ token, units }));
  } catch (err) {
    if (context) {
      try { await context.close(); } catch { /* ignore */ }
    }
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
