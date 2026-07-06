"use client";

import { useEffect, useState } from "react";

export const TR_BASE_DEFAULT = 810;

/**
 * Global TR Base control: TR = trBase × ΔT ÷ 3.024.
 * Commits on Enter or blur, rejects non-positive values, and offers a Reset
 * link back to the default when the current value differs.
 */
export default function TrBaseInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Keep the field in sync when the source value changes elsewhere (e.g. Reset).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) {
      if (n !== value) onChange(n);
    } else {
      setDraft(String(value)); // reject → revert
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        TR Base
      </label>
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={commit}
        title="TR = TR Base × ΔT ÷ 3.024"
        className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold tabular-nums text-zinc-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-indigo-500/20"
      />
      {value !== TR_BASE_DEFAULT && (
        <button
          type="button"
          onClick={() => onChange(TR_BASE_DEFAULT)}
          className="text-xs font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        >
          Reset
        </button>
      )}
    </div>
  );
}
