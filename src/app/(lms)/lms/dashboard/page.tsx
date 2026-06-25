import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  BookOpen, CheckCircle2, Clock, ArrowRight,
  MapPin, Video, TrendingUp, AlertTriangle,
  ClipboardList, PlayCircle, Calendar, Flame,
  GraduationCap, Award, Rocket, Route, Users, GitBranch,
} from "lucide-react"
import { cn } from "@/lib/utils"

export default async function StudentDashboard() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // ── Step 1: enrollments ───────────────────────────────────────
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select(`
      id, status, enrolled_at, completed_at, progress_pct,
      lms_courses(id, title, description, delivery_mode, thumbnail_url, end_date, start_date)
    `)
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false })

  const courseIds = (enrollments ?? []).map((e: any) => e.lms_courses?.id).filter(Boolean)
  const today     = new Date().toISOString().slice(0, 10)

  // ── Step 2: all queries in parallel ──────────────────────────
  const [
    lastProgressResult,
    sessionsResult,
    assignmentItemsResult,
    lastLoginResult,
    recentProgResult,
    cohortMembersResult,
  ] = await Promise.all([
    db.from("lms_progress")
      .select("content_item_id, course_id, updated_at, position, lms_content_items(id, title, type)")
      .eq("student_id", student.id).eq("status", "in_progress")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),

    courseIds.length
      ? db.from("lms_sessions")
          .select("id, title, session_date, start_time, location, meeting_link, course_id, duration_minutes")
          .in("course_id", courseIds).gte("session_date", today)
          .is("closed_at", null)
          .order("session_date", { ascending: true }).order("start_time", { ascending: true })
          .limit(6)
      : Promise.resolve({ data: [] }),

    courseIds.length
      ? db.from("lms_content_items").select("id, title, course_id")
          .in("course_id", courseIds).eq("type", "assignment")
      : Promise.resolve({ data: [] }),

    db.from("lms_students").select("last_login").eq("id", student.id).single(),

    db.from("lms_progress")
      .select("content_item_id, course_id, updated_at, lms_content_items(title, type)")
      .eq("student_id", student.id).eq("status", "completed")
      .order("updated_at", { ascending: false }).limit(4),

    // Cohort memberships with cohort info + learning path
    db.from("lms_cohort_members")
      .select("id, track_id, cohort_id, lms_cohorts(id, name, mode, start_date, end_date, learning_path_id)")
      .eq("student_id", student.id)
      .eq("is_active", true),
  ])

  // Progress is stored in lms_enrollments.progress_pct by syncEnrollmentProgress
  const progressMap: Record<string, number> = {}
  for (const e of enrollments ?? []) {
    const cid = (e as any).lms_courses?.id
    if (cid) progressMap[cid] = (e as any).progress_pct ?? 0
  }

  // ── Cohorts & learning paths ─────────────────────────────────
  const cohortMembers = (cohortMembersResult.data ?? []) as any[]
  const cohorts = cohortMembers.map((m: any) => ({
    memberId:  m.id,
    trackId:   m.track_id ?? null,
    cohortId:  m.cohort_id,
    name:      (m.lms_cohorts as any)?.name ?? "Cohort",
    mode:      (m.lms_cohorts as any)?.mode ?? "unified",
    startDate: (m.lms_cohorts as any)?.start_date ?? null,
    endDate:   (m.lms_cohorts as any)?.end_date   ?? null,
    lpId:      (m.lms_cohorts as any)?.learning_path_id ?? null,
  }))

  // Fetch learning paths referenced by cohorts
  const lpIds = [...new Set(cohorts.map(c => c.lpId).filter(Boolean))] as string[]
  let learningPaths: any[] = []
  if (lpIds.length) {
    const { data: lpRows } = await db
      .from("lms_learning_paths")
      .select("id, title, description")
      .in("id", lpIds)

    const { data: lpCourseRows } = await db
      .from("lms_learning_path_courses")
      .select("learning_path_id, order_index, lms_courses(id, title)")
      .in("learning_path_id", lpIds)
      .order("order_index", { ascending: true })

    learningPaths = (lpRows ?? []).map((lp: any) => {
      const courses = (lpCourseRows ?? [])
        .filter((r: any) => r.learning_path_id === lp.id)
        .map((r: any) => ({
          id:       r.lms_courses?.id,
          title:    r.lms_courses?.title ?? "Untitled",
          progress: progressMap[r.lms_courses?.id] ?? 0,
        }))
      const overallPct = courses.length
        ? Math.round(courses.reduce((a: number, c: any) => a + c.progress, 0) / courses.length)
        : 0
      const nextCourseInPath = courses.find((c: any) => c.progress < 100)
      return { id: lp.id, title: lp.title, courses, overallPct, nextCourseInPath }
    })
  }

  // ── Pending assignments ───────────────────────────────────────
  const assignmentItems = (assignmentItemsResult.data ?? []) as any[]
  let pendingAssignments: any[] = []
  if (assignmentItems.length) {
    const { data: subs } = await db
      .from("lms_assignment_submissions")
      .select("content_item_id")
      .eq("student_id", student.id)
      .in("content_item_id", assignmentItems.map((a: any) => a.id))
    const submittedIds = new Set((subs ?? []).map((s: any) => s.content_item_id))
    pendingAssignments = assignmentItems.filter((a: any) => !submittedIds.has(a.id))
  }

  // ── Derived ───────────────────────────────────────────────────
  const resumeItem       = lastProgressResult.data as any
  const sessions         = (sessionsResult.data ?? []) as any[]
  const todaySessions    = sessions.filter(s => s.session_date === today)
  const upcomingSessions = sessions.filter(s => s.session_date > today)
  const recentProg       = (recentProgResult.data ?? []) as any[]
  const active           = (enrollments ?? []).filter((e: any) => e.status === "active")
  const completed        = (enrollments ?? []).filter((e: any) => e.status === "completed")

  const deadlineWarnings = active
    .filter((e: any) => {
      const end = e.lms_courses?.end_date
      if (!end) return false
      const d = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
      return d >= 0 && d <= 7
    })
    .map((e: any) => ({
      title:    e.lms_courses?.title,
      courseId: e.lms_courses?.id,
      daysLeft: Math.ceil((new Date(e.lms_courses.end_date).getTime() - Date.now()) / 86_400_000),
    }))

  const daysSinceLogin = (lastLoginResult as any).data?.last_login
    ? Math.floor((Date.now() - new Date((lastLoginResult as any).data.last_login).getTime()) / 86_400_000)
    : null

  // First name only
  const firstName = student.name?.split(" ")[0] ?? "there"

  function fmtTime(t: string) { return t?.slice(0, 5) ?? "" }

  // ── Find "next to start" course (0% or lowest progress) ──────
  const nextCourse = active.length > 0
    ? active.reduce((best: any, e: any) => {
        const pct = progressMap[e.lms_courses?.id] ?? 0
        const bestPct = progressMap[best?.lms_courses?.id] ?? 0
        return pct < bestPct ? e : best
      }, active[0])
    : null
  const nextCoursePct = nextCourse ? (progressMap[nextCourse.lms_courses?.id] ?? 0) : 0

  return (
    <div className="p-5 space-y-5">

      {/* ── Welcome header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {daysSinceLogin === 0 || daysSinceLogin === null
              ? `Welcome back, ${firstName} 👋`
              : `Good to see you, ${firstName}!`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {active.length === 0
              ? "You have no active courses yet."
              : active.length === 1
                ? `You have 1 active course${sessions.length > 0 ? ` · ${sessions.length} upcoming session${sessions.length !== 1 ? "s" : ""}` : ""}`
                : `You have ${active.length} active courses${sessions.length > 0 ? ` · ${sessions.length} upcoming session${sessions.length !== 1 ? "s" : ""}` : ""}`}
          </p>
        </div>
        {completed.length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            <Award className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-700">{completed.length} certificate{completed.length !== 1 ? "s" : ""} earned</span>
          </div>
        )}
      </div>

      {/* ── Today's session banner ──────────────────────────────── */}
      {todaySessions.length > 0 && (
        <div className="bg-gradient-to-r from-[#1B4F8A] to-[#2563EB] rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Today's Session</p>
            <p className="text-white font-semibold text-sm mt-0.5 truncate">{todaySessions[0].title}</p>
            <p className="text-white/60 text-xs mt-0.5">
              {fmtTime(todaySessions[0].start_time)}
              {todaySessions[0].location && ` · ${todaySessions[0].location}`}
            </p>
          </div>
          {todaySessions[0].meeting_link ? (
            <a href={todaySessions[0].meeting_link} target="_blank" rel="noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 bg-white text-[#1B4F8A] font-semibold text-xs px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors">
              <Video className="h-3.5 w-3.5" /> Join Now
            </a>
          ) : (
            <Link href="/lms/schedule"
              className="flex-shrink-0 flex items-center gap-1.5 bg-white/20 text-white font-semibold text-xs px-4 py-2 rounded-lg hover:bg-white/30 transition-colors">
              View Details
            </Link>
          )}
        </div>
      )}

      {/* ── Deadline warnings ───────────────────────────────────── */}
      {deadlineWarnings.map((w: any, i: number) => (
        <Link key={i} href={`/lms/courses/${w.courseId}`}
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1 min-w-0 truncate">
            <span className="font-semibold">{w.title}</span>
            {" — "}{w.daysLeft === 0 ? "due today!" : `${w.daysLeft} day${w.daysLeft !== 1 ? "s" : ""} left`}
          </p>
          <ArrowRight className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
        </Link>
      ))}

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Enrolled",     value: (enrollments ?? []).length, icon: BookOpen,       color: "text-[#1B4F8A]",   bg: "bg-[#1B4F8A]/6",  border: "border-[#1B4F8A]/12", iconBg: "bg-[#1B4F8A]/10" },
          { label: "In Progress",  value: active.length,              icon: TrendingUp,     color: "text-amber-600",   bg: "bg-amber-50",      border: "border-amber-100",    iconBg: "bg-amber-100"    },
          { label: "Completed",    value: completed.length,           icon: CheckCircle2,   color: "text-emerald-600", bg: "bg-emerald-50",    border: "border-emerald-100",  iconBg: "bg-emerald-100"  },
          { label: "Certificates", value: completed.length,           icon: GraduationCap,  color: "text-purple-600",  bg: "bg-purple-50",     border: "border-purple-100",   iconBg: "bg-purple-100"   },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn("rounded-xl border px-4 py-4 flex items-center gap-3", s.bg, s.border)}>
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", s.iconBg)}>
                <Icon className={cn("h-4 w-4", s.color)} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                <p className={cn("text-2xl font-bold mt-0.5", s.color)}>{s.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* LEFT col (3/5) */}
        <div className="col-span-1 lg:col-span-3 space-y-5">

          {/* Resume CTA — if studying */}
          {resumeItem ? (
            <Link href={`/lms/courses/${resumeItem.course_id}/content/${resumeItem.content_item_id}`}
              className="flex items-center gap-4 bg-[#1B4F8A] rounded-xl px-5 py-4 group hover:bg-[#163f6e] transition-colors">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <PlayCircle className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-xs font-medium uppercase tracking-wide">Pick up where you left off</p>
                <p className="text-white font-semibold text-sm mt-0.5 truncate">
                  {(resumeItem.lms_content_items as any)?.title ?? "Continue studying"}
                </p>
                <p className="text-white/50 text-xs mt-0.5 capitalize">
                  {(resumeItem.lms_content_items as any)?.type ?? ""}
                  {resumeItem.position?.second != null && ` · ${Math.floor(resumeItem.position.second / 60)}m${resumeItem.position.second % 60}s`}
                  {resumeItem.position?.page  != null && ` · page ${resumeItem.position.page}`}
                  {resumeItem.position?.slide != null && ` · slide ${resumeItem.position.slide}`}
                </p>
              </div>
              <div className="flex-shrink-0 bg-white/15 group-hover:bg-white/25 rounded-lg px-3 py-1.5 text-white text-xs font-semibold transition-colors flex items-center gap-1">
                Resume <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ) : nextCourse && nextCoursePct === 0 ? (
            /* "Start first lesson" when enrolled but not started */
            <Link href={`/lms/courses/${nextCourse.lms_courses?.id}`}
              className="flex items-center gap-4 bg-gradient-to-r from-[#1B4F8A] to-[#2563EB] rounded-xl px-5 py-4 group hover:opacity-95 transition-opacity">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Ready to start?</p>
                <p className="text-white font-semibold text-sm mt-0.5 truncate">{nextCourse.lms_courses?.title}</p>
                <p className="text-white/50 text-xs mt-0.5">Begin your first lesson now</p>
              </div>
              <div className="flex-shrink-0 bg-white text-[#1B4F8A] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors flex items-center gap-1">
                Start <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ) : null}

          {/* Continue learning */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#1B4F8A]" /> My Courses
              </h3>
              <Link href="/lms/courses" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {(enrollments ?? []).length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <BookOpen className="h-8 w-8 mx-auto opacity-20" />
                <p className="text-sm">No courses yet — your instructor will enrol you soon</p>
              </div>
            ) : (
              [...active, ...completed].slice(0, 5).map((e: any) => {
                const course   = e.lms_courses
                const pct      = progressMap[course?.id] ?? 0
                const isDone   = e.status === "completed"
                const daysLeft = !isDone && course?.end_date
                  ? Math.ceil((new Date(course.end_date).getTime() - Date.now()) / 86_400_000)
                  : null
                return (
                  <Link key={e.id} href={`/lms/courses/${course?.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                      isDone ? "bg-emerald-50" : "bg-[#1B4F8A]/8"
                    )}>
                      {isDone
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <BookOpen className="h-4 w-4 text-[#1B4F8A]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate group-hover:text-[#1B4F8A] transition-colors">
                        {course?.title}
                      </p>
                      {isDone ? (
                        <p className="text-xs text-emerald-600 mt-0.5">Completed</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1B4F8A] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[#1B4F8A] flex-shrink-0 w-8 text-right">{pct}%</span>
                        </div>
                      )}
                    </div>
                    {daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && (
                      <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0 border border-amber-100">
                        {daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                      </span>
                    )}
                  </Link>
                )
              })
            )}
          </div>

          {/* Learning Paths */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Route className="h-4 w-4 text-[#1B4F8A]" /> Learning Paths
              </h3>
              <Link href="/lms/courses?tab=paths" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {learningPaths.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <Route className="h-7 w-7 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">No learning paths assigned</p>
              </div>
            ) : learningPaths.map((lp: any) => (
              <div key={lp.id} className="px-5 py-3.5 border-b border-slate-50 last:border-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#1B4F8A]/8 flex items-center justify-center flex-shrink-0">
                      <Route className="h-3.5 w-3.5 text-[#1B4F8A]" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{lp.title}</p>
                  </div>
                  <span className="text-xs font-bold text-[#1B4F8A] flex-shrink-0">{lp.overallPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#1B4F8A] rounded-full transition-all" style={{ width: `${lp.overallPct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {lp.courses.filter((c: any) => c.progress === 100).length}/{lp.courses.length} courses done
                  </p>
                  {lp.nextCourseInPath && (
                    <Link href={`/lms/courses/${lp.nextCourseInPath.id}`}
                      className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 font-medium">
                      {lp.nextCourseInPath.progress > 0 ? "Continue" : "Start"} next
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Cohorts */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users className="h-4 w-4 text-[#1B4F8A]" /> My Cohorts
              </h3>
              <Link href="/lms/courses?tab=cohorts" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {cohorts.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <Users className="h-7 w-7 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">No cohorts assigned</p>
              </div>
            ) : cohorts.map((c: any) => {
              const isSpec = c.mode === "specialization"
              return (
                <div key={c.memberId} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    isSpec ? "bg-purple-50" : "bg-blue-50"
                  )}>
                    {isSpec
                      ? <GitBranch className="h-4 w-4 text-purple-500" />
                      : <Users className="h-4 w-4 text-[#1B4F8A]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        isSpec ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {isSpec ? "Specialization" : "Unified"}
                      </span>
                      {c.startDate && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(c.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {c.endDate && ` → ${new Date(c.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href="/lms/courses?tab=cohorts"
                    className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 flex-shrink-0">
                    View <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )
            })}
          </div>

          {/* Recent activity */}
          {recentProg.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {recentProg.map((p: any) => (
                  <div key={p.content_item_id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                      Completed <span className="font-medium">{(p.lms_content_items as any)?.title ?? "item"}</span>
                    </p>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(p.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT col (2/5) */}
        <div className="col-span-1 lg:col-span-2 space-y-5">

          {/* Streak / nudge */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <Flame className={cn("h-5 w-5 flex-shrink-0",
              daysSinceLogin === 0 || daysSinceLogin === null ? "text-orange-400"
              : daysSinceLogin <= 2 ? "text-orange-300"
              : "text-slate-200"
            )} />
            <p className="text-sm text-slate-600">
              {daysSinceLogin === null || daysSinceLogin === 0
                ? "Great — you're learning today! Keep it up."
                : daysSinceLogin === 1
                  ? "You studied yesterday — keep the streak!"
                  : daysSinceLogin <= 3
                    ? `Welcome back after ${daysSinceLogin} days!`
                    : `You haven't studied in ${daysSinceLogin} days — let's go!`}
            </p>
          </div>

          {/* Pending assignments */}
          {pendingAssignments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-500" />
                  Assignments
                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingAssignments.length}
                  </span>
                </h3>
                <Link href="/lms/assignments" className="text-xs text-[#1B4F8A] hover:underline">All</Link>
              </div>
              {pendingAssignments.slice(0, 3).map((a: any) => (
                <Link key={a.id} href={`/lms/courses/${a.course_id}/content/${a.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <p className="text-sm text-slate-800 truncate flex-1 group-hover:text-[#1B4F8A] transition-colors">{a.title}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}

          {/* Upcoming sessions */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#1B4F8A]" /> Upcoming Sessions
              </h3>
              <Link href="/lms/schedule" className="text-xs text-[#1B4F8A] hover:underline">Schedule</Link>
            </div>
            {upcomingSessions.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <Calendar className="h-7 w-7 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">No sessions scheduled</p>
                <p className="text-xs text-slate-300">Check back later</p>
              </div>
            ) : (
              upcomingSessions.slice(0, 4).map((s: any) => {
                const d = new Date(s.session_date)
                return (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="bg-[#1B4F8A] text-white rounded-lg px-2 py-1.5 text-center flex-shrink-0 min-w-[36px]">
                      <div className="text-sm font-bold leading-none">{d.getDate()}</div>
                      <div className="text-[9px] opacity-70 uppercase mt-0.5">{d.toLocaleString("en", { month: "short" })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{s.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {fmtTime(s.start_time)}
                        {s.location && <><MapPin className="h-3 w-3 ml-1" />{s.location}</>}
                      </p>
                    </div>
                    {s.meeting_link && (
                      <a href={s.meeting_link} target="_blank" rel="noreferrer"
                        className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-white bg-[#1B4F8A] hover:bg-[#163f6e] px-2 py-1 rounded-lg transition-colors">
                        <Video className="h-3 w-3" /> Join
                      </a>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Quick Links</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { href: "/lms/courses",      icon: BookOpen,      label: "My Courses",   sub: `${(enrollments ?? []).length} enrolled`                                                   },
                { href: "/lms/assignments",  icon: ClipboardList, label: "Assignments",  sub: pendingAssignments.length > 0 ? `${pendingAssignments.length} pending` : "Up to date"     },
                { href: "/lms/certificates", icon: Award,         label: "Certificates", sub: `${completed.length} earned`                                                               },
                { href: "/lms/profile",      icon: GraduationCap, label: "My Profile",   sub: "View & edit"                                                                              },
              ].map(link => {
                const Icon = link.icon
                return (
                  <Link key={link.href} href={link.href}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#1B4F8A]/10 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-slate-500 group-hover:text-[#1B4F8A] transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 group-hover:text-[#1B4F8A] transition-colors">{link.label}</p>
                      <p className="text-xs text-slate-400">{link.sub}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
