"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CardItem } from "@/lib/dashboardData";
import type { SensorBreakdown } from "@/lib/iosense";

// Wrap every case-insensitive occurrence of `query` in the label with a <mark>.
function highlightLabel(label: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return label;
  const lower = label.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i <= label.length) {
    const found = lower.indexOf(needle, i);
    if (found === -1) {
      parts.push(label.slice(i));
      break;
    }
    if (found > i) parts.push(label.slice(i, found));
    parts.push(
      <mark
        key={n++}
        className="rounded bg-yellow-200 px-0.5 text-zinc-900 dark:bg-yellow-400/40 dark:text-yellow-50"
      >
        {label.slice(found, found + needle.length)}
      </mark>,
    );
    i = found + needle.length;
  }
  return parts;
}

const fmtNum = (v: number | null): string =>
  v == null ? "—" : (Math.round(v * 100) / 100).toLocaleString("en-US");

const fmtTs = (s: string | null): string =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // 24-hour clock
      })
    : "";

// Human-readable "how this value was calculated" line from the sensor rows.
function calcSummary(card: CardItem, rows: SensorBreakdown[], value: string): string {
  const u = card.unit ? ` ${card.unit}` : "";
  if (card.formula?.kind === "cdaSec") {
    const num = rows.filter((r) => r.role === "numerator").reduce((a, r) => a + r.consumption, 0);
    const den = rows.filter((r) => r.role === "denominator").reduce((a, r) => a + r.consumption, 0);
    return `Σ consumption (${fmtNum(num)} kWh) ÷ air volume (${fmtNum(den)} m³) = ${value}${u}`;
  }
  if (card.formula?.kind === "chillerSum") {
    return `Σ of ${rows.length} chillers — consumption ÷ TR, where TR = ${card.formula.powerDiv} × ΔT ÷ ${card.formula.deltaDiv} (running-hours weighted) = ${value}${u}`;
  }
  const live = card.liveConfig;
  if (live) {
    if (live.op === "constant") return `Fixed value = ${value}${u}`;
    if (live.op === "latest") return `Latest reading = ${value}${u}`;
    if (live.op === "average")
      return `Average of ${rows.length} sensor${rows.length === 1 ? "" : "s"} (last values) = ${value}${u}`;
    if (live.op === "scalePct")
      return `(average of last values ÷ 6.5) × 100 = ${value}${u}`;
  }
  // Consumption cards: Σ numerator ÷ production / denominator, or plain Σ.
  const sum = (role: SensorBreakdown["role"]) =>
    rows.filter((r) => r.role === role).reduce((a, r) => a + r.consumption, 0);
  const num = sum("numerator");
  const subtract = sum("subtract");
  const div = rows.find((r) => r.role === "divisor");
  const denomRows = rows.filter((r) => r.role === "denominator");
  if (div)
    return `Σ consumption (${fmtNum(num)}) ÷ production (${fmtNum(div.consumption)}) = ${value}${u}`;
  if (denomRows.length)
    return `numerator (${fmtNum(num)}) ÷ denominator (${fmtNum(sum("denominator"))}) = ${value}${u}`;
  if (subtract)
    return `consumption (${fmtNum(num)}) − (${fmtNum(subtract)}) = ${value}${u}`;
  return `Σ consumption (${fmtNum(num)}) = ${value}${u}`;
}

