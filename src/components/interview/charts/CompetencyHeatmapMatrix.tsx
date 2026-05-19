"use client"

import { cn } from "@/lib/utils"

interface MatrixCell { score: number }
interface HeatmapRow  { candidateName: string; cells: MatrixCell[] }

interface CompetencyHeatmapMatrixProps {
  competencies: Array<{ pillarName: string; name: string }>
  rows: HeatmapRow[]
  pillarNames: string[]
}

function cellBg(score: number): string {
  if (score >= 4.0) return "bg-emerald-500"
  if (score >= 3.5) return "bg-emerald-300"
  if (score >= 3.0) return "bg-amber-300"
  if (score >= 2.5) return "bg-amber-400"
  if (score >= 2.0) return "bg-orange-400"
  return "bg-red-400"
}

export default function CompetencyHeatmapMatrix({ competencies, rows, pillarNames }: CompetencyHeatmapMatrixProps) {
  // Build pillar column groups
  const pillarGroups: Record<string, number[]> = {}
  competencies.forEach((c, i) => {
    if (!pillarGroups[c.pillarName]) pillarGroups[c.pillarName] = []
    pillarGroups[c.pillarName].push(i)
  })

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-0.5 min-w-full">
        <thead>
          {/* Pillar header row */}
          <tr>
            <th className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-wider pb-1 pr-3 min-w-[120px]">
              Candidate
            </th>
            {Object.entries(pillarGroups).map(([pillar, indices]) => (
              <th
                key={pillar}
                colSpan={indices.length}
                className="text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider pb-1 px-1 border-b border-slate-200"
              >
                {pillar}
              </th>
            ))}
          </tr>
          {/* Competency header row */}
          <tr>
            <th />
            {competencies.map((c, ci) => (
              <th
                key={`${ci}-${c.name}`}
                className="text-center text-[8px] text-slate-400 font-medium pb-2 px-0.5 max-w-[44px]"
              >
                <div
                  className="writing-vertical-lr rotate-180 h-14 flex items-center justify-start"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {c.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <td className="pr-3 py-0.5 text-slate-700 font-medium whitespace-nowrap text-[10px]">
                {row.candidateName}
              </td>
              {row.cells.map((cell, ci) => (
                <td key={ci} className="p-0.5">
                  <div
                    className={cn(
                      "w-11 h-8 rounded flex items-center justify-center text-white font-bold text-[10px] cursor-default",
                      "hover:scale-110 transition-transform shadow-sm",
                      cellBg(cell.score),
                    )}
                    title={`${row.candidateName} / ${competencies[ci]?.name}: ${cell.score.toFixed(2)}`}
                  >
                    {cell.score.toFixed(1)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {/* Average row */}
          {rows.length > 1 && (
            <tr className="border-t border-slate-200">
              <td className="pr-3 pt-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Track Avg</td>
              {competencies.map((_, ci) => {
                const vals = rows.map(r => r.cells[ci]?.score ?? 0)
                const avg  = vals.reduce((s, v) => s + v, 0) / vals.length
                return (
                  <td key={ci} className="p-0.5 pt-2">
                    <div className={cn("w-11 h-8 rounded flex items-center justify-center font-bold text-[10px] text-white shadow-sm", cellBg(avg))}>
                      {avg.toFixed(1)}
                    </div>
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {[
          { label: "≥ 4.0",  color: "bg-emerald-500" },
          { label: "3.5",    color: "bg-emerald-300"  },
          { label: "3.0",    color: "bg-amber-300"    },
          { label: "2.5",    color: "bg-amber-400"    },
          { label: "< 2.5",  color: "bg-red-400"      },
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
