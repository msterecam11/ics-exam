"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ArrowLeft, Users, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const VERDICT_COLORS: Record<string, string> = {
  strong_yes: "text-emerald-600",
  yes:        "text-blue-600",
  marginal:   "text-amber-600",
  no:         "text-red-600",
}

const VERDICT_LABELS: Record<string, string> = {
  strong_yes: "Strong Yes",
  yes:        "Yes",
  marginal:   "Marginal",
  no:         "No",
}

function scoreColor(score: number) {
  if (score >= 4) return "text-emerald-600"
  if (score >= 3) return "text-amber-600"
  return "text-red-500"
}

export default function RolesListPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router      = useRouter()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/interview/reports/${groupId}`)
      .then(r => r.json().catch(() => ({ error: "Invalid response" })))
      .then(d => {
        if (d.error) { toast.error(d.error); return }
        setData(d)
      })
      .catch(() => toast.error("Failed to load report data"))
      .finally(() => setLoading(false))
  }, [groupId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )
  if (!data) return null

  const { group, group_stats, candidates } = data

  const trackBreakdown = group_stats.track_breakdown as Record<string, any>

  const tracks = Object.entries(trackBreakdown).map(([trackId, tb]: [string, any]) => ({
    id:       trackId,
    name:     tb.track_name,
    count:    tb.count,
    avgScore: tb.avg_score,
    verdicts: tb.verdicts,
  })).filter(t => t.id !== "unknown")

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Link href={`/interview/reports/${groupId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Roles Report</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{group.name} · Select a role to view its report</p>
        </div>
      </div>

      {/* ── No tracks ── */}
      {tracks.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
          No roles / tracks found in this group. Make sure candidates are assigned to a track.
        </div>
      )}

      {/* ── Track cards ── */}
      <div className="space-y-4">
        {tracks.map(track => {
          const col = scoreColor(track.avgScore)
          return (
            <button
              key={track.id}
              onClick={() => router.push(`/interview/reports/${groupId}/track/${track.id}`)}
              className="w-full text-left rounded-2xl border border-slate-200 hover:border-[#1B4F8A]/40 bg-white hover:bg-[#1B4F8A]/5 transition-all duration-150 p-6 group cursor-pointer"
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6 text-[#1B4F8A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-bold text-slate-800 text-base group-hover:text-[#1B4F8A] transition-colors">
                      {track.name}
                    </p>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                      {track.count} candidate{track.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {Object.entries(track.verdicts).map(([v, count]) => {
                      if (!count) return null
                      return (
                        <span key={v} className={cn("text-xs font-semibold", VERDICT_COLORS[v] ?? "text-slate-500")}>
                          {VERDICT_LABELS[v] ?? v}: {count as number}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className={cn("text-2xl font-black tabular-nums", col)}>{track.avgScore.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Avg Score</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#1B4F8A] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