/** ⓘ button + portal popover with the calculation + per-sensor first/last/consumption. */
function InfoButton({
  card,
  value,
  rows,
}: {
  card: CardItem;
  value: string;
  rows: SensorBreakdown[];
}) {
  const label = card.label;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Sensor details"
        title="Sensor details"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[11px] font-semibold leading-none text-zinc-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-xs shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                {label}
                <span className="ml-1 font-normal text-zinc-400">
                  · {rows.length} sensor{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
            <div className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-indigo-400 dark:text-indigo-400/70">
                How this is calculated
              </span>
              {calcSummary(card, rows, value)}
            </div>
            {card.formula?.kind === "cdaSec" ? (
              // CDA SEC: meter consumption (kWh) + flow AVERAGE over the window.
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
                    Consumption (kWh) — energy meters
                  </div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {rows
                        .filter((r) => r.role === "numerator")
                        .map((r, idx) => (
                          <tr key={`n${idx}`} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="py-1 pr-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                              {r.device}
                              <span className="text-zinc-400">·{r.sensor}</span>
                              {!r.hasData && <span className="ml-1 text-[10px] text-rose-500">no data</span>}
                            </td>
                            <td className="py-1 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {fmtNum(r.consumption)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">
                    Flow — average over duration
                  </div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {rows
                        .filter((r) => r.role === "denominator")
                        .map((r, idx) => (
                          <tr key={`f${idx}`} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="py-1 pr-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                              {r.device}
                              <span className="text-zinc-400">·{r.sensor}</span>
                            </td>
                            <td className="py-1 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                              {fmtNum(r.firstVal)} <span className="text-[10px] text-zinc-400">avg</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[10px] text-zinc-400">
                    Running hours (gate &gt; 1):{" "}
                    <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                      {fmtNum(rows.find((r) => r.role === "denominator")?.lastVal ?? null)}
                    </span>
                  </div>
                </div>
              </div>
            ) : card.formula?.kind === "chillerSum" ? (
              // Formula (chiller) cards: per-chiller avg power, ΔT, contribution.
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="py-1 pr-2 font-medium">Chiller</th>
                    <th className="py-1 px-1 text-right font-medium">Consumption</th>
                    <th className="py-1 px-1 text-right font-medium">TR</th>
                    <th className="py-1 pl-1 text-right font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={`${r.device}:${r.sensor}:${idx}`}
                      className="border-t border-zinc-100 align-top dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2">
                        <span className="text-zinc-700 dark:text-zinc-300">{r.device}</span>
                        <div className="font-mono text-[10px] text-zinc-400">{r.sensor}</div>
                        {!r.hasData && (
                          <span className="text-[10px] text-rose-500">no data</span>
                        )}
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                        {fmtNum(r.firstVal)}
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                        {fmtNum(r.lastVal)}
                      </td>
                      <td className="py-1 pl-1 text-right font-semibold tabular-nums text-indigo-600 dark:text-indigo-300">
                        {fmtNum(r.consumption)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : card.liveConfig ? (
              // Live cards: raw latest reading + its timestamp per sensor.
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="py-1 pr-2 font-medium">Device · Sensor</th>
                    <th className="py-1 px-1 text-right font-medium">Raw value</th>
                    <th className="py-1 pl-1 text-right font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={`${r.device}:${r.sensor}:${idx}`}
                      className="border-t border-zinc-100 align-top dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2">
                        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                          {r.device}
                          <span className="text-zinc-400">·{r.sensor}</span>
                        </span>
                        {!r.hasData && (
                          <span className="ml-1 text-[10px] text-rose-500">no data</span>
                        )}
                      </td>
                      <td className="py-1 px-1 text-right font-semibold tabular-nums text-indigo-600 dark:text-indigo-300">
                        {fmtNum(r.lastVal)}
                      </td>
                      <td className="py-1 pl-1 text-right tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
                        {fmtTs(r.lastTs) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="py-1 pr-2 font-medium">Device · Sensor</th>
                    <th className="py-1 px-1 text-right font-medium">First</th>
                    <th className="py-1 px-1 text-right font-medium">Last</th>
                    <th className="py-1 pl-1 text-right font-medium">Consumption</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Consumption meters only. The production divisor is summed
                      (not a delta), so it's shown separately below. */}
                  {rows.filter((r) => r.role !== "divisor").map((r, idx) => (
                    <tr
                      key={`${r.device}:${r.sensor}:${idx}`}
                      className="border-t border-zinc-100 align-top dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2">
                        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                          {r.device}
                          <span className="text-zinc-400">·{r.sensor}</span>
                        </span>
                        {r.role === "subtract" && (
                          <span className="ml-1 rounded bg-rose-100 px-1 text-[9px] uppercase text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                            − minus
                          </span>
                        )}
                        {!r.hasData && (
                          <span className="ml-1 text-[10px] text-rose-500">no data</span>
                        )}
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums">
                        <div className="text-zinc-800 dark:text-zinc-200">{fmtNum(r.firstVal)}</div>
                        <div className="text-[9px] text-zinc-400">{fmtTs(r.firstTs)}</div>
                      </td>
                      <td className="py-1 px-1 text-right tabular-nums">
                        <div className="text-zinc-800 dark:text-zinc-200">{fmtNum(r.lastVal)}</div>
                        <div className="text-[9px] text-zinc-400">{fmtTs(r.lastTs)}</div>
                      </td>
                      <td className="py-1 pl-1 text-right font-semibold tabular-nums text-indigo-600 dark:text-indigo-300">
                        {fmtNum(r.consumption)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(() => {
                const prod = rows.find((r) => r.role === "divisor");
                if (!prod) return null;
                return (
                  <div className="mt-2 flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/50">
                    <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                      {prod.device}
                      <span className="text-zinc-400">·{prod.sensor}</span>
                      <span className="ml-1 block text-[9px] uppercase tracking-wide text-zinc-400">
                        Production · sum of selected days
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                      {fmtNum(prod.consumption)}
                    </span>
                  </div>
                );
              })()}
              </>
            )}
            </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function relAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MetricCard({
  card,
  value,
  breakdown,
  lastTs = null,
  query = "",
  matched = false,
  dimmed = false,
}: {
  card: CardItem;
  /** Reading for the selected time window. */
  value: string;
  /** Per-sensor breakdown for the ⓘ tooltip (configured cards only). */
  breakdown?: SensorBreakdown[];
  /** ISO timestamp of the most recent reading across the card's sensors. */
  lastTs?: string | null;
  /** Active search query — matched text in the label is highlighted. */
  query?: string;
  /** True when this card matches the active search (gets a ring). */
  matched?: boolean;
  /** True when a search is active but this card does not match (dimmed). */
  dimmed?: boolean;
}) {
  const noData = !value || value === "—" || value === "NA" || value === "…";
  const lastSeen = lastTs
    ? { abs: fmtTs(lastTs), ago: relAgo(lastTs) }
    : null;
  return (
    <div
      id={card.id}
      className={`group flex scroll-mt-28 flex-col justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900/60 ${
        matched
          ? "border-indigo-400 ring-2 ring-indigo-400 dark:border-indigo-500 dark:ring-indigo-500/50"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="flex-1 text-sm font-medium leading-snug text-zinc-600 dark:text-zinc-300"
          title={card.label}
        >
          {highlightLabel(card.label, query)}
        </p>
        {breakdown && breakdown.length > 0 && (
          <InfoButton card={card} value={value} rows={breakdown} />
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={`text-2xl font-semibold tracking-tight tabular-nums ${
            noData
              ? "text-zinc-300 dark:text-zinc-600"
              : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {value || "—"}
        </span>
        {!noData && card.unit && (
          <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
            {card.unit}
          </span>
        )}
      </div>

      <div
        className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800"
        title={lastSeen ? `Last reading received: ${lastSeen.abs} (${lastSeen.ago})` : "Last reading received"}
      >
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {lastSeen?.abs ?? "—"}
        </span>
        {lastSeen && (
          <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
            {lastSeen.ago}
          </span>
        )}
      </div>
    </div>
  );
}
