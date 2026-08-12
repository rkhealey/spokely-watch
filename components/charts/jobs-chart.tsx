"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatDayLabel } from "./format";

type JobsPerDay = { date: string; succeeded: number; failed: number };

const tickStyle = { fill: "var(--chart-text-muted)", fontSize: 12 };

export function JobsChart({ data }: { data: JobsPerDay[] }) {
  const tickInterval = Math.max(0, Math.floor(data.length / 6) - 1);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDayLabel}
          interval={tickInterval}
          tick={tickStyle}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: "var(--chart-text-muted)", opacity: 0.08 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label}
              payload={payload}
              formatValue={(value) => value.toLocaleString()}
            />
          )}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={32}
          iconType="square"
          iconSize={10}
          formatter={(value) => (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{value}</span>
          )}
        />
        <Bar
          dataKey="succeeded"
          name="Succeeded"
          stackId="jobs"
          fill="var(--chart-good)"
          radius={[0, 0, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="failed"
          name="Failed"
          stackId="jobs"
          fill="var(--chart-critical)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          stroke="var(--chart-surface)"
          strokeWidth={2}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
