"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  t: string;
  v: number;
}

/** A compact area time-series chart themed via CSS variables. */
export function TimeSeriesChart({
  points,
  unit,
  height = 200,
}: {
  points: SeriesPoint[];
  unit?: string | null;
  height?: number;
}) {
  const data = points.map((p) => ({
    ts: new Date(p.t).getTime(),
    v: p.v,
  }));

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="wm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={["dataMin", "dataMax"]}
          scale="time"
          tickFormatter={fmtDate}
          tick={{ fill: "rgb(var(--text-muted))", fontSize: 11 }}
          stroke="rgb(var(--border))"
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: "rgb(var(--text-muted))", fontSize: 11 }}
          stroke="rgb(var(--border))"
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "rgb(var(--surface))",
            border: "1px solid rgb(var(--border))",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelFormatter={(ms) => new Date(Number(ms)).toLocaleString()}
          formatter={(value) => [`${value}${unit ? ` ${unit}` : ""}`, "value"]}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke="rgb(var(--accent-strong))"
          strokeWidth={2}
          fill="url(#wm-area)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
