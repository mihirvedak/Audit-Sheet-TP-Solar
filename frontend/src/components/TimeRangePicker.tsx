"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TimeRange {
  start: Date;
  end: Date;
  periodicity: string;
  presetLabel: string;
}

export const PRESET_LABELS = [
  "Custom",
  "Today",
  "Yesterday",
  "Current Week",
  "Previous Week",
  "Previous 7 Days",
  "Current Month",
  "Previous Month",
  "Previous 3 Months",
  "Previous 12 Months",
  "Current Year",
  "Previous Year",
] as const;

const PERIODICITY = [
  "Raw",
  "15 Minutes",
  "30 Minutes",
  "Hourly",
  "Daily",
  "Weekly",
  "Monthly",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

/* ---------------------------- date helpers ---------------------------- */

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

/* ---- 06:00→06:00 production-day cycle helpers (used by presets) ---- */
// The daily cycle runs 06:00 today → 06:00 next day. Readings before 06:00
// belong to the previous cycle-day.
const DAY_START_HOUR = 6;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
// 06:00 boundary of the cycle-day containing d.
const cycleDay = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() < s.getTime()) s.setDate(s.getDate() - 1);
  return s;
};
const cycleWeek = (d: Date) => {
  const c = cycleDay(d);
  return addDays(c, -c.getDay()); // back to Sunday 06:00
};
const cycleMonth = (d: Date) => {
  const c = cycleDay(d);
  return new Date(c.getFullYear(), c.getMonth(), 1, DAY_START_HOUR, 0, 0, 0);
};
const cycleYear = (d: Date) => {
  const c = cycleDay(d);
  return new Date(c.getFullYear(), 0, 1, DAY_START_HOUR, 0, 0, 0);
};

export function computeRange(
  label: string,
  now: Date,
): { start: Date; end: Date } | null {
  switch (label) {
    case "Today":
      return { start: cycleDay(now), end: now };
    case "Yesterday":
      // Previous full cycle: yesterday 06:00 → today 06:00.
      return { start: addDays(cycleDay(now), -1), end: cycleDay(now) };
    case "Current Week":
      return { start: cycleWeek(now), end: now };
    case "Previous Week": {
      const sw = cycleWeek(now);
      return { start: addDays(sw, -7), end: sw };
    }
    case "Previous 7 Days":
      return { start: addDays(cycleDay(now), -7), end: now };
    case "Current Month":
      return { start: cycleMonth(now), end: now };
    case "Previous Month": {
      const cur = cycleMonth(now);
      const prev = new Date(cur.getFullYear(), cur.getMonth() - 1, 1, DAY_START_HOUR, 0, 0, 0);
      return { start: prev, end: cur };
    }
    case "Previous 3 Months": {
      const s = addMonths(now, -3);
      return { start: cycleDay(s), end: now };
    }
    case "Previous 12 Months": {
      const s = addMonths(now, -12);
      return { start: cycleDay(s), end: now };
    }
    case "Current Year":
      return { start: cycleYear(now), end: now };
    case "Previous Year": {
      const cy = cycleYear(now);
      const py = new Date(cy.getFullYear() - 1, 0, 1, DAY_START_HOUR, 0, 0, 0);
      return { start: py, end: cy };
    }
    default:
      return null; // Custom
  }
}

/* --------------------------- format / parse --------------------------- */

