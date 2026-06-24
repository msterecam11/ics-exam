import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import {
  BookOpen, Users, GraduationCap, CalendarDays,
  TrendingUp, CheckCircle2, ArrowRight,
  Activity, Radio, AlertCircle, ClipboardList,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  EnrollmentTrendChart,
  ProgressDonutChart,
  CoursePerformanceChart,
  type TrendPoint,
  type CourseStat,
  type ProgressDist,
} from "@/components/lms/DashboardCharts"

export const metadata = { title: "LMS Dashboard – ICS Admin" }

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

export default async function LmsAdminDashboard() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date()

  // ── Parallel data fetches ────────────────────────────────────────
  const [
    { count: totalStudents },
    { count: totalCourses },
    { count: activeEnrollments },
    { count: completedEnrollments },
    { data: recentEnrollments },
    { data: upcomingSessions },
    { data: recentActivity },
    { data: rawTrend },
    { data: courseRaw },
    { count: pendingAssignments },
  ] = await Promise.all([
    db.from("lms_students").select("*", { count: "exact", head: true }),
    db.from("lms_courses").select("*", { count: "exact", head: true }).neq("status", "archived"),
    db.from("lms_enrollments").select("*", { count: "exact", head: true }).eq("status", "active"),
    db.from("lms_enrollments").select("*", { count: "exact", head: true }).eq("status", "completed"),
    // Recent enrollments
    db.from("lms_enrollments")
      .select(`enrolled_at, status, lms_students(name, email), lms_courses(title)`)
      .order("enrolled_at", { ascending: false })
      .limit(6),
    // Upcoming sessions
    db.from("lms_sessions")
      .select(`id, title, session_date, start_time, duration_minutes, location, closed_at, course_id, lms_courses(title)`)
      .gte("session_date", now.toISOString().slice(0, 10))
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(5),
    // Recent completions
    db.from("lms_progress")
      .select(`updated_at, status, lms_students(name), lms_content_items(title, type)`)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(6),
    // Enrollment trend — last 30 days
    db.from("lms_enrollments")
      .select("enrolled_at")
      .gte("enrolled_at", thirtyDaysAgo)
      .order("enrolled_at", { ascending: true }),
    // Per-course stats
    db.from("lms_courses")
      .select(`id, title, lms_enrollments(status)`)
      .neq("status", "archived")
      .limit(8),
    // Pending assignment submissions (submitted, not yet graded)
    db.from("lms_assignment_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
  ])

  // ── Process enrollment trend ─────────────────────────────────────
  const trendMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    trendMap[d.toISOString().slice(0, 10)] = 0
  }
  for (const e of rawTrend ?? []) {
    const day = (e.enrolled_at as string).slice(0, 10)
    if (day in trendMap) trendMap[day] = (trendMap[day] ?? 0) + 1
  }
  const enrollmentTrend: TrendPoint[] = Object.entries(trendMap).map(([date, count]) => ({
    date: new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    count,
  }))

  // ── Process course performance ───────────────────────────────────
  const courseStats: CourseStat[] = (courseRaw ?? [])
    .map((c: any) => {
      const enrollments = (c.lms_enrollments ?? []) as { status: string }[]
      const total     = enrollments.length
      const completed = enrollments.filter(e => e.status === "completed").length
      return {
        title:     c.title.length > 28 ? c.title.slice(0, 28) + "…" : c.title,
        total,
        completed,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    })
    .sort((a: CourseStat, b: CourseStat) => b.total - a.total)

  // ── Progress distribution ────────────────────────────────────────
  const active    = activeEnrollments    ?? 0
  const completed = completedEnrollments ?? 0
  const dropped   = 0 // could add later
  const progressDist: ProgressDist[] = [
    { name: "Active",    value: active,    color: "#1B4F8A" },
    { name: "Completed", value: completed, color: "#22c55e" },
    { name: "Dropped",   value: dropped,   color: "#e2e8f0" },
  ].filter(d => d.value > 0)

  const completionRate =
    active + completed > 0
      ? Math.round((completed / (active + completed)) * 100)
      : 0

  // Filter upcoming sessions: exclude closed ones and today's sessions that have already ended
  const todayStr   = now.toISOString().slice(0, 10)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const filteredUpcoming = (upcomingSessions ?? []).filter((s: any) => {
    if (s.closed_at) return false
    if (s.session_date === todayStr) {
      const [h, m] = (s.start_time ?? "00:00").split(":").map(Number)
      const endMins = h * 60 + m + (s.duration_minutes ?? 0)
      if (endMins < nowMinutes) return false
    }
    return true
  })

  const openSessions = filteredUpcoming.filter(
    (s: any) => s.session_date === todayStr && !s.closed_at
  )

  const stats = [
    {
      label: "Total Students",
      value: totalStudents ?? 0,
      icon:  Users,
      color: "text-[#1B4F8A]",
      bg:    "bg-[#1B4F8A]/10",
      href:  "/lms-admin/students",
      sub:   "registered accounts",
    },
    {
      label: "Active Courses",
      value: totalCourses ?? 0,
      icon:  BookOpen,
      color: "text-emerald-600",
      bg:    "bg-emerald-50",
      href:  "/lms-admin/courses",
      sub:   "draft + published",
    },
    {
      label: "Active Enrollments",
      value: active,
      icon:  Activity,
      color: "text-amber-600",
      bg:    "bg-amber-50",
      href:  "/lms-admin/reports",
      sub:   `${completed} completed`,
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      icon:  TrendingUp,
      color: "text-indigo-600",
      bg:    "bg-indigo-50",
      href:  "/lms-admin/reports",
      sub:   "completed ÷ all enrolled",
    },
    {
      label: "Pending Grades",
      value: pendingAssignments ?? 0,
      icon:  ClipboardList,
      color: (pendingAssignments ?? 0) > 0 ? "text-rose-600" : "text-slate-400",
      bg:    (pendingAssignments ?? 0) > 0 ? "bg-rose-50" : "bg-slate-100",
      href:  "/lms-admin/courses",
      sub:   "assignments to review",
    },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Good {getTimeOfDay()}, {session.user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Here&apos;s what&apos;s happening across the Learning Management System.
        </p>
      </div>

      {/* Live session alert */}
      {openSessions.length > 0 && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Radio className="h-5 w-5 text-emerald-600 animate-pulse shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">
              {openSessions.length} Live Session{openSessions.length > 1 ? "s" : ""} Open Right Now
            </p>
            <p className="text-xs text-emerald-600">
              {(openSessions as any[]).map((s: any) => s.title).join(" · ")}
            </p>
          </div>
          <Link href="/lms-admin/sessions" className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1 shrink-0">
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <Link
              key={s.label}
              href={s.href}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition-all group"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", s.bg)}>
                <Icon className={cn("h-5 w-5", s.color)} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">{s.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-slate-400 group-hover:text-[#1B4F8A] transition-colors">
                <span>View</span><ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* Charts row 1 — Trend + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <EnrollmentTrendChart data={enrollmentTrend} />
        </div>
        <div>
          <ProgressDonutChart data={progressDist} />
        </div>
      </div>

      {/* Charts row 2 — Course performance */}
      <CoursePerformanceChart data={courseStats} />

      {/* Feeds row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Enrollments */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-[#1B4F8A]" /> Recent Enrollments
            </h2>
            <Link href="/lms-admin/students" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(recentEnrollments ?? []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No enrollments yet</div>
            ) : (
              (recentEnrollments ?? []).map((e: any, i: number) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-xs flex items-center justify-center shrink-0">
                    {e.lms_students?.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{e.lms_students?.name ?? "—"}</p>
                    <p className="text-xs text-slate-400 truncate">{e.lms_courses?.title ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={cn("text-xs border-0 capitalize", {
                      "bg-blue-100 text-blue-700":       e.status === "active",
                      "bg-emerald-100 text-emerald-700": e.status === "completed",
                      "bg-slate-100 text-slate-400":     e.status === "dropped",
                    })}>
                      {e.status}
                    </Badge>
                    <p className="text-[10px] text-slate-300 mt-1">{formatRelative(e.enrolled_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#1B4F8A]" /> Upcoming Sessions
            </h2>
            <Link href="/lms-admin/sessions" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {filteredUpcoming.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarDays className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No upcoming sessions</p>
              </div>
            ) : (
              filteredUpcoming.map((s: any) => {
                const isOpen  = !s.closed_at
                const isToday = s.session_date === now.toISOString().slice(0, 10)
                return (
                  <Link key={s.id} href={`/lms-admin/sessions/${s.id}`}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-xs font-bold",
                      isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      <span className="text-[10px] uppercase">
                        {new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}
                      </span>
                      <span className="text-base leading-none">
                        {new Date(s.session_date + "T00:00:00").getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.title}</p>
                        {isOpen && isToday && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
                            <Radio className="h-2.5 w-2.5 animate-pulse" /> LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{s.start_time?.slice(0, 5)} · {(s.lms_courses as any)?.title}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </Link>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Completions */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#1B4F8A]" /> Recent Completions
          </h2>
          <Link href="/lms-admin/reports" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-0.5">
            Reports <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {(recentActivity ?? []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No activity yet — students haven&apos;t started courses
            </div>
          ) : (
            (recentActivity ?? []).map((a: any, i: number) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{a.lms_students?.name ?? "—"}</span>
                    {" "}completed{" "}
                    <span className="font-medium">{a.lms_content_items?.title ?? "—"}</span>
                  </p>
                  <p className="text-xs text-slate-400 capitalize">
                    {a.lms_content_items?.type ?? "—"} · {formatRelative(a.updated_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 text-sm mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Add Course",     href: "/lms-admin/courses/new", icon: BookOpen     },
            { label: "Add Student",    href: "/lms-admin/students",    icon: Users        },
            { label: "Live Sessions",  href: "/lms-admin/sessions",    icon: CalendarDays },
            { label: "Question Bank",  href: "/lms-admin/questions",   icon: AlertCircle  },
          ].map(a => {
            const Icon = a.icon
            return (
              <Link key={a.label} href={a.href}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-[#1B4F8A]/5 hover:text-[#1B4F8A] text-slate-600 text-sm font-medium transition-colors border border-transparent hover:border-[#1B4F8A]/20">
                <Icon className="h-4 w-4" />
                {a.label}
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
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 1)   return "just now"
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
