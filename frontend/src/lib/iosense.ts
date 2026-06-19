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
import type { ChillerTerm } from "./cardConfigs";

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

// The IOsense API slows down super-linearly with concurrent load, so we split
// the pairs into batches and run only a few at a time. Each batch returns sooner
// than one giant call, and its cards render the moment it lands. BATCH_SIZE ×
// MAX_CONCURRENT is kept near the API's fast regime (~120–150 pairs per wave).
const BATCH_SIZE = 45;
const MAX_CONCURRENT = 3;

/**
 * Fetch sensor series for many device/sensor pairs over a window — via our own
 * server route (/api/iosense). Auth (login + Bearer token) happens server-side,
 * so the browser sends no token and makes no cross-origin call.
 *
 * The pairs are split into parallel batches; `onProgress` fires after EACH batch
 * lands so the dashboard fills in incrementally rather than waiting for the
 * slowest sensor. The returned result is the union of all batches.
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
  const ssoToken = readSsoToken();

  const batches: { devID: string; sensor: string }[][] = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    batches.push(pairs.slice(i, i + BATCH_SIZE));
  }

  const runBatch = async (batch: { devID: string; sensor: string }[]) => {
    try {
      const res = await fetch("/api/iosense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: batch, sTime, eTime, ssoToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push(json?.error || `proxy error ${res.status}`);
        return;
      }
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
      // Incremental: cards whose sensors are now all present render right away.
      onProgress?.(out);
    } catch (e) {
      errors.push(String((e as Error)?.message ?? e));
    }
  };

  // Concurrency-limited pool: workers pull the next batch until the queue drains.
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const idx = next++;
      await runBatch(batches[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, worker),
  );

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

/* ----------------------- Chiller TR (formula cards) ---------------------- */

interface Sample {
  t: number;
  v: number;
}
// Time-stamped samples of a sensor over the window, sorted ascending.
function samples(p?: SensorPoint): Sample[] {
  if (!p?.data) return [];
  const arr: Sample[] = [];
  for (const [k, v] of Object.entries(p.data)) {
    const t = Date.parse(k);
    if (!Number.isNaN(t)) arr.push({ t, v: Number(v) });
  }
  arr.sort((a, b) => a.t - b.t);
  return arr;
}
const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

// Cumulative-meter reading held AT time `b` = value of the last sample at or
// before b (a meter holds its value between logs); if none, the first sample.
// This is what gives the EXACT 06:00 boundary reading even when the nearest
// logged point is a little before/after the boundary.
function readingAt(s: Sample[], b: number): number | null {
  if (s.length === 0) return null;
  let val: number | null = null;
  for (const x of s) {
    if (x.t <= b) val = x.v;
    else break;
  }
  return val != null ? val : s[0].v;
}
// Consumption over [sTime, eTime] = reading(eTime) − reading(sTime), clamped ≥ 0.
// Anchored to the exact window boundaries (06:00 → 06:00 / now).
function boundaryDelta(
  p: SensorPoint | undefined,
  sTime: number,
  eTime: number,
): number {
  const s = samples(p);
  const a = readingAt(s, sTime);
  const b = readingAt(s, eTime);
  if (a == null || b == null) return 0;
  return Math.max(0, b - a);
}
// Mean of samples whose timestamp falls in [a, b).
function avgInRange(s: Sample[], a: number, b: number): number | null {
  return mean(s.filter((x) => x.t >= a && x.t < b).map((x) => x.v));
}
// Time-weighted hours where status == 1 (running) within [bStart, bEnd). Each
// sample's value holds until the next sample (the last extends to seriesEnd).
function runningHours(
  s: Sample[],
  bStart: number,
  bEnd: number,
  seriesEnd: number,
): number {
  let ms = 0;
  for (let i = 0; i < s.length; i++) {
    const next = i + 1 < s.length ? s[i + 1].t : seriesEnd;
    const segStart = Math.max(s[i].t, bStart);
    const segEnd = Math.min(next, bEnd);
    if (segEnd > segStart && s[i].v >= 0.5) ms += segEnd - segStart;
  }
  return ms / 3_600_000;
}

export interface WindowCtx {
  startMs: number;
  endMs: number;
  period?: string;
}

