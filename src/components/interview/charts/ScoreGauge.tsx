"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

interface ScoreGaugeProps {
  score: number   // 1–5
  verdict: string
  height?: number
}

const VERDICT_COLORS: Record<string, string> = {
  strong_yes: "#10b981",
  yes:        "#3b82f6",
  marginal:   "#f59e0b",
  no:         "#ef4444",
}

const VERDICT_LABELS: Record<string, string> = {
  strong_yes: "STRONG YES",
  yes:        "YES",
  marginal:   "MARGINAL",
  no:         "NO",
}

export default function ScoreGauge({ score, verdict, height = 220 }: ScoreGaugeProps) {
  // Gauge goes from 0–5, displayed as a half-donut (180°)
  const pct     = Math.min(Math.max((score - 1) / 4, 0), 1) // normalise 1–5 to 0–1
  const filled  = pct * 180
  const empty   = 180 - filled
  const color   = VERDICT_COLORS[verdict] ?? "#94a3b8"
  const label   = VERDICT_LABELS[verdict] ?? verdict.replace("_", " ").toUpperCase()

  // Recharts half-donut: startAngle=180 endAngle=0
  const data = [
    { value: filled,  color },
    { value: empty,   color: "#f1f5f9" },
  ]

  return (
    <div className="relative flex flex-col items-center" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="80%"
            startAngle={180}
            endAngle={0}
            innerRadius="58%"
            outerRadius="80%"
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center text overlay */}
      <div className="absolute bottom-6 flex flex-col items-center gap-1">
        <span className="text-3xl font-black tabular-nums" style={{ color }}>
          {score.toFixed(2)}
        </span>
        <span className="text-[10px] text-slate-400 tracking-widest font-semibold">OUT OF 5.00</span>
        <span
          className="text-xs font-bold px-3 py-0.5 rounded-full mt-1"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {label}
        </span>
      </div>

      {/* Scale labels */}
      <div className="absolute bottom-2 w-full flex justify-between px-6">
        <span className="text-[9px] text-slate-400 font-medium">1.0</span>
        <span className="text-[9px] text-slate-400 font-medium">5.0</span>
      </div>
    </div>
  )
}
