"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from "recharts"

interface DivergenceBarProps {
  items: Array<{ pillar_name: string; competency_name: string; avg_spread: number }>
  threshold: number
  height?: number
}

export default function DivergenceBar({ items, threshold, height = 240 }: DivergenceBarProps) {
  const data = items.slice(0, 10).map(d => ({
    name:   `${d.competency_name}`,
    pillar: d.pillar_name,
    spread: d.avg_spread,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          domain={[0, 4]}
          tickCount={5}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: "#475569" }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <ReferenceLine
          x={threshold}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          strokeWidth={2}
          label={{ value: `Threshold ${threshold}`, position: "top", fontSize: 9, fill: "#f59e0b", fontWeight: 600 }}
        />
        <Bar dataKey="spread" radius={[0, 6, 6, 0]} barSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.spread >= threshold ? "#ef4444" : "#94a3b8"} />
          ))}
          <LabelList
            dataKey="spread"
            position="right"
            style={{ fontSize: 10, fill: "#475569", fontWeight: 700 }}
            formatter={(v: number) => v.toFixed(2)}
          />
        </Bar>
        <Tooltip
          formatter={(v: number, _: string, props: any) => [
            `${v.toFixed(2)} spread${v >= threshold ? " ⚠ Flagged" : ""}`,
            `${props.payload.name} (${props.payload.pillar})`,
          ]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
