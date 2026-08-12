"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { formatDayLabel } from "./format";

type AudioHoursPerDay = { date: string; hours: number };

const tickStyle = { fill: "var(--chart-text-muted)", fontSize: 12 };

export function AudioHoursChart({ data }: { data: AudioHoursPerDay[] }) {
  const tickInterval = Math.max(0, Math.floor(data.length / 6) - 1);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDayLabel}
          interval={tickInterval}
          tick={tickStyle}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
        />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label}
              payload={payload}
              formatValue={(value) => `${value.toFixed(1)}h`}
            />
          )}
        />
        <Area
          dataKey="hours"
          name="Audio hours"
          type="monotone"
          stroke="var(--chart-blue)"
          strokeWidth={2}
          fill="var(--chart-blue-wash)"
          dot={false}
          activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
