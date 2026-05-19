"use client"

interface Assessor { id: string; name: string }

interface AssessorDotPlotProps {
  competencyName: string
  assessorScores: Record<string, number>      // assessorId → score
  weightedAvg: number
  isDivergent: boolean
  assessors: Assessor[]
}

const DOT_COLORS = ["#1B4F8A", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]

export default function AssessorDotPlot({
  competencyName,
  assessorScores,
  weightedAvg,
  isDivergent,
  assessors,
}: AssessorDotPlotProps) {
  const MIN = 1
  const MAX = 5
  const range = MAX - MIN

  function pct(val: number) {
    return ((val - MIN) / range) * 100
  }

  const assessorList = assessors.filter(a => assessorScores[a.id] !== undefined)

  return (
    <div className="space-y-2">
      {/* Track bar */}
      <div className="relative h-7 bg-slate-100 rounded-full overflow-visible">
        {/* Zone backgrounds */}
        <div className="absolute inset-y-0 left-0 w-[30%] bg-red-50 rounded-l-full opacity-60" />
        <div className="absolute inset-y-0 left-[30%] w-[35%] bg-amber-50 opacity-60" />
        <div className="absolute inset-y-0 left-[65%] w-[35%] bg-emerald-50 rounded-r-full opacity-60" />

        {/* Tick marks at 1,2,3,4,5 */}
        {[1, 2, 3, 4, 5].map(v => (
          <div
            key={v}
            className="absolute top-1 h-5 w-px bg-slate-300"
            style={{ left: `${pct(v)}%` }}
          />
        ))}

        {/* Weighted average line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-500 z-10"
          style={{ left: `${pct(weightedAvg)}%` }}
          title={`Weighted avg: ${weightedAvg.toFixed(2)}`}
        />
        {/* Weighted avg diamond */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-slate-600 rotate-45 z-20"
          style={{ left: `${pct(weightedAvg)}%` }}
          title={`Weighted avg: ${weightedAvg.toFixed(2)}`}
        />

        {/* Assessor dots */}
        {assessorList.map((a, i) => {
          const score = assessorScores[a.id]
          const color = DOT_COLORS[i % DOT_COLORS.length]
          return (
            <div
              key={a.id}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white z-30 shadow-sm cursor-pointer group"
              style={{ left: `${pct(score)}%`, backgroundColor: color }}
              title={`${a.name}: ${score.toFixed(2)}`}
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {a.name}: {score.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-[9px] text-slate-400 px-0.5">
        <span>1.0</span><span>2.0</span><span>3.0</span><span>4.0</span><span>5.0</span>
      </div>

      {/* Assessor legend + divergence flag */}
      <div className="flex items-center gap-3 flex-wrap">
        {assessorList.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1 text-[10px] text-slate-500">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }} />
            {a.name.split(" ")[0]}: {assessorScores[a.id].toFixed(2)}
          </div>
        ))}
        <div className="flex items-center gap-1 text-[10px] text-slate-600 ml-auto">
          <div className="w-2.5 h-2.5 bg-slate-600 rotate-45" />
          avg: {weightedAvg.toFixed(2)}
        </div>
        {isDivergent && (
          <span className="text-[9px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            ⚠ Rater Divergence
          </span>
        )}
      </div>
    </div>
  )
}
