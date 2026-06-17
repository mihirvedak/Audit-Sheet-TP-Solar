"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type CardItem, type Category } from "@/lib/dashboardData";
import {
  breakdownForCard,
  computeCardValue,
  computeLiveValue,
  fetchSensors,
  pairsForCard,
  type SensorBreakdown,
  type SensorPoint,
} from "@/lib/iosense";
import MetricCard from "./MetricCard";
import TimeRangePicker, {
  computeRange,
  type TimeRange,
} from "./TimeRangePicker";

export default function DashboardClient({ cards }: { cards: CardItem[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Category>("consumption");
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    let consumption = 0;
    for (const c of cards) if (c.category === "consumption") consumption++;
    return { consumption, live: cards.length - consumption };
  }, [cards]);

  // Cards shown for the active tab.
  const tabCards = useMemo(
    () => cards.filter((c) => c.category === tab),
    [cards, tab],
  );

  // Anchor for the duration picker. Computed synchronously (in the useState
  // initializer) so it exists during SSR — the picker is therefore part of the
  // server-rendered HTML and shows immediately, even before hydration. The
  // trigger only displays day-level dates, which match between server & client.
  const [anchor] = useState(() => new Date());
  const [range, setRange] = useState<TimeRange>(() => {
    const r = computeRange("Current Month", anchor)!;
    return { ...r, periodicity: "Daily", presetLabel: "Current Month" };
  });

  // Search highlights in place within the active tab — matches get a ring.
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      tabCards
        .filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            `#${c.row}`.includes(q) ||
            (c.unit ?? "").toLowerCase().includes(q),
        )
        .map((c) => c.id),
    );
  }, [tabCards, query]);

  const searching = query.trim() !== "";

  // Live IOsense values per card id, fetched over the selected Duration window.
  const [liveValues, setLiveValues] = useState<Map<string, string>>(new Map());
  const [breakdowns, setBreakdowns] = useState<Map<string, SensorBreakdown[]>>(
    new Map(),
  );
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const configured = cards.filter((c) => c.config || c.liveConfig);
    if (configured.length === 0) return;

    // Compute a card's value from the fetched map (consumption vs. live).
    const valueOf = (c: CardItem, map: Map<string, SensorPoint>) =>
      c.config ? computeCardValue(c, map) : computeLiveValue(c, map);

    let cancelled = false;
    const sTime = range.start.getTime();
    const eTime = range.end.getTime();

    // Unique device/sensor pairs across all configured cards (one batched call).
    const seen = new Set<string>();
    const pairs: { devID: string; sensor: string }[] = [];
    for (const c of configured) {
      for (const p of pairsForCard(c)) {
        const k = `${p.devID}:${p.sensor}`;
        if (!seen.has(k)) {
          seen.add(k);
          pairs.push(p);
        }
      }
    }

    // Fresh window → clear values so resolved cards repopulate (others show "…").
    setLiveValues(new Map());
    setBreakdowns(new Map());
    setErrorMsg("");
    setFetchState("loading");

    // A card is renderable once all its sensors are in the map.
    const complete = (c: CardItem, map: Map<string, SensorPoint>) =>
      pairsForCard(c).every((p) => map.has(`${p.devID}:${p.sensor}`));

    // Incremental render: as each batch lands, show the cards now complete.
    const render = (map: Map<string, SensorPoint>) => {
      if (cancelled) return;
      const nv = new Map<string, string>();
      const nb = new Map<string, SensorBreakdown[]>();
      for (const c of configured) {
        if (complete(c, map)) {
          nv.set(c.id, valueOf(c, map));
          nb.set(c.id, breakdownForCard(c, map));
        }
      }
      setLiveValues(nv);
      setBreakdowns(nb);
    };

    fetchSensors(pairs, sTime, eTime, render).then(({ map, lastDPs, errors }) => {
      if (cancelled) return;
      // Finalize: compute every card (missing sensors count as 0). The lastDPs
      // fallback fills first/last DP + timestamp when the window has no data.
      const nv = new Map<string, string>();
      const nb = new Map<string, SensorBreakdown[]>();
      let gotAny = false;
      for (const c of configured) {
        const val = valueOf(c, map);
        // Only sensor-backed cards count as "real data" (constants always resolve).
        if (val !== "NA" && pairsForCard(c).length > 0) gotAny = true;
        nv.set(c.id, val);
        nb.set(c.id, breakdownForCard(c, map, lastDPs));
      }
      setLiveValues(nv);
      setBreakdowns(nb);
      // Auth/connection succeeded if we got any windowed value OR any latest DP
      // (empty window with valid latest data is "no data for this window", not
      // an error). Only a total fetch failure → error badge.
      if (gotAny || lastDPs.size > 0) {
        setFetchState("idle");
      } else {
        setErrorMsg(errors[0] || "no data returned");
        setFetchState("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cards, range]);

  // Value shown on a card: each card pops in as its own fetch resolves. A card
  // not yet resolved shows "…" while loading, else NA.
  function valueFor(card: CardItem): string {
    if (!card.config && !card.liveConfig) return "NA";
    const v = liveValues.get(card.id);
    if (v !== undefined) return v;
    return fetchState === "loading" ? "…" : "NA";
  }

  // Most recent timestamp across all of a card's sensors (the latest device
  // data received), used for the card's "last received" footer.
  function lastTsFor(card: CardItem): string | null {
    const bd = breakdowns.get(card.id);
    if (!bd) return null;
    let max: string | null = null;
    for (const r of bd) {
      if (r.lastTs && (max === null || r.lastTs > max)) max = r.lastTs;
    }
    return max;
  }

  // Jump to the first matching card whenever the query or tab changes.
  useEffect(() => {
    if (!searching || matchIds.size === 0) return;
    const first = tabCards.find((c) => matchIds.has(c.id));
    if (first) {
      document
        .getElementById(first.id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [query, searching, matchIds, tabCards]);

  return (
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header + controls */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Audit Sheet — TP Solar
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Utilities &amp; process monitoring dashboard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                {searching
                  ? `${matchIds.size} match${matchIds.size === 1 ? "" : "es"}`
                  : `${tabCards.length} cards`}
              </span>
              {fetchState === "error" ? (
                <span
                  className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                  title={errorMsg}
                >
                  Data error{errorMsg ? `: ${errorMsg}` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {fetchState === "loading" ? "Fetching…" : "Live · IOsense"}
                </span>
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[220px] flex-1">
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                aria-label="Search"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards… (name, unit, #row)"
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-8 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-indigo-500/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Global duration picker — always rendered (present in SSR HTML) */}
            <TimeRangePicker value={range} now={anchor} onApply={setRange} />
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {(
              [
                { id: "consumption", label: "Consumption", n: counts.consumption },
                { id: "live", label: "Live Data", n: counts.live },
              ] as { id: Category; label: string; n: number }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    tab === t.id
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {t.n}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* All cards stay visible, in the exact order of the source sheet.
          Searching highlights matches (and dims the rest). */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {searching && matchIds.size === 0 && (
          <div className="mb-4 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-3 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
            No cards match <span className="font-semibold">“{query}”</span>.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tabCards.map((c) => (
            <MetricCard
              key={c.id}
              card={c}
              value={valueFor(c)}
              breakdown={breakdowns.get(c.id)}
              lastTs={lastTsFor(c)}
              query={query}
              matched={matchIds.has(c.id)}
              dimmed={searching && !matchIds.has(c.id)}
            />
          ))}
        </div>

        <footer className="mt-8 border-t border-zinc-200 pt-6 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
          Each card shows the last timestamp its data arrived. The Duration
          picker selects the global viewing window. Values and timestamps are
          placeholders; real readings will be wired to the IOsense SDK — tracked
          in <code className="font-mono">iosense.md</code>.
        </footer>
      </main>
    </div>
  );
}