// Bucket size (ms) for a periodicity label.
function bucketMsFor(period?: string): number {
  switch (period) {
    case "15 Minutes":
      return 15 * 60_000;
    case "30 Minutes":
      return 30 * 60_000;
    case "Hourly":
    case "Raw": // raw → hourly buckets for running-hours weighting
      return 60 * 60_000;
    case "Weekly":
      return 7 * 24 * 60 * 60_000;
    case "Monthly":
      return 30 * 24 * 60 * 60_000;
    case "Daily":
    default:
      return 24 * 60 * 60_000;
  }
}

/**
 * Running-hours-weighted TR for one chiller (matches the reference dashboard):
 *   instantaneous TR = trBase × (avg inlet − avg outlet) / deltaDiv
 *   bucketed:  TRH = Σ (bucketTR × bucketRunningHours);  TR = TRH / Σ runningHours
 *   fallback (no running hours): the whole-window instantaneous TR.
 * Temperatures are averaged per bucket, THEN subtracted (never per-sample ΔT).
 * Returns the displayed TR, the whole-window ΔT, and total running hours.
 */
function chillerTR(
  ch: ChillerTerm,
  map: Map<string, SensorPoint>,
  trBase: number,
  deltaDiv: number,
  ctx?: WindowCtx,
): { tr: number | null; dt: number | null; runningHours: number } {
  const inlet = samples(map.get(key(ch.supply.device, ch.supply.sensor)));
  const outlet = samples(map.get(key(ch.ret.device, ch.ret.sensor)));
  const status = ch.status
    ? samples(map.get(key(ch.status.device, ch.status.sensor)))
    : [];

  const wIn = mean(inlet.map((x) => x.v));
  const wOut = mean(outlet.map((x) => x.v));
  const dt = wIn != null && wOut != null ? wIn - wOut : null;
  const instTR = dt != null ? (trBase * dt) / deltaDiv : null;

  // No window context or no status series → plain instantaneous TR.
  if (!ctx || status.length === 0) return { tr: instTR, dt, runningHours: 0 };

  // Bucket the window; weight each bucket's TR by its running hours.
  let bucketMs = bucketMsFor(ctx.period);
  const span = Math.max(1, ctx.endMs - ctx.startMs);
  if (span / bucketMs > 5000) bucketMs = span / 5000; // cap bucket count
  let trh = 0;
  let rhTotal = 0;
  for (let bStart = ctx.startMs; bStart < ctx.endMs; bStart += bucketMs) {
    const bEnd = Math.min(bStart + bucketMs, ctx.endMs);
    const rh = runningHours(status, bStart, bEnd, ctx.endMs);
    rhTotal += rh;
    if (rh <= 0) continue;
    const aIn = avgInRange(inlet, bStart, bEnd);
    const aOut = avgInRange(outlet, bStart, bEnd);
    if (aIn == null || aOut == null) continue;
    trh += ((trBase * (aIn - aOut)) / deltaDiv) * rh;
  }
  if (rhTotal > 0) return { tr: trh / rhTotal, dt, runningHours: rhTotal };
  return { tr: instTR, dt, runningHours: 0 }; // fallback
}

// Latest timestamp in the window (for the card footer).
function lastTsOf(p?: SensorPoint): string | null {
  if (!p?.data) return null;
  const ks = Object.keys(p.data).sort();
  return ks.length ? ks[ks.length - 1] : null;
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
  if (card.formula) {
    const out: { devID: string; sensor: string }[] = [];
    for (const ch of card.formula.chillers) {
      out.push({ devID: ch.power.device, sensor: ch.power.sensor });
      out.push({ devID: ch.supply.device, sensor: ch.supply.sensor });
      out.push({ devID: ch.ret.device, sensor: ch.ret.sensor });
      if (ch.status) out.push({ devID: ch.status.device, sensor: ch.status.sensor });
    }
    return out;
  }
  return [];
}

/** Compute a formula (chiller-sum) card: Σ (consumption ÷ TR) over the chillers,
 *  where TR is the running-hours-weighted tons of refrigeration per chiller. */