const fmtDateInput = (d: Date) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const fmtRangeLabel = (d: Date) =>
  `${pad(d.getDate())} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

// 24-hour clock display, e.g. 14:44.
function fmt24(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateInput(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = +m[1];
  const mon = +m[2] - 1;
  const yr = +m[3];
  const d = new Date(yr, mon, day);
  if (d.getDate() !== day || d.getMonth() !== mon) return null;
  return d;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function buildCalendar(viewMonth: Date): Date[] {
  const first = startOfMonth(viewMonth);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

const INPUT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
  );
}

/* Clickable 12-hour time picker. Clicking the field (or its clock icons) opens
   a Hr / Min / AM-PM selector. The dropdown is portaled to <body> with fixed
   positioning so it's never clipped by the scrollable picker panel. */
function TimeField({
  value,
  onChange,
}: {
  value: Date;
  onChange: (hours24: number, minutes: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function reflow() {
      place();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow);
    };
  }, [open, place]);

  const h24 = value.getHours();
  const min = value.getMinutes();

  const apply = (nh24: number, nmin: number) => onChange(nh24, nmin);

  const cell = (active: boolean) =>
    `cursor-pointer rounded px-2 py-1 text-center text-sm transition ${
      active
        ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;
  const colHead =
    "mb-1 px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${INPUT_CLS} flex items-center justify-between`}
      >
        <span>{fmt24(value)}</span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="h-4 w-4 text-zinc-400" />
          <ClockIcon className="h-4 w-4 text-zinc-500" />
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            data-portal-dropdown
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[60] flex gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex flex-col">
              <span className={colHead}>Hr</span>
              <ul className="max-h-44 w-12 overflow-y-auto">
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <li key={h} className={cell(h === h24)} onClick={() => apply(h, min)}>
                    {pad(h)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col">
              <span className={colHead}>Min</span>
              <ul className="max-h-44 w-12 overflow-y-auto">
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <li key={m} className={cell(m === min)} onClick={() => apply(h24, m)}>
                    {pad(m)}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------ component ----------------------------- */

export default function TimeRangePicker({
  value,
  onApply,
}: {
  value: TimeRange;
  onApply: (r: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const placePanel = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(640, window.innerWidth * 0.92);
    // Drop below the trigger; keep it on-screen horizontally.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPanelPos({ top: r.bottom + 8, left });
  }, []);

  const [draftStart, setDraftStart] = useState<Date>(value.start);
  const [draftEnd, setDraftEnd] = useState<Date>(value.end);
  const [periodicity, setPeriodicity] = useState<string>(value.periodicity);
  const [preset, setPreset] = useState<string>(value.presetLabel);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(value.start));
  const [selectStep, setSelectStep] = useState<"start" | "end">("start");

  // Text mirrors of the date inputs (so typing isn't fought by re-renders).
  const [startDateText, setStartDateText] = useState("");
  const [endDateText, setEndDateText] = useState("");

  function syncTexts(s: Date, e: Date) {
    setStartDateText(fmtDateInput(s));
    setEndDateText(fmtDateInput(e));
  }

  // Initialise the draft from the committed value every time we open.
  useEffect(() => {
    if (!open) return;
    setDraftStart(value.start);
    setDraftEnd(value.end);
    setPeriodicity(value.periodicity);
    setPreset(value.presetLabel);
    setViewMonth(startOfMonth(value.start));
    setSelectStep("start");
    syncTexts(value.start, value.end);
  }, [open, value]);

  // Position the panel under the trigger, and close on outside click.
  useEffect(() => {
    if (!open) return;
    placePanel();
    function onDown(e: MouseEvent) {
      const target = e.target as Element;
      // Keep open for clicks on the trigger, the panel itself, or a nested
      // portaled time-picker dropdown (all live outside each other in <body>).
      if (target.closest?.("[data-portal-dropdown]")) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function reflow() {
      placePanel();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow);
    };
  }, [open, placePanel]);

  function choosePreset(label: string) {
    setPreset(label);
    if (label === "Custom") return;
    // Use the live current time (not the page-load anchor) so presets like
    // "Today" / "Current Week" end at the actual current clock time, e.g. 14:44.
    const r = computeRange(label, new Date());
    if (!r) return;
    setDraftStart(r.start);
    setDraftEnd(r.end);
    setViewMonth(startOfMonth(r.start));
    setSelectStep("start");
    syncTexts(r.start, r.end);
  }

  function clickDay(day: Date) {
    setPreset("Custom");
    if (selectStep === "start") {
      const ns = new Date(day);
      ns.setHours(draftStart.getHours(), draftStart.getMinutes(), 0, 0);
      let ne = draftEnd;
      if (draftEnd < ns) {
        ne = new Date(day);
        ne.setHours(draftEnd.getHours(), draftEnd.getMinutes(), 0, 0);
        setDraftEnd(ne);
        setEndDateText(fmtDateInput(ne));
      }
      setDraftStart(ns);
      setStartDateText(fmtDateInput(ns));
      setSelectStep("end");
    } else {
      const startDay = startOfDay(draftStart);
      if (day >= startDay) {
        const ne = new Date(day);
        ne.setHours(draftEnd.getHours(), draftEnd.getMinutes(), 0, 0);
        setDraftEnd(ne);
        setEndDateText(fmtDateInput(ne));
        setSelectStep("start");
      } else {
        const ns = new Date(day);
        ns.setHours(draftStart.getHours(), draftStart.getMinutes(), 0, 0);
        setDraftStart(ns);
        setStartDateText(fmtDateInput(ns));
        setSelectStep("end");
      }
    }
  }

  function onStartDate(v: string) {
    setStartDateText(v);
    const d = parseDateInput(v);
    if (!d) return;
    const ns = new Date(draftStart);
    ns.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setDraftStart(ns);
    setViewMonth(startOfMonth(ns));
    setPreset("Custom");
  }
  function onEndDate(v: string) {
    setEndDateText(v);
    const d = parseDateInput(v);
    if (!d) return;
    const ne = new Date(draftEnd);
    ne.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setDraftEnd(ne);
    setPreset("Custom");
  }
  function onStartTime(h: number, m: number) {
    const ns = new Date(draftStart);
    ns.setHours(h, m, 0, 0);
    setDraftStart(ns);
    setPreset("Custom");
  }
  function onEndTime(h: number, m: number) {
    const ne = new Date(draftEnd);
    ne.setHours(h, m, 0, 0);
    setDraftEnd(ne);
    setPreset("Custom");
  }

  function apply() {
    const [s, e] = draftStart <= draftEnd ? [draftStart, draftEnd] : [draftEnd, draftStart];
    onApply({ start: s, end: e, periodicity, presetLabel: preset });
    setOpen(false);
  }

  const days = buildCalendar(viewMonth);
  const inputCls = INPUT_CLS;
  const labelCls = "mb-1 block text-xs font-medium text-rose-500";

  return (
    <div>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <span className="text-zinc-500 dark:text-zinc-400">Duration :</span>
        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {value.presetLabel}
        </span>
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          {fmtRangeLabel(value.start)} - {fmtRangeLabel(value.end)}
        </span>
        <span className="ml-1 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
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
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </span>
      </button>

      {/* Popover — portaled to <body> so it can't be clipped, positioned
          right under the trigger. */}
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
            className="z-[55] max-h-[85vh] w-[640px] max-w-[92vw] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex">
            {/* Preset sidebar */}
            <ul className="w-40 shrink-0 border-r border-zinc-200 py-2 text-sm dark:border-zinc-800">
              {PRESET_LABELS.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => choosePreset(label)}
                    className={`block w-full px-4 py-1.5 text-left transition ${
                      preset === label
                        ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>

            {/* Right panel */}
            <div className="flex-1 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date *</label>
                  <input
                    className={inputCls}
                    value={startDateText}
                    onChange={(e) => onStartDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                <div>
                  <label className={labelCls}>Start Time *</label>
                  <TimeField value={draftStart} onChange={onStartTime} />
                </div>
                <div>
                  <label className={labelCls}>End Date *</label>
                  <input
                    className={inputCls}
                    value={endDateText}
                    onChange={(e) => onEndDate(e.target.value)}
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                <div>
                  <label className={labelCls}>End Time *</label>
                  <TimeField value={draftEnd} onChange={onEndTime} />
                </div>
              </div>

              <div className="mt-3">
                <label className={labelCls}>Periodicity *</label>
                <select
                  className={inputCls}
                  value={periodicity}
                  onChange={(e) => setPeriodicity(e.target.value)}
                >
                  {PERIODICITY.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Calendar */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Previous month"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Next month"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-400">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="py-1 font-medium">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-sm">
                  {days.map((d, i) => {
                    const outside = d.getMonth() !== viewMonth.getMonth();
                    const isStart = sameDay(d, draftStart);
                    const isEnd = sameDay(d, draftEnd);
                    const sd = startOfDay(draftStart).getTime();
                    const ed = startOfDay(draftEnd).getTime();
                    const t = startOfDay(d).getTime();
                    const between = t > Math.min(sd, ed) && t < Math.max(sd, ed);
                    const edge = isStart || isEnd;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => clickDay(d)}
                        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full transition ${
                          edge
                            ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : between
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200"
                              : outside
                                ? "text-zinc-300 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:bg-zinc-800"
                                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
