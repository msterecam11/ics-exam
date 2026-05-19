"use client"

import { cn } from "@/lib/utils"

interface CompetencyCell {
  pillarName:      string
  competencyName:  string
  score:           number
  insightLabel:    "top_strength" | "watch_list" | "development" | "none"
}

interface CompetencyHeatmapStripProps {
  cells: CompetencyCell[]
}

function scoreColor(score: number): string {
  if (score >= 4.0) return "bg-emerald-500"
  if (score >= 3.5) return "bg-emerald-300"
  if (score >= 3.0) return "bg-amber-300"
  if (score >= 2.5) return "bg-amber-400"
  if (score >= 2.0) return "bg-orange-400"
  return "bg-red-500"
}

function textColor(score: number): string {
  if (score >= 3.0) return "text-white"
  return "text-white"
}

export default function CompetencyHeatmapStrip({ cells }: CompetencyHeatmapStripProps) {
  // Group by pillar to show dividers
  const byPillar: Record<string, CompetencyCell[]> = {}
  for (const c of cells) {
    if (!byPillar[c.pillarName]) byPillar[c.pillarName] = []
    byPillar[c.pillarName].push(c)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {Object.entries(byPillar).map(([pillarName, pillarCells]) => (
          <div key={pillarName} className="flex flex-col gap-1">
            {/* Pillar label */}
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 text-center">
              {pillarName.length > 10 ? pillarName.slice(0, 9) + "…" : pillarName}
            </div>
            {/* Competency cells */}
            <div className="flex gap-0.5">
              {pillarCells.map(cell => (
                <div
                  key={cell.competencyName}
                  className={cn(
                    "relative group flex flex-col items-center justify-center rounded-md cursor-default",
                    "w-14 h-14 transition-transform hover:scale-110 hover:z-10 shadow-sm",
                    scoreColor(cell.score),
                  )}
                  title={`${cell.competencyName}: ${cell.score.toFixed(2)}`}
                >
                  <span className={cn("text-sm font-black tabular-nums", textColor(cell.score))}>
                    {cell.score.toFixed(1)}
                  </span>
                  {/* Tooltip */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                    {cell.competencyName}
                    <br />
                    <span className="font-bold">{cell.score.toFixed(2)} / 5.00</span>
                  </div>
                  {/* Bottom label (truncated) */}
                  <span className={cn("text-[7px] mt-0.5 font-medium text-center leading-tight px-0.5", textColor(cell.score))}>
                    {cell.competencyName.length > 8 ? cell.competencyName.slice(0, 7) + "…" : cell.competencyName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <span className="text-[9px] text-slate-400 font-medium">Scale:</span>
        {[
          { label: "≥ 4.0 Top Strength",    color: "bg-emerald-500" },
          { label: "3.5–3.99",               color: "bg-emerald-300" },
          { label: "3.0–3.49",               color: "bg-amber-300"   },
          { label: "2.5–2.99 Watch List",    color: "bg-amber-400"   },
          { label: "< 2.5 Dev. Area",         color: "bg-red-500"     },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={cn("w-3 h-3 rounded-sm", l.color)} />
            <span className="text-[9px] text-slate-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
