"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatDayLabel } from "./format";

type CostPerDay = { date: string; runpodCostUsd: number; anthropicCostUsd: number };

const tickStyle = { fill: "var(--chart-text-muted)", fontSize: 12 };

export function CostChart({ data }: { data: CostPerDay[] }) {
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
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(value: number) => `$${value}`}
        />
        <Tooltip
          cursor={{ fill: "var(--chart-text-muted)", opacity: 0.08 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label}
              payload={payload}
              formatValue={(value) => `$${value.toFixed(2)}`}
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
          dataKey="runpodCostUsd"
          name="RunPod"
          stackId="cost"
          fill="var(--chart-blue)"
          radius={[0, 0, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="anthropicCostUsd"
          name="Anthropic"
          stackId="cost"
          fill="var(--chart-orange)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          stroke="var(--chart-surface)"
          strokeWidth={2}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
