"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"

interface VerdictDonutProps {
  distribution: { strong_yes: number; yes: number; marginal: number; no: number }
  height?: number
}

const SEGMENTS = [
  { key: "strong_yes", label: "Strong Yes", color: "#10b981" },
  { key: "yes",        label: "Yes",        color: "#3b82f6" },
  { key: "marginal",   label: "Marginal",   color: "#f59e0b" },
  { key: "no",         label: "No",          color: "#ef4444" },
] as const

const RADIAN = Math.PI / 180
function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) {
  if (value === 0) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={800}>
      {value}
    </text>
  )
}

export default function VerdictDonut({ distribution, height = 280 }: VerdictDonutProps) {
  const total = Object.values(distribution).reduce((s, v) => s + v, 0)
  const data  = SEGMENTS.map(s => ({ name: s.label, value: distribution[s.key], color: s.color }))
                        .filter(d => d.value > 0)

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius="50%"
            outerRadius="78%"
            dataKey="value"
            labelLine={false}
            label={renderLabel}
            strokeWidth={2}
            stroke="#fff"
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            formatter={(v: any, name: any) => [`${v} candidates (${Math.round((v / total) * 100)}%)`, name]}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre total */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
        <span className="text-2xl font-black text-slate-700">{total}</span>
        <span className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase">Total</span>
      </div>
    </div>
  )
}
