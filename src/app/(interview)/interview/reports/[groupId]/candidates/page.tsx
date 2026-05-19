"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ArrowLeft, Search, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { buildVerdictLabels } from "@/lib/interview-scoring"

const VERDICT_BADGE: Record<string, string> = {
  strong_yes: "bg-emerald-100 text-emerald-700 border-emerald-200",
  yes:        "bg-blue-100 text-blue-700 border-blue-200",
  marginal:   "bg-amber-100 text-amber-700 border-amber-200",
  no:         "bg-red-100 text-red-600 border-red-200",
}

function scoreColor(score: number) {
  if (score >= 4) return "text-emerald-600"
  if (score >= 3) return "text-amber-600"
  return "text-red-500"
}

export default function CandidatesListPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router      = useRouter()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")

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

  const { group, candidates, reports, group_stats, snapshot } = data
  const candidateMap   = Object.fromEntries((candidates ?? []).map((c: any) => [c.id, c]))
  const verdictLabels  = buildVerdictLabels(snapshot?.verdict_thresholds)

  // Ranked list from group_stats
  const ranked = (group_stats.candidate_ranking ?? []).map((row: any) => ({
    ...row,
    candidate: candidateMap[row.candidate_id] ?? {},
  }))

  // Filter by search
  const filtered = ranked.filter((row: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    const c = row.candidate
    return (
      (c.full_name ?? "").toLowerCase().includes(q) ||
      (c.track_name ?? "").toLowerCase().includes(q) ||
      (c.position ?? "").toLowerCase().includes(q) ||
      (c.employment_id ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <Link href={`/interview/reports/${groupId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Individual Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {group.name} · {candidates?.length ?? 0} candidates · Select one to view their full report
          </p>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, track, position or ID…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Candidate table ── */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-4 pr-3">#</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 px-3">Candidate</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 px-3">Track</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 px-3">Position</th>
              <th className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 px-3">Score</th>
              <th className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 px-3">Verdict</th>
              <th className="py-3 px-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  {search ? `No candidates match "${search}"` : "No candidates found"}
                </td>
              </tr>
            )}
            {filtered.map((row: any, idx: number) => {
              const c    = row.candidate
              const badge = VERDICT_BADGE[row.verdict] ?? VERDICT_BADGE.no
              const label = verdictLabels[row.verdict as keyof typeof verdictLabels] ?? row.verdict
              const col   = scoreColor(row.overall_score)
              return (
                <tr
                  key={row.candidate_id}
                  onClick={() => router.push(`/interview/reports/${groupId}/candidate/${row.candidate_id}`)}
                  className={cn(
                    "border-b border-slate-50 last:border-0 cursor-pointer transition-colors hover:bg-[#1B4F8A]/5 group",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  )}
                >
                  {/* Rank */}
                  <td className="py-3 pl-4 pr-3">
                    <span className="text-xs font-bold text-slate-400">#{row.rank}</span>
                  </td>

                  {/* Name */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-xs font-bold text-[#1B4F8A] shrink-0">
                        {c.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-[#1B4F8A] transition-colors truncate">
                          {c.full_name}
                        </p>
                        {c.employment_id && (
                          <p className="text-[10px] text-slate-400">ID: {c.employment_id}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Track */}
                  <td className="py-3 px-3">
                    <span className="text-xs text-slate-500">{c.track_name ?? "—"}</span>
                  </td>

                  {/* Position */}
                  <td className="py-3 px-3">
                    <span className="text-xs text-slate-500 truncate">{c.position ?? "—"}</span>
                  </td>

                  {/* Score */}
                  <td className="py-3 px-3 text-center">
                    <span className={cn("text-base font-black tabular-nums", col)}>
                      {row.overall_score.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-300 ml-0.5">/ 5</span>
                  </td>

                  {/* Verdict */}
                  <td className="py-3 px-3 text-center">
                    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border", badge)}>
                      {label}
                    </span>
                  </td>

                  {/* Arrow */}
                  <td className="py-3 px-3 text-right">
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] group-hover:translate-x-0.5 transition-all ml-auto" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Showing {filtered.length} of {ranked.length} candidate{ranked.length !== 1 ? "s" : ""}
          {search && ` matching "${search}"`}
        </p>
      )}
    </div>
  )
}
