import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft, BookOpen, BarChart3, User } from "lucide-react"
import { pageScope, canSeeCourse, canSeeTrack } from "@/lib/staff-access"
import { selectAll } from "@/lib/lms-report-cache"
import LevelNav, { levelPct } from "@/components/lms/reports/LevelNav"

interface Props { params: Promise<{ courseId: string }> }

export const dynamic = "force-dynamic"
const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
const fmtMonth = (d: string | null) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"

// Course report hub: the groups taking this course. A group is one program
// track's students, or the individual learners who enrolled in one month.
export default async function LmsCourseReportHubPage({ params }: Props) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const { courseId } = await params
  if (!(await canSeeCourse(scope, courseId))) notFound()

  const { data: course } = await db.from("lms_courses").select("id, title, delivery_mode").eq("id", courseId).maybeSingle()
  if (!course) notFound()

  const rows = await selectAll<any>((f, t) => db.from("lms_enrollments")
    .select("status, enrolled_at, program_id, lms_programs(name, status, is_individual, start_date, end_date, lms_companies(name)), lms_program_members(track_id)")
    .eq("course_id", courseId).neq("status", "dropped").range(f, t))
  const trackIds = [...new Set(rows.map(r => r.lms_program_members?.track_id).filter(Boolean))] as string[]
  const { data: tracks } = trackIds.length ? await db.from("lms_program_tracks").select("id, name").in("id", trackIds) : { data: [] as any[] }
  const trackName = new Map(((tracks ?? []) as any[]).map(t => [t.id, t.name]))

  type G = { key: string; label: string; sub: string; href: string; live: boolean; learners: number; completed: number; sort: string; pdf: string | null }
  const groups = new Map<string, G>()
  for (const r of rows) {
    const p = r.lms_programs
    const inProgram = r.program_id && p && !p.is_individual
    if (inProgram) {
      const tr = r.lms_program_members?.track_id ?? null
      if (!scope.isAdmin && !canSeeTrack(scope, r.program_id, tr)) continue
      const key = `${r.program_id}:${tr ?? "-"}`
      const q = `program=${r.program_id}${tr ? `&track=${tr}` : ""}`
      if (!groups.has(key)) groups.set(key, {
        key, label: `${p.name}${tr ? ` · ${trackName.get(tr) ?? "Track"}` : ""}`,
        sub: [p.lms_companies?.name, `${fmtMonth(p.start_date)} – ${fmtMonth(p.end_date)}`].filter(Boolean).join(" · "),
        href: `/lms-admin/reports/${courseId}/group?${q}`, live: p.status === "active",
        learners: 0, completed: 0, sort: p.start_date ?? "", pdf: scope.isAdmin ? `/api/lms/reports/course/${courseId}/pdf?${q}` : null,
      })
      const g = groups.get(key)!; g.learners++; if (r.status === "completed") g.completed++
    } else if (scope.isAdmin) {
      const m = String(r.enrolled_at).slice(0, 7)
      const key = `month:${m}`
      if (!groups.has(key)) groups.set(key, {
        key, label: `Individual learners · ${monthName(m)}`, sub: "Enrolled outside a company program",
        href: `/lms-admin/reports/${courseId}/group?month=${m}`, live: false,
        learners: 0, completed: 0, sort: m + "-01", pdf: `/api/lms/reports/course/${courseId}/pdf?month=${m}`,
      })
      const g = groups.get(key)!; g.learners++; if (r.status === "completed") g.completed++
      if (r.status === "active") g.live = true
    }
  }
  const list = [...groups.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.sort.localeCompare(a.sort))

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports?tab=courses" aria-label="Back to courses" className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><BookOpen className="h-5 w-5 text-emerald-600" /></div>
        <div>
          <h2 className="text-xl font-bold leading-tight">{(course as any).title}</h2>
          <p className="text-muted-foreground text-sm"><span className="capitalize">{(course as any).delivery_mode}</span> · {list.length} group{list.length === 1 ? "" : "s"} · {rows.length} learners</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-14 text-center text-muted-foreground">Nobody has taken this course yet.</div>
      ) : (
        <LevelNav
          title="Groups taking this course" hint="Each group is its own report — groups never mix"
          columns={["Learners", "Completed", "Completion"]} pastLabel="Finished groups"
          rows={list.map(g => ({
            id: g.key, label: g.label, sub: g.sub, href: g.href, live: g.live, pdfHref: g.pdf,
            cells: [g.learners, g.completed, levelPct(g.learners ? Math.round((g.completed / g.learners) * 100) : null)],
          }))}
        />
      )}

      {scope.isAdmin && list.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/lms-admin/reports/${courseId}/group?scope=all`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
            <BarChart3 className="h-4 w-4 text-slate-400" /> All groups combined (course analytics)
          </Link>
          <Link href={`/lms-admin/reports/${courseId}/individuals`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
            <User className="h-4 w-4 text-slate-400" /> Every learner of this course
          </Link>
        </div>
      )}
    </div>
  )
}
