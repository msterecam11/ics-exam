"use client"

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts"

const COLORS = ["#1B4F8A","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#ec4899"]

interface RadarOverlayProps {
  pillars: string[]
  candidates: Array<{ name: string; scores: number[] }>
  height?: number
}

export default function RadarOverlay({ pillars, candidates, height = 340 }: RadarOverlayProps) {
  const data = pillars.map((pillar, i) => {
    const row: any = { subject: pillar.length > 12 ? pillar.slice(0, 11) + "…" : pillar, fullName: pillar }
    candidates.forEach(c => { row[c.name] = c.scores[i] ?? 0 })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 10, fontWeight: 500 }} />
        <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} tick={{ fill: "#cbd5e1", fontSize: 9 }} axisLine={false} />
        {candidates.map((c, i) => (
          <Radar
            key={c.name}
            name={c.name}
            dataKey={c.name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        ))}
        <Tooltip
          formatter={(v: number, name: string) => [`${v.toFixed(2)} / 5.00`, name]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
