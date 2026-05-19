"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  Loader2, ArrowLeft, Users, UserRound, BarChart3,
  CalendarDays, MapPin, ChevronRight, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const REPORT_TYPES = [
  {
    key:         "group",
    label:       "Group Report",
    description: "Full cohort overview — rankings, pillar averages, verdict distribution, assessor calibration and Expert insights for the entire group.",
    icon:        BarChart3,
    color:       "text-[#1B4F8A]",
    bg:          "bg-[#1B4F8A]/5 hover:bg-[#1B4F8A]/10 border-[#1B4F8A]/20 hover:border-[#1B4F8A]/40",
    badge:       "bg-[#1B4F8A] text-white",
  },
  {
    key:         "roles",
    label:       "Roles Report",
    description: "Performance breakdown by track / role. Select a specific role to see its cohort ranking, radar overlay, and competency matrix.",
    icon:        Layers,
    color:       "text-purple-700",
    bg:          "bg-purple-50 hover:bg-purple-100/60 border-purple-200 hover:border-purple-300",
    badge:       "bg-purple-600 text-white",
  },
  {
    key:         "candidates",
    label:       "Individual Report",
    description: "Deep-dive per candidate — pillar scores, competency breakdown, assessor evaluations, divergence flags and Expert verdict analysis.",
    icon:        UserRound,
    color:       "text-emerald-700",
    bg:          "bg-emerald-50 hover:bg-emerald-100/60 border-emerald-200 hover:border-emerald-300",
    badge:       "bg-emerald-600 text-white",
  },
]

export default function GroupReportLanding() {
  const { groupId } = useParams<{ groupId: string }>()
  const router      = useRouter()
  const [group,    setGroup]    = useState<any>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch(`/api/interview/groups/${groupId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast.error(d.error); return }
        setGroup(d)
      })
      .catch(() => toast.error("Failed to load group"))
      .finally(() => setLoading(false))
  }, [groupId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )
  if (!group) return null

  const candidates = group.interview_candidates ?? []
  const assessors  = group.group_assessors ?? []
  const pillars    = group.config_snapshot?.pillars ?? []

  const scheduledDate = group.scheduled_date
    ? new Date(group.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null

  const statusColors: Record<string, string> = {
    draft:     "bg-slate-100 text-slate-500",
    active:    "bg-blue-100 text-blue-600",
    complete:  "bg-emerald-100 text-emerald-600",
    published: "bg-purple-100 text-purple-600",
  }

  const canViewReports = ["complete", "published"].includes(group.status)

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">

      {/* ── Back + group identity ── */}
      <div className="flex items-start gap-3">
        <Link href="/interview/groups">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{group.name}</h2>
            <Badge className={cn("text-[10px] capitalize border-0", statusColors[group.status] ?? "bg-slate-100 text-slate-500")}>
              {group.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {candidates.length} candidates
            </span>
            <span className="flex items-center gap-1">
              <UserRound className="h-3 w-3" /> {assessors.length} assessors
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> {pillars.length} pillars
            </span>
            {scheduledDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {scheduledDate}
              </span>
            )}
            {group.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {group.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Not ready banner ── */}
      {!canViewReports && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 flex items-start gap-3">
          <span className="text-amber-400 text-base mt-0.5">⚠</span>
          <div>
            <p className="font-semibold">Reports not available yet</p>
            <p className="text-xs mt-0.5 text-amber-600">
              Group must be marked <strong>Complete</strong> or <strong>Published</strong> before reports can be generated.
              Current status: <strong className="capitalize">{group.status}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Section label ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 mb-5">
          Select Report Type
        </p>

        {/* ── 3 report cards ── */}
        <div className="space-y-4">
          {REPORT_TYPES.map(rt => {
            const Icon = rt.icon
            return (
              <button
                key={rt.key}
                disabled={!canViewReports}
                onClick={() => canViewReports && router.push(`/interview/reports/${groupId}/${rt.key}`)}
                className={cn(
                  "w-full text-left rounded-2xl border p-6 transition-all duration-150 group",
                  canViewReports
                    ? cn("cursor-pointer", rt.bg)
                    : "cursor-not-allowed opacity-40 bg-slate-50 border-slate-200"
                )}
              >
                <div className="flex items-start gap-5">
                  {/* Icon block */}
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    canViewReports ? rt.badge : "bg-slate-200"
                  )}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-bold text-base", canViewReports ? rt.color : "text-slate-400")}>
                      {rt.label}
                    </p>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{rt.description}</p>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className={cn(
                    "h-5 w-5 shrink-0 mt-1 transition-transform",
                    canViewReports
                      ? cn(rt.color, "group-hover:translate-x-1")
                      : "text-slate-300"
                  )} />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
