"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatDayLabel } from "./format";

type CostPerHourPerDay = { date: string; costPerAudioHour: number };

const tickStyle = { fill: "var(--chart-text-muted)", fontSize: 12 };

export function CostPerHourChart({ data }: { data: CostPerHourPerDay[] }) {
  const tickInterval = Math.max(0, Math.floor(data.length / 6) - 1);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label}
              payload={payload}
              formatValue={(value) => `$${value.toFixed(2)}/hr`}
            />
          )}
        />
        <Line
          dataKey="costPerAudioHour"
          name="Cost per audio-hour"
          type="monotone"
          stroke="var(--chart-blue)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
