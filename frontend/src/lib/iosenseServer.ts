// Server-side IOsense client (imported only by the /api/iosense route).
// Resolves a Bearer token via SSO-token exchange / login, then PERSISTS it to
// disk so it survives reloads and server restarts — the user authenticates
// once and never re-enters a token. The browser only talks to /api/iosense.

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// This custom Next.js build does NOT load .env.local into the server runtime,
// so process.env.IOSENSE_* can be empty even though the file exists — which made
// login fail with "credentials not configured". Load the env files ourselves at
// startup so credentials are ALWAYS available and the dashboard can authenticate
// without any token pre-seeded. Existing process.env values win (never override).
function loadEnvFiles(): void {
  for (const file of [".env.local", ".env", "frontend/.env.local", "frontend/.env"]) {
    let txt: string;
    try {
      txt = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const raw of txt.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      v = v.replace(/^["']|["']$/g, ""); // strip surrounding quotes
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnvFiles();

// Read AFTER loadEnvFiles() so values from .env.local are picked up.
const BASE = process.env.IOSENSE_BASE_URL || "https://connector.iosense.io/api";
const ORG = process.env.IOSENSE_ORG || "https://iosense.io";
const USER = process.env.IOSENSE_USERNAME || "";
const PASS = process.env.IOSENSE_PASSWORD || "";
// Optional: use a ready-made token instead of username/password login.
const STATIC_TOKEN = process.env.IOSENSE_TOKEN || "";
// Where the exchanged token is persisted. Default to a project-relative file so
// it survives machine reboots (/tmp is cleared on reboot, which would drop the
// token and — with no stored credentials — break auth). Migrate any legacy
// /tmp token into the durable location on startup.
const TOKEN_FILE =
  process.env.IOSENSE_TOKEN_FILE ||
  resolve(process.cwd(), ".iosense-auth-token");
const LEGACY_TOKEN_FILE = "/tmp/iosense-auth-token.txt";
(function migrateLegacyToken() {
  try {
    readFileSync(TOKEN_FILE, "utf8");
    return; // durable token already present
  } catch {
    /* fall through */
  }
  try {
    const legacy = readFileSync(LEGACY_TOKEN_FILE, "utf8").trim();
    if (legacy) writeFileSync(TOKEN_FILE, legacy, "utf8");
  } catch {
    /* nothing to migrate */
  }
})();

function loadPersistedToken(): string | null {
  try {
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}
function persistToken(token: string): void {
  try {
    writeFileSync(TOKEN_FILE, token, "utf8");
  } catch {
    /* best-effort */
  }
}

export interface SensorPoint {
  devID: string;
  sensor: string;
  data: Record<string, number>;
}

interface DevCfg {
  sTime: number;
  eTime: number;
  devID: string;
  sensor: string;
  downscale: number;
}

// Aggressive downscale → tiny payloads. Cards only need first/last (delta), an
// average (temps), or the latest value, so a few hundred samples per sensor is
// plenty regardless of window length. `downscale` ≈ seconds between returned
// points; we size it so each sensor returns ~TARGET_POINTS samples. This keeps
// the response small (and fast to transfer + parse) even for month/year windows.
const TARGET_POINTS = 240;
function computeDownscale(sTime: number, eTime: number): number {
  const seconds = Math.max(1, (eTime - sTime) / 1000);
  return Math.max(30, Math.round(seconds / TARGET_POINTS));
}

let cachedToken: string | null = null;
// The last SSO token we successfully exchanged — lets us refresh on each new
// dashboard open (new token) without re-consuming the same one-time token
// during a single session (window changes reuse the cached Bearer).
let lastSso: string | null = null;

async function login(): Promise<string> {
  if (!USER || !PASS) {
    throw new Error("IOsense credentials/token not configured");
  }
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: {
      origin: ORG,
      organisation: ORG,
      "ngsw-bypass": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.success || !json?.authorization) {
    throw new Error(
      json?.errors?.join(", ") || `IOsense login failed (HTTP ${res.status})`,
    );
  }
  cachedToken = json.authorization as string;
  persistToken(cachedToken);
  return cachedToken;
}

// Exchange a one-time SSO token (from the portal URL, ~60s lifetime) for a
// real Bearer token, per the IOsense SDK flow.
async function exchangeSSO(ssoToken: string): Promise<string> {
  const res = await fetch(
    `${BASE}/retrieve-sso-token/${encodeURIComponent(ssoToken)}`,
    {
      method: "GET",
      headers: {
        organisation: ORG,
        "ngsw-bypass": "true",
        "Content-Type": "application/json",
      },
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!json?.success || !json?.token) {
    throw new Error(
      json?.errors?.join(", ") || `SSO token exchange failed (HTTP ${res.status})`,
    );
  }
  cachedToken = json.token as string;
  persistToken(cachedToken);
  return cachedToken;
}

/**
 * Resolve a usable Bearer token, in priority order:
 *  1. IOSENSE_TOKEN (static, server env)
 *  2. cached / disk-persisted token from a prior exchange (unless forced) —
 *     this is what lets the user authenticate once and never re-enter a token
 *  3. SSO token from the request (exchanged once, then cached + persisted)
 *  4. username/password login
 */
async function getToken(ssoToken?: string, force = false): Promise<string> {
  if (STATIC_TOKEN) return STATIC_TOKEN;

  // A newly-arrived SSO token (fresh dashboard open) → exchange it immediately
  // and refresh the saved token, so we never depend on a stale/expired one.
  // The same token within a session is not re-exchanged (it's one-time use).
  if (ssoToken && ssoToken !== lastSso) {
    try {
      const t = await exchangeSSO(ssoToken);
      lastSso = ssoToken;
      return t;
    } catch {
      // fresh token already consumed/invalid → fall through to cache/login
    }
  }

  if (!force) {
    if (!cachedToken) cachedToken = loadPersistedToken();
    if (cachedToken) return cachedToken;
  }
  if (ssoToken) {
    try {
      const t = await exchangeSSO(ssoToken);
      lastSso = ssoToken;
      return t;
    } catch (e) {
      // Only fall back to credential login if we actually have credentials;
      // otherwise surface the SSO failure so it's diagnosable.
      if (!USER || !PASS) throw e;
    }
  }
  // Credential login. If it fails transiently, degrade to any token we already
  // have (cached in memory or persisted on disk) rather than erroring the whole
  // dashboard — a stale token still beats "credentials not configured".
  try {
    return await login();
  } catch (e) {
    const fallback = cachedToken || loadPersistedToken();
    if (fallback) return fallback;
    throw e;
  }
}

async function putChunk(
  devConfig: DevCfg[],
  token: string,
): Promise<SensorPoint[]> {
  // IOsense hangs on a raw token — the Bearer prefix is mandatory.
  const auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  const res = await fetch(`${BASE}/account/widget/getAutoDownSampledData`, {
    method: "PUT",
    headers: {
      Authorization: auth,
      organisation: ORG,
      "ngsw-bypass": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ devConfig }),
  });
  if (res.status === 401 || res.status === 403) {
    const e = new Error("unauthorized") as Error & { code?: number };
    e.code = 401;
    throw e;
  }
  if (!res.ok) throw new Error(`IOsense API ${res.status}`);
  const json = await res.json().catch(() => ({}));
  return (json?.data ?? []) as SensorPoint[];
}

/** Fetch all device/sensor pairs over a window (chunked, parallel, with one
 *  automatic re-login if the cached token has expired). */
export async function fetchSensorsServer(
  pairs: { devID: string; sensor: string }[],
  sTime: number,
  eTime: number,
  ssoToken?: string,
): Promise<SensorPoint[]> {
  const downscale = computeDownscale(sTime, eTime);
  const devConfig: DevCfg[] = pairs.map((p) => ({
    sTime,
    eTime,
    devID: p.devID,
    sensor: p.sensor,
    downscale,
  }));
  const CHUNK = 20;
  const chunks: DevCfg[][] = [];
  for (let i = 0; i < devConfig.length; i += CHUNK) {
    chunks.push(devConfig.slice(i, i + CHUNK));
  }

  async function run(token: string) {
    const out: SensorPoint[] = [];
    let auth401 = false;
    const settled = await Promise.allSettled(
      chunks.map((c) => putChunk(c, token)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(...r.value);
      else if ((r.reason as { code?: number })?.code === 401) auth401 = true;
    }
    return { out, auth401 };
  }

  let token = await getToken(ssoToken);
  let { out, auth401 } = await run(token);
  if (auth401 && out.length === 0) {
    token = await getToken(ssoToken, true); // token expired → refresh once
    ({ out } = await run(token));
  }
  return out;
}

export interface LastDP {
  devID: string;
  sensor: string;
  time: string;
  value: number;
}

/** Latest data point per sensor, independent of any time window — used as a
 *  fallback so the tooltip/timestamp still show the most recent reading even
 *  when the selected window has no data. Best-effort (returns [] on failure). */
export async function fetchLastDPs(
  pairs: { devID: string; sensor: string }[],
  ssoToken?: string,
): Promise<LastDP[]> {
  if (pairs.length === 0) return [];
  try {
    const token = await getToken(ssoToken);
    const auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const res = await fetch(
      `${BASE}/account/deviceData/getLastDPsofDevicesAndSensorProcessed`,
      {
        method: "PUT",
        headers: {
          Authorization: auth,
          organisation: ORG,
          "ngsw-bypass": "true",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          devices: pairs.map((p) => ({ devID: p.devID, sensor: p.sensor })),
        }),
      },
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return ((json?.data ?? []) as Array<Record<string, unknown>>).map((d) => ({
      devID: String(d.devID),
      sensor: String(d.sensor),
      time: String(d.time),
      value: Number(d.value),
    }));
  } catch {
    return [];
  }
}
