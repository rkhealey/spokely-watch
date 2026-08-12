"use client";

import type { ReactNode } from "react";

type TooltipPayloadItem = {
  value?: number | string | ReadonlyArray<number | string>;
  name?: ReactNode;
  dataKey?: unknown;
  color?: string;
};

/**
 * Shared tooltip: value leads (strong), series name follows (secondary),
 * each row keyed by a short stroke of the series color rather than a box.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  formatValue,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly TooltipPayloadItem[];
  formatValue?: (value: number, dataKey: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const key = String(entry.dataKey ?? i);
          const numericValue = typeof entry.value === "number" ? entry.value : null;
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                {numericValue !== null && formatValue
                  ? formatValue(numericValue, key)
                  : String(entry.value)}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">{entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
