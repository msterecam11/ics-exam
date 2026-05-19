import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ClipboardList, Users, CheckCircle2, Clock, CalendarDays, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  active:    "bg-emerald-100 text-emerald-700",
  complete:  "bg-blue-100 text-blue-700",
  published: "bg-purple-100 text-purple-700",
}

// Mirror of scoring page filter: candidate has ≥1 pillar this assessor can score
function computeVisibleCount(
  candidates: { id: string; track_id: string | null }[],
  snapshotPillars: { id: string; applicable_track_ids: string[] }[],
  pillarWeights: Record<string, number>,
): number {
  const hasWeightMap = Object.keys(pillarWeights).length > 0
  return candidates.filter(c =>
    snapshotPillars.some(p => {
      const trackIds: string[] = Array.isArray(p.applicable_track_ids) ? p.applicable_track_ids : []
      const trackOk = trackIds.length === 0 || (c.track_id ? trackIds.includes(c.track_id) : true)
      const weightOk = !hasWeightMap || (pillarWeights[p.id] ?? 0) > 0
      return trackOk && weightOk
    })
  ).length
}

async function getStats(userId: string, role: string) {
  const isAssessor = role === "assessor"

  const [configsRes, groupsRes] = await Promise.all([
    isAssessor
      ? Promise.resolve({ count: null })
      : db.from("assessment_configs").select("*", { count: "exact", head: true }),
    isAssessor
      ? db.from("group_assessors").select("group_id").eq("assessor_id", userId)
      : db.from("assessment_groups").select("id, name, status, scheduled_date, created_at, assessment_configs(name), interview_candidates(id)")
          .order("created_at", { ascending: false }).limit(6),
  ])

  let recentGroups: any[] = []
  let totalGroups = 0
  let activeGroups = 0

  if (isAssessor) {
    const groupIds = ((groupsRes as any).data ?? []).map((a: any) => a.group_id)
    if (groupIds.length > 0) {
      // Fetch groups (with snapshot + candidates) and assessor matrix row in parallel
      const [groupsData, assessorRows] = await Promise.all([
        db.from("assessment_groups")
          .select("id, name, status, scheduled_date, created_at, config_snapshot, assessment_configs(name), interview_candidates(id, track_id)")
          .in("id", groupIds)
          .order("created_at", { ascending: false }),
        db.from("group_assessors")
          .select("group_id, pillar_weights")
          .in("group_id", groupIds)
          .eq("assessor_id", userId),
      ])

      // Build lookup: group_id → pillar_weights
      const metaMap: Record<string, Record<string, number>> = {}
      for (const ga of (assessorRows.data ?? [])) {
        metaMap[ga.group_id] = ga.pillar_weights ?? {}
      }

      recentGroups = (groupsData.data ?? []).map(g => {
        const pillars       = (g.config_snapshot as any)?.pillars ?? []
        const rawCandidates = (g.interview_candidates ?? []) as { id: string; track_id: string | null }[]
        const visibleCount  = computeVisibleCount(rawCandidates, pillars, metaMap[g.id] ?? {})
        return { ...g, _visibleCount: visibleCount }
      })
    }
  } else {
    recentGroups = (groupsRes as any).data ?? []
    const allGroups = await db.from("assessment_groups").select("status")
    totalGroups = allGroups.data?.length ?? 0
    activeGroups = allGroups.data?.filter((g: any) => g.status === "active").length ?? 0
  }

  return {
    configCount: (configsRes as any).count ?? 0,
    totalGroups,
    activeGroups,
    recentGroups,
  }
}

export default async function InterviewDashboard() {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const role = session.user.role ?? ""
  const isAssessor = role === "assessor"
  const stats = await getStats(session.user.id!, role)

  const statCards = isAssessor
    ? []
    : [
        { label: "Configs",        value: stats.configCount,  icon: ClipboardList, href: "/interview/configs", color: "text-[#1B4F8A]",    bg: "bg-blue-50"    },
        { label: "Total Groups",   value: stats.totalGroups,  icon: Users,         href: "/interview/groups",  color: "text-indigo-600",  bg: "bg-indigo-50" },
        { label: "Active Groups",  value: stats.activeGroups, icon: CheckCircle2,  href: "/interview/groups",  color: "text-emerald-600", bg: "bg-emerald-50" },
      ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          {isAssessor ? `Welcome, ${session.user.name?.split(" ")[0]}` : `Welcome back, ${session.user.name?.split(" ")[0]}`}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isAssessor ? "Here are the groups you're assigned to score." : "Panel Interview system overview."}
        </p>
      </div>

      {/* Stat cards — admin only */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map(({ label, value, icon: Icon, href, color, bg }) => (
            <Link key={label} href={href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                    </div>
                    <div className={`${bg} p-3 rounded-xl`}>
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Recent / assigned groups */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            {isAssessor ? "My Assigned Groups" : "Recent Groups"}
          </CardTitle>
          {!isAssessor && (
            <Link href="/interview/groups" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              View all
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.recentGroups.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-6">
              {isAssessor ? "You haven't been assigned to any groups yet." : "No groups created yet."}
            </p>
          )}
          {stats.recentGroups.map((g: any) => (
            <Link
              key={g.id}
              href={isAssessor ? `/interview/score/${g.id}` : `/interview/groups/${g.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-[#1B4F8A]/8 p-2 rounded-lg shrink-0">
                  <Users className="h-4 w-4 text-[#1B4F8A]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">{(g.assessment_configs as any)?.name}</p>
                    {g.scheduled_date && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(g.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {isAssessor
                    ? (g._visibleCount ?? 0)
                    : ((g.interview_candidates as any[])?.length ?? 0)}
                </div>
                <Badge className={cn("text-xs border-0 capitalize", STATUS_STYLES[g.status] ?? "bg-slate-100 text-slate-600")}>
                  {g.status}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Quick actions — admin only */}
      {!isAssessor && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/interview/configs/new"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group"
          >
            <div className="bg-[#1B4F8A]/10 p-3 rounded-xl">
              <ClipboardList className="h-5 w-5 text-[#1B4F8A]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">New Assessment Config</p>
              <p className="text-xs text-slate-500 mt-0.5">Define pillars, competencies & scoring weights</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-[#1B4F8A] transition-colors" />
          </Link>
          <Link
            href="/interview/groups/new"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group"
          >
            <div className="bg-indigo-50 p-3 rounded-xl">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">New Interview Group</p>
              <p className="text-xs text-slate-500 mt-0.5">Create a cohort, add candidates & assessors</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </Link>
        </div>
      )}
    </div>
  )
}
