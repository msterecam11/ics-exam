import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import {
  BookOpen, Users, GraduationCap, CalendarDays,
  TrendingUp, CheckCircle2, ArrowRight,
  Activity, Radio, AlertCircle, ClipboardList, AlertTriangle, UserX, Clock, Award, MessageSquare, FolderKanban,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { isMgr } from "@/lib/staff-roles"
import { pageScope } from "@/lib/staff-access"
import { selectAll } from "@/lib/lms-report-cache"
import { completionRate } from "@/lib/lms-metrics"
import { loadReportsHome, ATTENTION, type AttentionKind } from "@/lib/lms-reports-home"
import InstructorDashboard from "@/components/lms/InstructorDashboard"
import DashboardFilters from "@/components/lms/DashboardFilters"
import {
  EnrollmentTrendChart,
  ProgressDonutChart,
  CoursePerformanceChart,
  type TrendPoint,
  type CourseStat,
  type ProgressDist,
} from "@/components/lms/DashboardCharts"

export const metadata = { title: "LMS Dashboard – ICS Admin" }
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERIODS = { "30d": { days: 30, label: "last 30 days" }, "90d": { days: 90, label: "last 90 days" }, year: { days: 365, label: "last 12 months" } } as const
const ATT_ICON: Record<AttentionKind, any> = { behind: AlertTriangle, inactive: UserX, deadlines: Clock, certificates: Award, feedback: MessageSquare }

type SP = { company?: string; program?: string; course?: string; period?: string }

export default async function LmsAdminDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // IR-3 — this dashboard counts every student, course and enrollment in the
  // LMS, which is exactly what an instructor must not see. They get their own.
  if (!isMgr(session.user.role)) {
    const scope = await pageScope()
    if (!scope) redirect("/auth/login")
    return <InstructorDashboard scope={scope} name={session.user.name} />
  }
  const scope = (await pageScope())!

  const sp = await searchParams
  const f = {
    company: UUID_RE.test(sp.company ?? "") ? sp.company! : "",
    program: UUID_RE.test(sp.program ?? "") ? sp.program! : "",
    course: UUID_RE.test(sp.course ?? "") ? sp.course! : "",
    period: (sp.period && sp.period in PERIODS ? sp.period : "30d") as keyof typeof PERIODS,
  }
  const filtered = !!(f.company || f.program || f.course)
  const now = new Date()

  // ── Filter options ───────────────────────────────────────────────
  const [{ data: companyRows }, { data: programRows }, { data: courseRows }, { data: items }] = await Promise.all([
    db.from("lms_companies").select("id, name").order("name"),
    db.from("lms_programs").select("id, name, company_id, status, is_individual, end_date").neq("status", "draft").eq("is_individual", false).order("name"),
    db.from("lms_courses").select("id, title").neq("status", "archived").order("title"),
    db.from("lms_program_items").select("program_id, course_id, path_id"),
  ])
  const programs = (programRows ?? []) as any[]
  const programCourses: Record<string, string[]> = {}
  for (const i of (items ?? []) as any[]) if (i.course_id) (programCourses[i.program_id] ??= []).push(i.course_id)
  const companies = ((companyRows ?? []) as any[]).filter(c => programs.some(p => p.company_id === c.id))
  if (f.program && !f.company) f.company = programs.find(p => p.id === f.program)?.company_id ?? ""
  const courseTitle = new Map(((courseRows ?? []) as any[]).map(c => [c.id, c.title as string]))

  // Programs in the selection (null = no program filter).
  const programIds: string[] | null = f.program ? [f.program] : f.company ? programs.filter(p => p.company_id === f.company).map(p => p.id) : null

  // ── Enrollments in the selection ─────────────────────────────────
  const enrollments = await selectAll<any>((from, to) => {
    let q = db.from("lms_enrollments").select("id, student_id, course_id, program_id, status, progress_pct, enrolled_at, completed_at").order("enrolled_at")
    if (programIds) q = q.in("program_id", programIds.length ? programIds : ["00000000-0000-0000-0000-000000000000"])
    if (f.course) q = q.eq("course_id", f.course)
    return q.range(from, to)
  })
  const live = enrollments.filter(e => e.status !== "dropped")
  const active = enrollments.filter(e => e.status === "active").length
  const completed = enrollments.filter(e => e.status === "completed").length
  const dropped = enrollments.filter(e => e.status === "dropped").length
  const completion = completionRate(enrollments).rate

  const [{ count: allStudents }, { count: allCourses }] = filtered
    ? [{ count: new Set(live.map(e => e.student_id)).size }, { count: new Set(live.map(e => e.course_id)).size }]
    : await Promise.all([
        db.from("lms_students").select("*", { count: "exact", head: true }),
        db.from("lms_courses").select("*", { count: "exact", head: true }).neq("status", "archived"),
      ])

  let pq = db.from("lms_assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted")
  if (filtered) pq = pq.in("enrollment_id", enrollments.length ? enrollments.map(e => e.id).slice(0, 1000) : ["00000000-0000-0000-0000-000000000000"])
  const { count: pendingAssignments } = await pq

  // ── Enrollment trend over the period (day / week / month buckets) ─
  const period = PERIODS[f.period]
  const since = new Date(now.getTime() - period.days * 86_400_000)
  const bucket = f.period === "30d" ? "day" : f.period === "90d" ? "week" : "month"
  const keyOf = (d: Date) => bucket === "day" ? d.toISOString().slice(0, 10)
    : bucket === "month" ? d.toISOString().slice(0, 7)
    : new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
  const trendMap = new Map<string, number>()
  for (let t = since.getTime(); t <= now.getTime(); t += 86_400_000) trendMap.set(keyOf(new Date(t)), 0)
  for (const e of enrollments) { const d = new Date(e.enrolled_at); if (d >= since) { const k = keyOf(d); if (trendMap.has(k)) trendMap.set(k, trendMap.get(k)! + 1) } }
  const enrollmentTrend: TrendPoint[] = [...trendMap].map(([k, count]) => ({
    date: bucket === "month" ? new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
      : new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    count,
  }))

  // ── Course performance (courses in the selection) ────────────────
  const byCourse = new Map<string, any[]>()
  for (const e of enrollments) { if (!byCourse.has(e.course_id)) byCourse.set(e.course_id, []); byCourse.get(e.course_id)!.push(e) }
  const courseStats: CourseStat[] = [...byCourse].map(([id, rows]) => {
    const c = completionRate(rows)
    const title = courseTitle.get(id) ?? "Course"
    return { title: title.length > 28 ? title.slice(0, 28) + "…" : title, total: c.counted, completed: c.completed, rate: c.rate ?? 0 }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 8)

  const progressDist: ProgressDist[] = [
    { name: "Active", value: active, color: "#1B4F8A" },
    { name: "Completed", value: completed, color: "#22c55e" },
    { name: "Withdrawn", value: dropped, color: "#cbd5e1" },
  ].filter(d => d.value > 0)

  // ── Feeds: recent enrollments and completions in the selection ──
  const recentEnr = [...enrollments].sort((a, b) => String(b.enrolled_at).localeCompare(String(a.enrolled_at))).slice(0, 6)
  const recentDone = enrollments.filter(e => e.status === "completed" && e.completed_at).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 6)
  const feedIds = [...new Set([...recentEnr, ...recentDone].map(e => e.student_id))]
  const { data: feedStudents } = feedIds.length ? await db.from("lms_students").select("id, name").in("id", feedIds) : { data: [] as any[] }
  const studentName = new Map(((feedStudents ?? []) as any[]).map(s => [s.id, s.name as string]))
  const { data: certRows } = recentDone.length ? await db.from("lms_certificates").select("enrollment_id").in("enrollment_id", recentDone.map(e => e.id)) : { data: [] as any[] }
  const certified = new Set(((certRows ?? []) as any[]).map(c => c.enrollment_id))

  // ── Running programs in the selection ────────────────────────────
  const running = programs.filter(p => p.status === "active" && (!programIds || programIds.includes(p.id)))
    .map(p => {
      const rows = enrollments.filter(e => e.program_id === p.id && e.status !== "dropped")
      return { ...p, students: new Set(rows.map(e => e.student_id)).size, progress: rows.length ? Math.round(rows.reduce((a, e) => a + (e.status === "completed" ? 100 : Number(e.progress_pct ?? 0)), 0) / rows.length) : null }
    })
    .filter(p => !f.course || p.students > 0)
    .sort((a, b) => String(a.end_date ?? "9999").localeCompare(String(b.end_date ?? "9999"))).slice(0, 6)

  // ── Needs attention (same lists as Reports), narrowed to the selection ─
  const home = await loadReportsHome(scope, "all")
  const inSel = (i: { programId: string | null; courseId: string }) =>
    (!programIds || (i.programId !== null && programIds.includes(i.programId))) && (!f.course || i.courseId === f.course)
  const attention = (Object.keys(ATTENTION) as AttentionKind[]).map(k => ({ kind: k, n: home.lists[k].filter(inSel).length }))

  // ── Upcoming sessions in the selection ───────────────────────────
  let sq = db.from("lms_sessions")
    .select(`id, title, session_date, start_time, duration_minutes, location, closed_at, course_id, program_id, lms_courses(title)`)
    .gte("session_date", now.toISOString().slice(0, 10)).order("session_date").order("start_time").limit(5)
  if (programIds) sq = sq.in("program_id", programIds.length ? programIds : ["00000000-0000-0000-0000-000000000000"])
  if (f.course) sq = sq.eq("course_id", f.course)
  const { data: upcomingSessions } = await sq
  const todayStr = now.toISOString().slice(0, 10)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const filteredUpcoming = ((upcomingSessions ?? []) as any[]).filter(s => {
    if (s.closed_at) return false
    if (s.session_date === todayStr) {
      const [h, m] = (s.start_time ?? "00:00").split(":").map(Number)
      if (h * 60 + m + (s.duration_minutes ?? 0) < nowMinutes) return false
    }
    return true
  })
  const openSessions = filteredUpcoming.filter(s => s.session_date === todayStr)

  const selName = f.program ? programs.find(p => p.id === f.program)?.name : f.company ? companies.find(c => c.id === f.company)?.name : null
  const scopeLabel = [selName, f.course ? courseTitle.get(f.course) : null].filter(Boolean).join(" · ")
  const stats = [
    { label: filtered ? "Students" : "Total Students", value: allStudents ?? 0, icon: Users, color: "text-[#1B4F8A]", bg: "bg-[#1B4F8A]/10", href: "/lms-admin/students", sub: filtered ? "in this selection" : "registered accounts" },
    { label: filtered ? "Courses" : "Active Courses", value: allCourses ?? 0, icon: BookOpen, color: "text-emerald-600", bg: "bg-emerald-50", href: "/lms-admin/courses", sub: filtered ? "taken in this selection" : "draft + published" },
    { label: "Active Enrollments", value: active, icon: Activity, color: "text-amber-600", bg: "bg-amber-50", href: "/lms-admin/reports", sub: `${completed} completed` },
    { label: "Completion Rate", value: completion === null ? "—" : `${completion}%`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50", href: "/lms-admin/reports", sub: "completed ÷ enrolled (withdrawn excluded)" },
    { label: "Pending Grades", value: pendingAssignments ?? 0, icon: ClipboardList, color: (pendingAssignments ?? 0) > 0 ? "text-rose-600" : "text-slate-400", bg: (pendingAssignments ?? 0) > 0 ? "bg-rose-50" : "bg-slate-100", href: "/lms-admin/courses", sub: "assignments to review" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Good {getTimeOfDay()}, {session.user.name?.split(" ")[0]} 👋</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {scopeLabel ? <>Showing <span className="font-medium text-slate-700">{scopeLabel}</span>.</> : <>Here&apos;s what&apos;s happening across the Learning Management System.</>}
        </p>
      </div>

      <DashboardFilters
        value={{ company: f.company, program: f.program, course: f.course, period: f.period }}
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        programs={programs.map(p => ({ id: p.id, name: p.name, company_id: p.company_id }))}
        courses={((courseRows ?? []) as any[]).map(c => ({ id: c.id, name: c.title }))}
        programCourses={programCourses}
      />

      {openSessions.length > 0 && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Radio className="h-5 w-5 text-emerald-600 animate-pulse shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">{openSessions.length} Live Session{openSessions.length > 1 ? "s" : ""} Open Right Now</p>
            <p className="text-xs text-emerald-600">{openSessions.map(s => s.title).join(" · ")}</p>
          </div>
          <Link href="/lms-admin/sessions" className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1 shrink-0">View <ArrowRight className="h-3 w-3" /></Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Link key={s.label} href={s.href} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all group">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", s.bg)}><Icon className={cn("h-5 w-5", s.color)} /></div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">{s.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-slate-400 group-hover:text-[#1B4F8A] transition-colors"><span>View</span><ArrowRight className="h-3 w-3" /></div>
            </Link>
          )
        })}
      </div>

      {/* Needs attention */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention</h2>
          <Link href="/lms-admin/reports" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">Reports <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {attention.map(a => {
            const Icon = ATT_ICON[a.kind]
            return (
              <Link key={a.kind} href={`/lms-admin/reports/attention?kind=${a.kind}`}
                className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", a.n ? "border-amber-100 bg-amber-50/60 text-amber-900 hover:bg-amber-50" : "border-slate-100 bg-slate-50 text-slate-400 hover:bg-slate-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-bold tabular-nums">{a.n}</span>
                <span className="text-xs leading-tight">{ATTENTION[a.kind].label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><EnrollmentTrendChart data={enrollmentTrend} periodLabel={period.label} /></div>
        <div><ProgressDonutChart data={progressDist} /></div>
      </div>

      {courseStats.length > 0 && <CoursePerformanceChart data={courseStats} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running programs */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><FolderKanban className="h-4 w-4 text-[#1B4F8A]" /> Running programs</h2>
            <Link href="/lms-admin/programs" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">All <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {running.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">No running programs in this selection</div> : running.map(p => (
              <Link key={p.id} href={`/lms-admin/reports/programs/${p.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.students} students{p.end_date ? ` · ends ${new Date(p.end_date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 w-32">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#1B4F8A]" style={{ width: `${p.progress ?? 0}%` }} /></div>
                  <span className="text-xs font-semibold text-slate-600 w-8 text-right">{p.progress ?? 0}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Upcoming sessions */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#1B4F8A]" /> Upcoming Sessions</h2>
            <Link href="/lms-admin/sessions" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">All <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {filteredUpcoming.length === 0 ? (
              <div className="px-5 py-8 text-center"><CalendarDays className="h-8 w-8 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-400">No upcoming sessions</p></div>
            ) : filteredUpcoming.map(s => {
              const isToday = s.session_date === todayStr
              return (
                <Link key={s.id} href={`/lms-admin/sessions/${s.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-xs font-bold bg-emerald-100 text-emerald-700">
                    <span className="text-[10px] uppercase">{new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}</span>
                    <span className="text-base leading-none">{new Date(s.session_date + "T00:00:00").getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.title}</p>
                      {isToday && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0"><Radio className="h-2.5 w-2.5 animate-pulse" /> LIVE</span>}
                    </div>
                    <p className="text-xs text-slate-400">{s.start_time?.slice(0, 5)} · {s.lms_courses?.title}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent enrollments */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><GraduationCap className="h-4 w-4 text-[#1B4F8A]" /> Recent Enrollments</h2>
            <Link href="/lms-admin/students" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">All <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentEnr.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">No enrollments in this selection</div> : recentEnr.map(e => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-xs flex items-center justify-center shrink-0">{studentName.get(e.student_id)?.[0]?.toUpperCase() ?? "?"}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{studentName.get(e.student_id) ?? "—"}</p>
                  <p className="text-xs text-slate-400 truncate">{courseTitle.get(e.course_id) ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge className={cn("text-xs border-0 capitalize", { "bg-blue-100 text-blue-700": e.status === "active", "bg-emerald-100 text-emerald-700": e.status === "completed", "bg-slate-100 text-slate-400": e.status === "dropped" })}>{e.status === "dropped" ? "withdrawn" : e.status}</Badge>
                  <p className="text-[10px] text-slate-300 mt-1">{formatRelative(e.enrolled_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent completions */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Recent Completions</h2>
            <Link href="/lms-admin/reports" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">Reports <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentDone.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">No course completed in this selection yet</div> : recentDone.map(e => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate"><span className="font-medium">{studentName.get(e.student_id) ?? "—"}</span> completed <span className="font-medium">{courseTitle.get(e.course_id) ?? "a course"}</span></p>
                  <p className="text-xs text-slate-400">{certified.has(e.id) ? "certificate issued · " : ""}{formatRelative(e.completed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 text-sm mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Add Course", href: "/lms-admin/courses/new", icon: BookOpen },
            { label: "Add Student", href: "/lms-admin/students", icon: Users },
            { label: "Live Sessions", href: "/lms-admin/sessions", icon: CalendarDays },
            { label: "Question Bank", href: "/lms-admin/questions", icon: AlertCircle },
          ].map(a => {
            const Icon = a.icon
            return (
              <Link key={a.label} href={a.href} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-[#1B4F8A]/5 hover:text-[#1B4F8A] text-slate-600 text-sm font-medium transition-colors border border-transparent hover:border-[#1B4F8A]/20">
                <Icon className="h-4 w-4" />{a.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  return "evening"
}

function formatRelative(iso: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
