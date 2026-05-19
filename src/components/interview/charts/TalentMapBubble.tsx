"use client"

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts"

interface Candidate {
  name:         string
  xScore:       number
  yScore:       number
  overallScore: number
  verdict:      string
}

interface TalentMapBubbleProps {
  candidates:  Candidate[]
  xAxisLabel:  string
  yAxisLabel:  string
  height?:     number
}

const VERDICT_COLORS: Record<string, string> = {
  strong_yes: "#10b981",
  yes:        "#3b82f6",
  marginal:   "#f59e0b",
  no:         "#ef4444",
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-bold text-slate-700 mb-1">{d.name}</p>
      <p className="text-slate-500">Overall: <span className="font-semibold text-slate-700">{d.overallScore.toFixed(2)}</span></p>
      <p className="text-slate-500">X: <span className="font-semibold">{d.xScore.toFixed(2)}</span></p>
      <p className="text-slate-500">Y: <span className="font-semibold">{d.yScore.toFixed(2)}</span></p>
      <span
        className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-white text-[9px] font-bold"
        style={{ backgroundColor: VERDICT_COLORS[d.verdict] ?? "#94a3b8" }}
      >
        {d.verdict.replace("_", " ").toUpperCase()}
      </span>
    </div>
  )
}

export default function TalentMapBubble({ candidates, xAxisLabel, yAxisLabel, height = 340 }: TalentMapBubbleProps) {
  const data = candidates.map(c => ({
    ...c,
    // Bubble size based on overall score (normalised)
    z: Math.max(40, c.overallScore * 30),
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="xScore"
            domain={[1, 5]}
            name={xAxisLabel}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            label={{ value: xAxisLabel, position: "insideBottom", offset: -15, fontSize: 11, fill: "#64748b", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          <YAxis
            type="number"
            dataKey="yScore"
            domain={[1, 5]}
            name={yAxisLabel}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            label={{ value: yAxisLabel, angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#64748b", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          {/* Quadrant lines at 3.5 */}
          <ReferenceLine x={3.5} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 4" />
          <ReferenceLine y={3.5} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 4" />
          <Scatter data={data} dataKey="z">
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={VERDICT_COLORS[d.verdict] ?? "#94a3b8"}
                fillOpacity={0.75}
                stroke={VERDICT_COLORS[d.verdict] ?? "#94a3b8"}
                strokeWidth={2}
                r={Math.max(12, d.overallScore * 7)}
              />
            ))}
          </Scatter>
          <Tooltip content={<CustomTooltip />} />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Quadrant labels */}
      <div className="grid grid-cols-2 gap-2 mt-2 text-[9px] text-slate-400 px-4">
        <div className="text-right">◤ High {xAxisLabel} / Low {yAxisLabel}</div>
        <div>◥ High both — ideal zone</div>
        <div className="text-right">◣ Low both</div>
        <div>◢ Low {xAxisLabel} / High {yAxisLabel}</div>
      </div>

      {/* Verdict legend */}
      <div className="flex items-center gap-4 justify-center mt-3 flex-wrap">
        {Object.entries(VERDICT_COLORS).map(([v, color]) => (
          <div key={v} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-slate-500 capitalize">{v.replace("_", " ")}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-400 border border-slate-300 mr-0.5" />
          <div className="w-4 h-4 rounded-full bg-slate-400 border border-slate-300" />
          <span className="text-[10px] text-slate-400 ml-1">Size = Overall Score</span>
        </div>
      </div>
    </div>
  )
}
