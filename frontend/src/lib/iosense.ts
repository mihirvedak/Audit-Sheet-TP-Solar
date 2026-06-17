// IOsense data client (browser-side) + SEC computation.
//
// Calls the real IOsense data API at connector.iosense.io. Auth = the token
// (sent as the `Authorization` header) + the `organisation` header. The token
// is read from localStorage (SDK convention) or NEXT_PUBLIC_IOSENSE_TOKEN.
//
// Consumption logic (matches the proven IOsense SDK):
//   - energy/consumption sensor → cumulative meter → (last − first) over window
//   - production divisor         → sum of all readings over the window
//   - SEC = Σ(consumption) / production

import type { CardItem } from "./dashboardData";

export interface SensorPoint {
  devID: string;
  sensor: string;
  data: Record<string, number>;
}

const key = (devID: string, sensor: string) => `${devID}:${sensor}`;

// SSO token the portal appends to the dashboard URL (?token / ?ssoToken /
// ?loginToken). Passed to the server, which exchanges it for a Bearer token.
function readSsoToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const p = new URLSearchParams(window.location.search);
  const t = p.get("ssoToken") || p.get("token") || p.get("loginToken");
  return t ? t.trim() : undefined;
}

/** Latest data point per sensor (window-independent), keyed by "devID:sensor". */
export type LastDPMap = Map<string, { ts: string; val: number }>;

export interface FetchResult {
  map: Map<string, SensorPoint>;
  lastDPs: LastDPMap;
  errors: string[];
}

/**
 * Fetch sensor series for many device/sensor pairs over a window — via our own
 * server route (/api/iosense). Auth (login + Bearer token) happens server-side,
 * so the browser sends no token and makes no cross-origin call.
 */
export async function fetchSensors(
  pairs: { devID: string; sensor: string }[],
  sTime: number,
  eTime: number,
  onProgress?: (map: Map<string, SensorPoint>) => void,
): Promise<FetchResult> {
  const out = new Map<string, SensorPoint>();
  const lastDPs: LastDPMap = new Map();
  const errors: string[] = [];
  try {
    const res = await fetch("/api/iosense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs, sTime, eTime, ssoToken: readSsoToken() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      errors.push(json?.error || `proxy error ${res.status}`);
    } else {
      for (const p of (json?.data ?? []) as SensorPoint[]) {
        out.set(key(p.devID, p.sensor), p);
      }
      for (const d of (json?.lastDPs ?? []) as Array<{
        devID: string;
        sensor: string;
        time: string;
        value: number;
      }>) {
        lastDPs.set(key(d.devID, d.sensor), { ts: d.time, val: d.value });
      }
      onProgress?.(out);
    }
  } catch (e) {
    errors.push(String((e as Error)?.message ?? e));
  }
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.error("[IOsense] fetch errors:", errors);
  }
  return { map: out, lastDPs, errors };
}

// Cumulative meter consumption over the window = last − first.
function cumulativeDelta(p?: SensorPoint): number {
  if (!p?.data) return 0;
  const ks = Object.keys(p.data).sort();
  if (ks.length === 0) return 0;
  const d = p.data[ks[ks.length - 1]] - p.data[ks[0]];
  return d > 0 ? d : 0;
}

// Production over the window = sum of all readings.
function sumValues(p?: SensorPoint): number {
  if (!p?.data) return 0;
  return Object.values(p.data).reduce((a, b) => a + (Number(b) || 0), 0);
}

// Latest (most recent) reading in the window — used by live cards.
function latestValue(p?: SensorPoint): number | null {
  if (!p?.data) return null;
  const ks = Object.keys(p.data).sort();
  if (ks.length === 0) return null;
  return p.data[ks[ks.length - 1]];
}

/** Unique device/sensor pairs needed by a card's config (consumption or live). */
export function pairsForCard(card: CardItem): { devID: string; sensor: string }[] {
  const cfg = card.config;
  if (cfg) {
    const pairs = cfg.numerator.map((t) => ({ devID: t.device, sensor: t.sensor }));
    if (cfg.divisor) pairs.push({ devID: cfg.divisor.device, sensor: cfg.divisor.sensor });
    if (cfg.denominator)
      for (const t of cfg.denominator) pairs.push({ devID: t.device, sensor: t.sensor });
    return pairs;
  }
  if (card.liveConfig) {
    return card.liveConfig.sensors.map((s) => ({ devID: s.device, sensor: s.sensor }));
  }
  return [];
}

