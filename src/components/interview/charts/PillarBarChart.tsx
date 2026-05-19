"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from "recharts"

interface PillarBarChartProps {
  pillars: Array<{ name?: string; pillar_name?: string; avg: number; insight_label: string }>
  threshold?: number   // reference line (e.g. passing threshold)
  height?: number
  grouped?: Array<{ label: string; color: string; values: number[] }> // multi-series
}

function barColor(label: string): string {
  if (label === "top_strength") return "#10b981"
  if (label === "watch_list")   return "#f59e0b"
  if (label === "development")  return "#ef4444"
  return "#3b82f6"
}

export default function PillarBarChart({ pillars, threshold, height = 260, grouped }: PillarBarChartProps) {
  const data = pillars.map((p, i) => {
    const label = p.name ?? p.pillar_name ?? ""
    return {
      name:  label.length > 14 ? label.slice(0, 13) + "…" : label,
      full:  label,
      avg:   p.avg,
      label: p.insight_label,
      ...(grouped ? Object.fromEntries(grouped.map((g, gi) => [g.label, g.values[i] ?? 0])) : {}),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          domain={[0, 5]}
          tickCount={6}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "#475569", fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        {threshold && (
          <ReferenceLine
            x={threshold}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: `Threshold ${threshold}`, position: "top", fontSize: 9, fill: "#94a3b8" }}
          />
        )}
        {grouped ? (
          grouped.map(g => (
            <Bar key={g.label} dataKey={g.label} fill={g.color} radius={[0, 4, 4, 0]} barSize={10}>
              <LabelList dataKey={g.label} position="right" style={{ fontSize: 9, fill: "#64748b", fontWeight: 600 }} formatter={(v: number) => v.toFixed(2)} />
            </Bar>
          ))
        ) : (
          <Bar dataKey="avg" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d, i) => <Cell key={i} fill={barColor(d.label)} />)}
            <LabelList dataKey="avg" position="right" style={{ fontSize: 11, fill: "#475569", fontWeight: 700 }} formatter={(v: number) => v.toFixed(2)} />
          </Bar>
        )}
        <Tooltip
          formatter={(v: number, name: string) => [`${v.toFixed(2)} / 5.00`, name === "avg" ? "Score" : name]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
