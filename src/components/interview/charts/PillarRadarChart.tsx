"use client"

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts"

interface PillarRadarChartProps {
  pillars: Array<{ name: string; score: number; avg?: number }>
  showAverage?: boolean
  height?: number
}

// Custom tick — single line for most names, wraps only when 4+ words
function AxisTick({ x = 0, y = 0, payload, textAnchor }: any) {
  const name: string = payload?.value ?? ""
  const words = name.split(" ")

  // Only split into 2 lines for names with 4+ words
  let lines: string[]
  if (words.length >= 4) {
    const mid = Math.ceil(words.length / 2)
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")]
  } else {
    lines = [name]
  }

  const LINE_H = 13
  const startY = y - ((lines.length - 1) * LINE_H) / 2

  return (
    <text
      textAnchor={textAnchor ?? "middle"}
      fill="#64748b"
      fontSize={10}
      fontWeight={500}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={startY + i * LINE_H}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

export default function PillarRadarChart({ pillars, showAverage = true, height = 320 }: PillarRadarChartProps) {
  const data = pillars.map(p => ({
    subject:   p.name,
    fullName:  p.name,
    Candidate: p.score,
    ...(showAverage && p.avg !== undefined ? { "Group Avg": p.avg } : {}),
  }))

  return (
    // overflow-visible lets SVG tick labels render outside the chart boundary
    <div style={{ width: "100%", height, overflow: "visible" }}>
      {/* Make recharts SVG overflow-visible so axis labels aren't clipped */}
      <style>{`.recharts-surface { overflow: visible !important; }`}</style>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={data}
          outerRadius="58%"
          margin={{ top: 30, right: 72, bottom: 30, left: 72 }}
        >
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="subject" tick={<AxisTick />} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tickCount={6}
            tick={{ fill: "#cbd5e1", fontSize: 9 }}
            axisLine={false}
          />
          {showAverage && (
            <Radar
              name="Group Avg"
              dataKey="Group Avg"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.15}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="Candidate"
            dataKey="Candidate"
            stroke="#1B4F8A"
            fill="#1B4F8A"
            fillOpacity={0.25}
            strokeWidth={2.5}
            dot={{ fill: "#1B4F8A", r: 4 }}
          />
          <Tooltip
            formatter={(value: any, name: any) => [`${value?.toFixed(2)} / 5.00`, name]}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          {showAverage && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
