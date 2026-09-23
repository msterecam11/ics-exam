import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  BookOpen, CheckCircle2, Clock, ArrowRight,
  MapPin, Video, TrendingUp, AlertTriangle,
  PlayCircle, Calendar, Flame, Lock, Star,
  GraduationCap, Award, Rocket, FolderKanban,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ENROLLMENT_ACCESS_COLUMNS, currentVisible, getCourseLocks } from "@/lib/lms-enrollment"
import { sessionsForViewers, sessionToday } from "@/lib/lms-sessions"
import { getStudentPrograms, nextCourse, daysUntil, deadlineLevel, getFeedbackRequests } from "@/lib/lms-student-portal"
import { DeadlineBadge, fmtDay, ProgressBar } from "@/components/lms/portal/PortalBits"

export default async function StudentDashboard() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // ── Step 1: enrollments ───────────────────────────────────────
  const { data: enrollmentRows } = await db
    .from("lms_enrollments")
    .select(`
      id, course_id, status, enrolled_at, completed_at, progress_pct, time_spent_s, ${ENROLLMENT_ACCESS_COLUMNS},
      lms_courses(id, title, description, delivery_mode, thumbnail_url, end_date, start_date)
    `)
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false })

  // One current, accessible enrollment per course.
  const enrollments = currentVisible(enrollmentRows as any[])
  const courseIds = enrollments.map((e: any) => e.lms_courses?.id).filter(Boolean)
  const enrollmentIds = enrollments.map((e: any) => e.id)
  const today     = sessionToday()
  // Sessions of the student's own groups only: each enrollment's program and
  // track (a course taken by another program has its own sessions).
  const viewers = enrollments.filter((e: any) => e.access === "full").map((e: any) => ({
    course_id: e.course_id, program_id: e.program_id ?? null, track_id: e.lms_program_members?.track_id ?? null,
  }))

  // ── Step 2: all queries in parallel ──────────────────────────
  const [
    sessionsResult,
    lastLoginResult,
    lastPkgResult,
    recentPkgResult,
    programs,
    certificatesResult,
    locks,
  ] = await Promise.all([
    sessionsForViewers<any>(viewers,
      "id, title, session_date, start_time, location, meeting_link, duration_minutes",
      q => q.gte("session_date", today).is("closed_at", null).order("session_date", { ascending: true }).order("start_time", { ascending: true }),
    ).then(rows => ({ data: rows.slice(0, 6) })).catch(() => ({ data: [] as any[] })),

    db.from("lms_students").select("last_login").eq("id", student.id).single(),

    courseIds.length
      ? db.from("lms_package_progress")
          .select("module_id, course_id, current_item_index, updated_at, lms_packages(title, lms_modules(title))")
          .in("enrollment_id", enrollmentIds).eq("status", "in_progress")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),

    courseIds.length
      ? db.from("lms_package_progress")
          .select("package_id, completed_at, updated_at, lms_packages(title, lms_modules(title))")
          .in("enrollment_id", enrollmentIds).in("status", ["passed", "completed"])
          .order("completed_at", { ascending: false }).limit(4)
      : Promise.resolve({ data: [] }),

    getStudentPrograms(student.id),

    // Certificates actually released (not revoked) — the stat used to show the
    // number of completed courses, which isn't the same thing.
    db.from("lms_certificates")
      .select("id, type, source_title, issued_at, released_at, lms_courses(title), lms_enrollments(lms_programs(name))")
      .eq("student_id", student.id).is("revoked_at", null).not("released_at", "is", null)
      // Only certificates meant for the student — a partner certificate kept as
      // an internal record, or an ICS copy set to hidden, never shows here.
      .eq("visible_to_student", true)
      .order("released_at", { ascending: false }),

    // Program start / sequential-course locks, so nothing below points at a
    // course the student can't open yet.
    getCourseLocks(enrollments.map((e: any) => ({
      course_id: e.course_id, status: e.status, program_id: e.program_id ?? null, member_id: e.member_id ?? null,
      program: e.lms_programs ?? null, member: e.lms_program_members ?? null, access: e.access,
    }))),
  ])

  // Progress is stored in lms_enrollments.progress_pct by syncEnrollmentProgress
  const progressMap: Record<string, number> = {}
  for (const e of enrollments ?? []) {
    const cid = (e as any).lms_courses?.id
    if (cid) progressMap[cid] = (e as any).progress_pct ?? 0
  }

  // ── Derived ───────────────────────────────────────────────────
  type Resume = { href: string; title: string; detail: string; at: string }
  const pkgResume = lastPkgResult.data as any
  const resumeItem: Resume | null = pkgResume?.module_id && pkgResume?.course_id
    ? {
      href:   `/lms/courses/${pkgResume.course_id}/package/${pkgResume.module_id}`,
      // Package rows are all titled just "Package"; the module carries the real name.
      title:  (pkgResume.lms_packages as any)?.lms_modules?.title ?? (pkgResume.lms_packages as any)?.title ?? "Continue studying",
      detail: pkgResume.current_item_index != null ? `item ${pkgResume.current_item_index + 1}` : "",
      at:     pkgResume.updated_at,
    }
    : null
  const sessions         = (sessionsResult.data ?? []) as any[]
  const todaySessions    = sessions.filter(s => s.session_date === today)
  const upcomingSessions = sessions.filter(s => s.session_date > today)
  // Completed modules, newest first.
  const recentProg: { key: string; title: string; at: string }[] = [
    ...((recentPkgResult.data ?? []) as any[]).map((p: any) => ({
      key: `pkg-${p.package_id}`, title: (p.lms_packages as any)?.lms_modules?.title ?? (p.lms_packages as any)?.title ?? "module", at: p.completed_at ?? p.updated_at,
    })),
  ]
    .filter(r => r.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4)
  const active           = (enrollments ?? []).filter((e: any) => e.status === "active")
  const completed        = (enrollments ?? []).filter((e: any) => e.status === "completed")

  const certificates = (certificatesResult.data ?? []) as any[]
  const runningPrograms = programs.filter(p => !p.ended && p.access !== "none")

  // Deadlines (SP): a program's end date for this student (their extension if
  // they have one), amber within 14 days, red within 3. Courses taken outside
  // any program keep their own end date.
  const deadlineWarnings = [
    ...programs.filter(p => p.deadline).map(p => ({
      key: `p-${p.member_id}`, title: p.program.name, href: `/lms/programs/${p.program.id}`,
      daysLeft: p.daysLeft!, level: p.deadline!, extended: p.extended,
    })),
    ...active.filter((e: any) => !e.program_id && e.lms_courses?.end_date).map((e: any) => {
      const d = daysUntil(String(e.lms_courses.end_date).slice(0, 10))
      return { key: `c-${e.id}`, title: e.lms_courses?.title, href: `/lms/courses/${e.course_id}`, daysLeft: d, level: deadlineLevel(d), extended: false }
    }).filter(w => w.level),
  ]
  const isLocked = (courseId: string) => locks.get(courseId)?.locked === true
  const feedbackRequests = await getFeedbackRequests(student.id, enrollments)

  const daysSinceLogin = (lastLoginResult as any).data?.last_login
    ? Math.floor((Date.now() - new Date((lastLoginResult as any).data.last_login).getTime()) / 86_400_000)
    : null

  // First name only
  const firstName = student.name?.split(" ")[0] ?? "there"

  function fmtTime(t: string) { return t?.slice(0, 5) ?? "" }

  // ── Find "next to start" course (0% or lowest progress) ──────
  const openActive = active.filter((e: any) => e.access === "full" && !isLocked(e.course_id))
  const nextToStart = openActive.length > 0
    ? openActive.reduce((best: any, e: any) => {
        const pct = progressMap[e.lms_courses?.id] ?? 0
        const bestPct = progressMap[best?.lms_courses?.id] ?? 0
        return pct < bestPct ? e : best
      }, openActive[0])
    : null
  const nextCoursePct = nextToStart ? (progressMap[nextToStart.lms_courses?.id] ?? 0) : 0

  return (
    <div className="p-4 sm:p-5 space-y-5">

      {/* ── Welcome header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {daysSinceLogin === 0 || daysSinceLogin === null
              ? `Welcome back, ${firstName} 👋`
              : `Good to see you, ${firstName}!`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {[
              runningPrograms.length ? `${runningPrograms.length} program${runningPrograms.length !== 1 ? "s" : ""}` : null,
              active.length ? `${active.length} active course${active.length !== 1 ? "s" : ""}` : "No active courses yet",
              sessions.length ? `${sessions.length} upcoming session${sessions.length !== 1 ? "s" : ""}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {certificates.length > 0 && (
          <Link href="/lms/certificates" className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 hover:bg-emerald-100 transition-colors">
            <Award className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-700">{certificates.length} certificate{certificates.length !== 1 ? "s" : ""} earned</span>
          </Link>
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
      {deadlineWarnings.map(w => (
        <Link key={w.key} href={w.href}
          className={cn("flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors",
            w.level === "red" ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-amber-50 border-amber-200 hover:bg-amber-100")}>
          <AlertTriangle className={cn("h-4 w-4 flex-shrink-0", w.level === "red" ? "text-red-500" : "text-amber-500")} />
          <p className={cn("text-sm flex-1 min-w-0", w.level === "red" ? "text-red-800" : "text-amber-800")}>
            <span className="font-semibold">{w.title}</span>
            {" — "}{w.daysLeft === 0 ? "ends today" : `ends in ${w.daysLeft} day${w.daysLeft !== 1 ? "s" : ""}`}
            {w.extended && " (your extended date)"}
          </p>
          <ArrowRight className={cn("h-3.5 w-3.5 flex-shrink-0", w.level === "red" ? "text-red-400" : "text-amber-400")} />
        </Link>
      ))}

      {/* ── Feedback waiting (FB-2 / FB-5) ─────────────────────────── */}
      {feedbackRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-800">Your feedback is requested</h3>
          </div>
          {feedbackRequests.map(r => (
            <Link key={r.kind === "course" ? `c-${r.course_id}` : `p-${r.program_id}`}
              href={r.kind === "course" ? `/lms/courses/${r.course_id}#feedback` : `/lms/programs/${r.program_id}#program-survey`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 truncate">{r.kind === "course" ? r.title : `${r.name}: program survey`}</p>
                {r.kind === "course" && r.program && <p className="text-[11px] text-slate-400 truncate">{r.program}</p>}
              </div>
              {r.kind === "course" && r.mandatory && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Needed for certificate</span>
              )}
              <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Programs",      value: runningPrograms.length,     icon: FolderKanban,   color: "text-[#1B4F8A]",   bg: "bg-[#1B4F8A]/6",  border: "border-[#1B4F8A]/12", iconBg: "bg-[#1B4F8A]/10" },
          { label: "In Progress",   value: active.length,              icon: TrendingUp,     color: "text-amber-600",   bg: "bg-amber-50",      border: "border-amber-100",    iconBg: "bg-amber-100"    },
          { label: "Completed",     value: completed.length,           icon: CheckCircle2,   color: "text-emerald-600", bg: "bg-emerald-50",    border: "border-emerald-100",  iconBg: "bg-emerald-100"  },
          { label: "Certificates",  value: certificates.length,        icon: GraduationCap,  color: "text-purple-600",  bg: "bg-purple-50",     border: "border-purple-100",   iconBg: "bg-purple-100"   },
          { label: "Learning time", value: (() => { const s = (enrollments ?? []).reduce((a: number, e: any) => a + (e.time_spent_s ?? 0), 0); const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return s < 60 ? "—" : h > 0 ? `${h}h${m>0?` ${m}m`:""}` : `${m}m` })(), icon: Clock, color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-100", iconBg: "bg-sky-100" },
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
            <Link href={resumeItem.href}
              className="flex items-center gap-4 bg-[#1B4F8A] rounded-xl px-5 py-4 group hover:bg-[#163f6e] transition-colors">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <PlayCircle className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-xs font-medium uppercase tracking-wide">Pick up where you left off</p>
                <p className="text-white font-semibold text-sm mt-0.5 truncate">
                  {resumeItem.title}
                </p>
                {resumeItem.detail && (
                  <p className="text-white/50 text-xs mt-0.5 capitalize">{resumeItem.detail}</p>
                )}
              </div>
              <div className="flex-shrink-0 bg-white/15 group-hover:bg-white/25 rounded-lg px-3 py-1.5 text-white text-xs font-semibold transition-colors flex items-center gap-1">
                Resume <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ) : nextToStart && nextCoursePct === 0 ? (
            /* "Start first lesson" when enrolled but not started */
            <Link href={`/lms/courses/${nextToStart.lms_courses?.id}`}
              className="flex items-center gap-4 bg-gradient-to-r from-[#1B4F8A] to-[#2563EB] rounded-xl px-5 py-4 group hover:opacity-95 transition-opacity">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Ready to start?</p>
                <p className="text-white font-semibold text-sm mt-0.5 truncate">{nextToStart.lms_courses?.title}</p>
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
              // Courses the student can work on first, then locked ones, then completed.
              [...active.filter((e: any) => !isLocked(e.course_id)), ...active.filter((e: any) => isLocked(e.course_id)), ...completed].slice(0, 5).map((e: any) => {
                const course   = e.lms_courses
                const pct      = progressMap[course?.id] ?? 0
                const isDone   = e.status === "completed"
                const locked   = !isDone && isLocked(e.course_id)
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
                      {e.lms_programs?.name && !e.lms_programs?.is_individual && (
                        <p className="text-[11px] text-slate-400 truncate">{e.lms_programs.name}</p>
                      )}
                      {isDone ? (
                        <p className="text-xs text-emerald-600 mt-0.5">Completed</p>
                      ) : locked ? (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Lock className="h-3 w-3 shrink-0" /> <span className="truncate">{(() => { const l = locks.get(e.course_id); return l?.locked ? l.reason : "" })()}</span></p>
                      ) : (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1B4F8A] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[#1B4F8A] flex-shrink-0 w-8 text-right">{pct}%</span>
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          {/* My Programs */}
          {programs.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-[#1B4F8A]" /> My Programs
                </h3>
                <Link href="/lms/programs" className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {programs.slice(0, 3).map(p => {
                const next = nextCourse(p)
                return (
                  <div key={p.member_id} className="px-5 py-3.5 border-b border-slate-50 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/lms/programs/${p.program.id}`} className="text-sm font-medium text-slate-900 truncate hover:text-[#1B4F8A]">
                        {p.program.name}
                      </Link>
                      <span className="text-xs font-bold text-[#1B4F8A] flex-shrink-0">{p.progressPct}%</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {[p.track?.name, `${p.completedCount}/${p.totalCount} courses`, p.endDate ? `ends ${fmtDay(p.endDate)}` : null].filter(Boolean).join(" · ")}
                    </p>
                    <ProgressBar pct={p.progressPct} className="mt-2" />
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <DeadlineBadge daysLeft={p.daysLeft} level={p.deadline} extended={p.extended} />
                      {next ? (
                        <Link href={`/lms/courses/${next.course_id}`} className="ml-auto text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 font-medium truncate">
                          {next.progress_pct > 0 ? "Continue" : "Start"}: {next.title} <ArrowRight className="h-3 w-3 shrink-0" />
                        </Link>
                      ) : p.notStarted ? (
                        <span className="ml-auto text-xs text-amber-700">Opens {fmtDay(p.program.start_date)}</span>
                      ) : p.access === "none" || p.ended ? (
                        <span className="ml-auto text-xs text-slate-400">Ended</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent activity */}
          {recentProg.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {recentProg.map(p => (
                  <div key={p.key} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <p className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                      Completed <span className="font-medium">{p.title}</span>
                    </p>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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

          {/* Recent certificates */}
          {certificates.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-500" /> Recent certificates
                </h3>
                <Link href="/lms/certificates" className="text-xs text-[#1B4F8A] hover:underline">All</Link>
              </div>
              {certificates.slice(0, 3).map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Award className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{c.type === "course" || !c.type ? (c.lms_courses?.title ?? "Course") : (c.source_title ?? "Certificate")}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {[c.lms_enrollments?.lms_programs?.name, fmtDay(c.released_at)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
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
                const d = new Date(s.session_date + "T00:00:00Z")
                return (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="bg-[#1B4F8A] text-white rounded-lg px-2 py-1.5 text-center flex-shrink-0 min-w-[36px]">
                      <div className="text-sm font-bold leading-none">{d.getUTCDate()}</div>
                      <div className="text-[9px] opacity-70 uppercase mt-0.5">{d.toLocaleString("en", { month: "short", timeZone: "UTC" })}</div>
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
                { href: "/lms/programs",     icon: FolderKanban,  label: "My Programs",  sub: `${runningPrograms.length} running`                                                        },
                { href: "/lms/courses",      icon: BookOpen,      label: "My Courses",   sub: `${(enrollments ?? []).length} enrolled`                                                   },
                { href: "/lms/certificates", icon: Award,         label: "Certificates", sub: `${certificates.length} earned`                                                            },
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
