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
// Auth is SSO-only: the Bearer token comes from an SSO-token exchange (the
// portal appends ?ssoToken=… to the dashboard URL) or a ready-made IOSENSE_TOKEN.
// There is NO username/password login.
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
 * Resolve a usable Bearer token — SSO ONLY (no username/password), in order:
 *  1. IOSENSE_TOKEN (static, server env)
 *  2. A fresh SSO token from the request (portal URL) → exchanged + persisted
 *  3. cached / disk-persisted token from a prior exchange (unless forced)
 *  4. re-exchange the SSO token (e.g. forced refresh after a 401)
 * Throws a clear, actionable error if none is available.
 */
// Turn the token the portal handed us into a usable Bearer. First try exchanging
// it (a short-lived one-time SSO token → Bearer). If exchange fails but the value
// itself looks like a real Bearer/JWT (long / dotted), use it directly. We only
// PERSIST a token once it has actually worked (see markTokenGood) so a bad value
// can never get stuck on disk.
async function resolveProvided(token: string): Promise<string> {
  try {
    return await exchangeSSO(token); // persists on success
  } catch {
    // Looks like a real token already? (avoid persisting short junk params)
    if (token.length >= 100 || token.split(".").length === 3) {
      cachedToken = token; // in-memory only; persisted after it works
      return token;
    }
    throw new Error(
      "IOsense SSO token exchange failed and the value is not a usable Bearer token.",
    );
  }
}

async function getToken(ssoToken?: string, force = false): Promise<string> {
  // 1. A FRESH SSO token from the portal URL is the primary, self-healing source.
  //    Exchange it for a Bearer so the dashboard authenticates automatically on
  //    open — even if a previously stored/static token has since expired. One-time
  //    SSO tokens are consumed on first exchange, so only exchange one we haven't
  //    already exchanged this session (ssoToken !== lastSso); later calls in the
  //    same session reuse the cached Bearer (step 2). If the exchange fails (token
  //    already consumed / expired), fall through to the other sources.
  if (ssoToken && ssoToken !== lastSso) {
    try {
      const t = await resolveProvided(ssoToken); // sets cachedToken + persists
      lastSso = ssoToken;
      return t;
    } catch {
      /* fall through */
    }
  }

  // On a forced refresh (after a 401) drop the token that just failed.
  if (force) cachedToken = null;

  // 2. Within an active SSO session, reuse the Bearer we exchanged for it (keeps
  //    a portal session consistent and independent of any static token).
  if (!force && ssoToken && ssoToken === lastSso && cachedToken) return cachedToken;

  // 3. Static env token (IOSENSE_TOKEN) — the source of truth for direct,
  //    non-portal opens.
  if (STATIC_TOKEN) return STATIC_TOKEN;

  // 4. Any previously-exchanged Bearer (memory, then disk).
  if (!cachedToken) cachedToken = loadPersistedToken();
  if (cachedToken) return cachedToken;

  throw new Error(
    "No IOsense token. Open the dashboard via the IOsense portal (…?ssoToken=…) or set IOSENSE_TOKEN.",
  );
}

// Called after a data request succeeds, so we only persist tokens that work.
function markTokenGood(token: string): void {
  if (token && token !== STATIC_TOKEN) persistToken(token);
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
  // Production divisors (…_PRODUCTION_A1) are SUMMED over the window. They post
  // ~1 point/day, so the normal downsample already keeps every point (24h apart
  // never merge into one bucket) — but we cap their bucket at 1h so denser
  // production streams aren't dropped, without the huge cost of full resolution.
  const isProduction = (devID: string) => /_PRODUCTION_A1$/i.test(devID);
  const devConfig: DevCfg[] = pairs.map((p) => ({
    sTime,
    eTime,
    devID: p.devID,
    sensor: p.sensor,
    downscale: isProduction(p.devID) ? Math.min(downscale, 3600) : downscale,
  }));
  const CHUNK = 20;
  const keyOf = (d: { devID: string; sensor: string }) => `${d.devID}:${d.sensor}`;
  const hasPoints = (p?: SensorPoint) =>
    !!p?.data && Object.keys(p.data).length > 0;

  // Fetch a list of DevCfgs split into chunks of `size`, tolerating per-chunk
  // failures (a failed/timed-out chunk contributes nothing rather than rejecting
  // the whole batch).
  async function fetchInChunks(cfgs: DevCfg[], size: number, token: string) {
    const chunks: DevCfg[][] = [];
    for (let i = 0; i < cfgs.length; i += size) chunks.push(cfgs.slice(i, i + size));
    const out: SensorPoint[] = [];
    let auth401 = false;
    const settled = await Promise.allSettled(chunks.map((c) => putChunk(c, token)));
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(...r.value);
      else if ((r.reason as { code?: number })?.code === 401) auth401 = true;
    }
    return { out, auth401 };
  }

  // The IOsense query endpoint intermittently returns an EMPTY or PARTIAL payload
  // for a chunk (server-side timeout under load) with an HTTP 200 — silently
  // dropping whole sensors. Left unhandled this corrupts every multi-sensor card
  // (e.g. a chiller IkW/TR computed from only the sensors that happened to
  // survive → wrong value). So after the first pass we find pairs that came back
  // with no series and retry them in progressively smaller chunks; small/single
  // fetches are reliable, so a couple of rounds recovers the dropped sensors.
  async function run(token: string) {
    const got = new Map<string, SensorPoint>();
    const absorb = (pts: SensorPoint[]) => {
      for (const p of pts) {
        const k = keyOf(p);
        if (!got.has(k) || (!hasPoints(got.get(k)) && hasPoints(p))) got.set(k, p);
      }
    };
    const first = await fetchInChunks(devConfig, CHUNK, token);
    absorb(first.out);
    let auth401 = first.auth401;

    // Retry only the pairs that returned no series, shrinking the chunk each round.
    for (const size of [8, 3]) {
      const missing = devConfig.filter((d) => !got.has(keyOf(d)));
      if (missing.length === 0) break;
      const r = await fetchInChunks(missing, size, token);
      absorb(r.out);
      if (r.auth401) auth401 = true;
    }
    return { out: [...got.values()], auth401 };
  }

  let token = await getToken(ssoToken);
  let { out, auth401 } = await run(token);
  if (auth401 && out.length === 0) {
    token = await getToken(ssoToken, true); // token expired → refresh once
    ({ out, auth401 } = await run(token));
  }
  // Persist the token only once it has actually returned data (never junk).
  if (!auth401) markTokenGood(token);
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