export function computeFormulaValue(
  card: CardItem,
  map: Map<string, SensorPoint>,
  ctx?: WindowCtx,
): string {
  const f = card.formula;
  if (!f) return "NA";
  let total = 0;
  let any = false;
  for (const ch of f.chillers) {
    const pp = map.get(key(ch.power.device, ch.power.sensor));
    if (!pp) continue;
    const { tr } = chillerTR(ch, map, f.powerDiv, f.deltaDiv, ctx);
    if (tr == null || tr === 0) continue; // no temps / ΔT = 0 → undefined; skip
    const cons = ctx ? boundaryDelta(pp, ctx.startMs, ctx.endMs) : cumulativeDelta(pp);
    total += cons / tr; // consumption ÷ TR
    any = true;
  }
  if (!any) return "NA";
  return (Math.round(total * 100) / 100).toString();
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
  ctx?: WindowCtx,
): SensorBreakdown {
  const p = map.get(key(device, sensor));
  const ks = p?.data ? Object.keys(p.data).sort() : [];
  if (p?.data && ks.length > 0) {
    // Cumulative meters (numerator/denominator) are anchored to the EXACT window
    // boundaries (06:00 → 06:00 / now): first = reading held at start, last =
    // reading held at end, with timestamps snapped to those boundaries.
    if (role !== "divisor" && ctx) {
      const s = samples(p);
      const firstVal = readingAt(s, ctx.startMs);
      const lastVal = readingAt(s, ctx.endMs);
      const consumption =
        firstVal != null && lastVal != null ? Math.max(0, lastVal - firstVal) : 0;
      return {
        device, sensor, role,
        firstTs: new Date(ctx.startMs).toISOString(), firstVal,
        lastTs: new Date(ctx.endMs).toISOString(), lastVal,
        consumption, hasData: true,
      };
    }
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
  ctx?: WindowCtx,
): SensorBreakdown[] {
  const cfg = card.config;
  if (cfg) {
    const rows = cfg.numerator.map((t) =>
      detail(t.device, t.sensor, "numerator", map, lastMap, ctx),
    );
    if (cfg.divisor)
      rows.push(detail(cfg.divisor.device, cfg.divisor.sensor, "divisor", map, lastMap, ctx));
    if (cfg.denominator)
      for (const t of cfg.denominator)
        rows.push(detail(t.device, t.sensor, "denominator", map, lastMap, ctx));
    return rows;
  }
  if (card.liveConfig) {
    // Live cards: show each sensor's latest reading (the "Last" column).
    return card.liveConfig.sensors.map((s) =>
      detail(s.device, s.sensor, "numerator", map, lastMap),
    );
  }
  if (card.formula) {
    // Formula cards: one row per chiller — consumption, TR, and the contribution.
    const f = card.formula;
    return f.chillers.map((ch, i) => {
      const pp = map.get(key(ch.power.device, ch.power.sensor));
      const cons = pp
        ? ctx
          ? boundaryDelta(pp, ctx.startMs, ctx.endMs)
          : cumulativeDelta(pp)
        : null;
      const { tr } = chillerTR(ch, map, f.powerDiv, f.deltaDiv, ctx);
      const has = !!pp && tr != null;
      const contribution = has && tr ? cons! / tr : 0;
      return {
        device: `Chiller ${i + 1}`,
        sensor: `${ch.power.device}·${ch.power.sensor}`,
        role: "numerator" as const,
        firstTs: null,
        firstVal: cons, // consumption (last − first)
        lastTs: lastTsOf(pp),
        lastVal: tr, // TR (running-hours-weighted tons of refrigeration)
        consumption: contribution,
        hasData: has,
      };
    });
  }
  return [];
}

// Sum 06:00-anchored consumption across a list of terms. With a window context
// each term = reading(end) − reading(start) (exact 06:00 boundaries); without
// one it falls back to the plain first/last delta.
function sumDelta(
  list: { device: string; sensor: string }[],
  map: Map<string, SensorPoint>,
  ctx?: WindowCtx,
): { total: number; any: boolean } {
  let total = 0;
  let any = false;
  for (const t of list) {
    const p = map.get(key(t.device, t.sensor));
    if (p) any = true;
    total += ctx ? boundaryDelta(p, ctx.startMs, ctx.endMs) : cumulativeDelta(p);
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
  ctx?: WindowCtx,
): string {
  const cfg = card.config;
  if (!cfg) return "NA";

  const { total: num, any } = sumDelta(cfg.numerator, map, ctx);
  if (!any) return "NA";

  if (cfg.divisor) {
    const prod = sumValues(map.get(key(cfg.divisor.device, cfg.divisor.sensor)));
    if (prod <= 0) return "NA";
    return (num / prod).toFixed(2);
  }
  if (cfg.denominator && cfg.denominator.length > 0) {
    const { total: den } = sumDelta(cfg.denominator, map, ctx);
    if (den <= 0) return "NA";
    return (num / den).toFixed(2);
  }
  return num.toFixed(2);
}