/** Compute a live card's value: latest reading, average, (avg/6.5)×100, or constant. */
export function computeLiveValue(
  card: CardItem,
  map: Map<string, SensorPoint>,
): string {
  const cfg = card.liveConfig;
  if (!cfg) return "NA";
  if (cfg.op === "constant") return String(cfg.constant ?? "NA");
  const vals = cfg.sensors
    .map((s) => latestValue(map.get(key(s.device, s.sensor))))
    .filter((v): v is number => v != null);
  if (vals.length === 0) return "NA";
  const round2 = (n: number) => (Math.round(n * 100) / 100).toString();
  if (cfg.op === "latest") return round2(vals[0]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (cfg.op === "average") return round2(avg);
  if (cfg.op === "scalePct") return round2((avg / 6.5) * 100);
  return "NA";
}

/** Per-sensor detail for the info tooltip. */
export interface SensorBreakdown {
  device: string;
  sensor: string;
  role: "numerator" | "divisor" | "denominator";
  firstTs: string | null;
  firstVal: number | null;
  lastTs: string | null;
  lastVal: number | null;
  consumption: number; // last−first, except divisor (production) = sum
  hasData: boolean;
}

function detail(
  device: string,
  sensor: string,
  role: "numerator" | "divisor" | "denominator",
  map: Map<string, SensorPoint>,
  lastMap?: LastDPMap,
): SensorBreakdown {
  const p = map.get(key(device, sensor));
  const ks = p?.data ? Object.keys(p.data).sort() : [];
  if (p?.data && ks.length > 0) {
    const firstTs = ks[0];
    const lastTs = ks[ks.length - 1];
    const firstVal = p.data[firstTs];
    const lastVal = p.data[lastTs];
    // Production divisor is summed; everything else is a cumulative delta.
    const consumption =
      role === "divisor" ? sumValues(p) : Math.max(0, lastVal - firstVal);
    return { device, sensor, role, firstTs, firstVal, lastTs, lastVal, consumption, hasData: true };
  }
  // Window has no data → fall back to the sensor's latest available reading
  // (so the tooltip still shows the last DP and its timestamp).
  const last = lastMap?.get(key(device, sensor));
  if (last) {
    return {
      device, sensor, role,
      firstTs: last.ts, firstVal: last.val,
      lastTs: last.ts, lastVal: last.val,
      consumption: 0, hasData: true,
    };
  }
  return {
    device, sensor, role,
    firstTs: null, firstVal: null, lastTs: null, lastVal: null,
    consumption: 0, hasData: false,
  };
}

/** Per-sensor breakdown (first DP, last DP, consumption) for a card's config. */
export function breakdownForCard(
  card: CardItem,
  map: Map<string, SensorPoint>,
  lastMap?: LastDPMap,
): SensorBreakdown[] {
  const cfg = card.config;
  if (cfg) {
    const rows = cfg.numerator.map((t) =>
      detail(t.device, t.sensor, "numerator", map, lastMap),
    );
    if (cfg.divisor)
      rows.push(detail(cfg.divisor.device, cfg.divisor.sensor, "divisor", map, lastMap));
    if (cfg.denominator)
      for (const t of cfg.denominator)
        rows.push(detail(t.device, t.sensor, "denominator", map, lastMap));
    return rows;
  }
  if (card.liveConfig) {
    // Live cards: show each sensor's latest reading (the "Last" column).
    return card.liveConfig.sensors.map((s) =>
      detail(s.device, s.sensor, "numerator", map, lastMap),
    );
  }
  return [];
}

// Sum cumulative-delta consumption across a list of terms.
function sumDelta(
  list: { device: string; sensor: string }[],
  map: Map<string, SensorPoint>,
): { total: number; any: boolean } {
  let total = 0;
  let any = false;
  for (const t of list) {
    const p = map.get(key(t.device, t.sensor));
    if (p) any = true;
    total += cumulativeDelta(p);
  }
  return { total, any };
}

/**
 * Compute a configured consumption card's value:
 *  - divisor present     → Σ(numerator delta) / production SUM   (SEC, kWh/kWp)
 *  - denominator present → Σ(numerator delta) / Σ(denominator delta)  (ratio)
 *  - neither             → Σ(numerator delta)                    (plain total)
 */
export function computeCardValue(
  card: CardItem,
  map: Map<string, SensorPoint>,
): string {
  const cfg = card.config;
  if (!cfg) return "NA";

  const { total: num, any } = sumDelta(cfg.numerator, map);
  if (!any) return "NA";

  if (cfg.divisor) {
    const prod = sumValues(map.get(key(cfg.divisor.device, cfg.divisor.sensor)));
    if (prod <= 0) return "NA";
    return (num / prod).toFixed(2);
  }
  if (cfg.denominator && cfg.denominator.length > 0) {
    const { total: den } = sumDelta(cfg.denominator, map);
    if (den <= 0) return "NA";
    return (num / den).toFixed(2);
  }
  return num.toFixed(2);
}
