export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  CheckCircle2, Lock, Globe, Monitor, Layers, Clock, ChevronRight,
  CalendarDays, MapPin, Video, History, Award, Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import CourseFeedbackForm from "@/components/lms/CourseFeedbackForm"
import { getCurrentEnrollment, getExamRules, getCourseLock } from "@/lib/lms-enrollment"
import { sessionsForViewers, sessionToday } from "@/lib/lms-sessions"
import { getFeedbackState } from "@/lib/lms-feedback"

// ── Icons & labels ────────────────────────────────────────────
const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}

function formatDuration(mins: number | null) {
  if (!mins) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}` : `${m}m`
}

// ── Page ──────────────────────────────────────────────────────
export default async function StudentCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment — the student's CURRENT enrollment in this course; all
  // progress shown below belongs to it (an earlier program's run is history).
  const current = await getCurrentEnrollment(student.id, courseId)
  if (!current || current.access === "none") notFound()
  const { data: enrollmentRow } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at, progress_pct, time_spent_s")
    .eq("id", current.id)
    .single()
  if (!enrollmentRow) notFound()
  const enrollment = enrollmentRow

  // Fetch course
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, description, delivery_mode, thumbnail_url, progress_enforcement, feedback_enabled, feedback_anonymous, start_date, end_date, learning_outcomes, prerequisites, status")
    .eq("id", courseId)
    .single()

  if (!course) notFound()
  // A course pulled back to draft (or archived) after people were enrolled is
  // not open, whatever their enrolment says. They keep their place and their
  // results; the door is simply shut.
  if ((course as any).status !== "published") notFound()

  // Dates: inside a program the PROGRAM's dates and rules apply (the course is
  // a template); the course's own dates only matter for enrollments made
  // outside any program.
  const now = new Date()
  const courseNotStarted = !current.program && course.start_date && new Date(course.start_date) > now
  const courseEnded      = !current.program && course.end_date   && new Date(course.end_date)   < now

  // Program start date / sequential courses.
  const lock = await getCourseLock(current)

  // Program + track shown on the header.
  let trackName: string | null = null
  if (current.member?.track_id) {
    const { data: t } = await db.from("lms_program_tracks").select("name").eq("id", current.member.track_id).maybeSingle()
    trackName = (t as any)?.name ?? null
  }

  // Earlier runs of this course (retakes in another program). Each keeps its
  // own records; they are listed read-only here.
  const { data: otherRuns } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at, progress_pct, lms_programs(name)")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .neq("id", current.id)
    .order("enrolled_at", { ascending: false })
  const previousRuns = ((otherRuns ?? []) as any[])
  const runIds = previousRuns.map(r => r.id)
  const [{ data: runAttempts }, { data: runCerts }] = runIds.length
    ? await Promise.all([
        db.from("lms_module_attempts").select("enrollment_id, passed, score, max_score, attempt_no").in("enrollment_id", runIds).order("attempt_no", { ascending: false }),
        db.from("lms_certificates").select("enrollment_id, id, released_at, revoked_at").in("enrollment_id", runIds).eq("visible_to_student", true),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]
  const runExam = new Map<string, { passed: boolean; pct: number }>()
  for (const a of (runAttempts ?? []) as any[]) {
    // Best result wins: a pass beats a fail, then the higher score.
    const pct = a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0
    const prev = runExam.get(a.enrollment_id)
    if (!prev || (a.passed && !prev.passed) || (a.passed === prev.passed && pct > prev.pct)) runExam.set(a.enrollment_id, { passed: !!a.passed, pct })
  }
  const runCert = new Map<string, boolean>(((runCerts ?? []) as any[]).map(c => [c.enrollment_id, !!c.released_at && !c.revoked_at]))

  // Fetch modules
  const { data: modules } = await db
    .from("lms_modules")
    .select("id, title, description, delivery_type, order_index, estimated_duration, module_type, lock_until_previous, is_mandatory, activity_settings")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  // Live sessions of THIS student's group: their program (and track) for this
  // course. Another program taking the same course has its own sessions.
  const liveSessions = await sessionsForViewers<any>(
    [{ course_id: courseId, program_id: current.program_id, track_id: current.member?.track_id ?? null }],
    "id, title, session_date, start_time, duration_minutes, location, closed_at, meeting_link, recording_url",
    q => q.order("session_date", { ascending: false }).order("start_time", { ascending: false }),
  ).catch(() => [] as any[])

  // Fetch this student's attendance records for all sessions
  const sessionIds = (liveSessions ?? []).map((s: any) => s.id)
  const { data: myAttendance } = sessionIds.length > 0
    ? await db
        .from("lms_attendance")
        .select("session_id, status, scanned_at")
        .eq("student_id", student.id)
        .in("session_id", sessionIds)
    : { data: [] }

  const sessionAttMap = new Map<string, { status: string; scanned_at: string | null }>(
    (myAttendance ?? []).map((a: any) => [a.session_id, { status: a.status, scanned_at: a.scanned_at }])
  )

  // Separate upcoming (open, future or today) vs past sessions
  const today = sessionToday()
  const upcomingSessions = (liveSessions ?? []).filter(
    (s: any) => s.session_date >= today && !s.closed_at
  ).reverse() // chronological
  const pastSessions = (liveSessions ?? []).filter(
    (s: any) => s.session_date < today || s.closed_at
  )

  // Fetch package progress for package modules
  const packageModuleIds = (modules ?? [])
    .filter((m: any) => m.module_type === "package")
    .map((m: any) => m.id)

  let pkgProgressMap = new Map<string, { status: string; score: number | null; pct: number }>()
  if (packageModuleIds.length > 0) {
    const { data: pkgs } = await db
      .from("lms_packages")
      .select("id, module_id")
      .in("module_id", packageModuleIds)

    const pkgIdToModuleId = new Map((pkgs ?? []).map((p: any) => [p.id, p.module_id]))
    const pkgIds = (pkgs ?? []).map((p: any) => p.id)

    if (pkgIds.length > 0) {
      const [pkgProgResult, pkgItemsResult] = await Promise.all([
        db.from("lms_package_progress")
          .select("package_id, module_id, status, score, completed_items")
          .eq("enrollment_id", current.id)
          .in("package_id", pkgIds),
        db.from("lms_package_items")
          .select("package_id")
          .in("package_id", pkgIds),
      ])

      // Count total items per package
      const totalByPkg: Record<string, number> = {}
      for (const item of pkgItemsResult.data ?? [])
        totalByPkg[item.package_id] = (totalByPkg[item.package_id] ?? 0) + 1

      for (const pp of pkgProgResult.data ?? []) {
        const moduleId = pkgIdToModuleId.get(pp.package_id)
        if (!moduleId) continue
        const total     = totalByPkg[pp.package_id] ?? 0
        const completed = Array.isArray(pp.completed_items) ? pp.completed_items.length : 0
        const pct       = total > 0 ? Math.round((completed / total) * 100) : 0
        pkgProgressMap.set(moduleId, { status: pp.status, score: pp.score, pct })
      }
    }
  }

  // Fetch exam attempt data for final_exam modules
  const examModuleIds = (modules ?? [])
    .filter((m: any) => m.module_type === "final_exam")
    .map((m: any) => m.id)

  const examAttemptMap = new Map<string, { passed: boolean; score: number | null; attemptNo: number; totalAttempts: number; maxAttempts: number }>()
  if (examModuleIds.length > 0) {
    const { data: examAttempts } = await db
      .from("lms_module_attempts")
      .select("module_id, passed, score, max_score, attempt_no")
      .eq("enrollment_id", current.id)
      .in("module_id", examModuleIds)
      .order("attempt_no", { ascending: false })

    // Count total attempts per module
    const attemptCountByModule: Record<string, number> = {}
    for (const a of examAttempts ?? []) {
      attemptCountByModule[a.module_id] = (attemptCountByModule[a.module_id] ?? 0) + 1
    }

    for (const a of examAttempts ?? []) {
      if (!examAttemptMap.has(a.module_id)) {
        const pct = a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0
        // Find max_attempts from module's activity_settings
        const mod = (modules ?? []).find((m: any) => m.id === a.module_id)
        const maxAttempts = (await getExamRules(current, null, mod?.activity_settings)).maxAttempts
        examAttemptMap.set(a.module_id, {
          passed: a.passed,
          score: pct,
          attemptNo: a.attempt_no,
          totalAttempts: attemptCountByModule[a.module_id] ?? 1,
          maxAttempts,
        })
      }
    }
  }

  // Compute module completion
  const mods = (modules ?? []).map((m: any) => {
    if (m.module_type === "package") {
      const pkgProg = pkgProgressMap.get(m.id)
      const done    = pkgProg?.status === "passed" || pkgProg?.status === "completed"
      const pct     = done ? 100 : (pkgProg?.pct ?? 0)
      return {
        ...m, items: [], mandatory: [{ id: m.id }],
        doneCount: done ? 1 : 0, pct,
        pkgStatus: pkgProg?.status ?? null, pkgScore: pkgProg?.score ?? null,
        examAttempt: null,
      }
    }
    if (m.module_type === "final_exam") {
      const ea = examAttemptMap.get(m.id)
      const examBlocked = ea ? (!ea.passed && ea.totalAttempts >= ea.maxAttempts) : false
      return {
        ...m, items: [], mandatory: [{ id: m.id }],
        doneCount: ea?.passed ? 1 : 0, pct: ea?.passed ? 100 : ea ? 30 : 0,
        pkgStatus: null, pkgScore: null,
        examAttempt: ea ?? null,
        examBlocked,
      }
    }
    // Assignment / live-session modules: no tracked progress yet (onsite work).
    return { ...m, items: [], mandatory: [], doneCount: 0, pct: 0, pkgStatus: null, pkgScore: null, examAttempt: null }
  })

  // Compute locked state per module based on lock_until_previous
  // A module is locked when: lock_until_previous=true AND the previous mandatory module is not 100% done
  const modsWithLock = mods.map((mod: any, idx: number) => {
    if (!mod.lock_until_previous || idx === 0) return { ...mod, isModuleLocked: false }
    // Find the closest previous mandatory module
    const prevMandatory = mods.slice(0, idx).reverse().find((m: any) => m.is_mandatory !== false)
    const prevDone = prevMandatory ? prevMandatory.pct >= 100 : true
    return { ...mod, isModuleLocked: !prevDone }
  })

  // Overall % uses the stored enrollment.progress_pct (maintained by
  // syncEnrollmentProgress, mandatory-modules-only) so the ring matches the
  // dashboard, admin roster, and reports. Per-module bars below still show
  // live per-module detail (including optional modules).
  const overallPct = Math.min(100, Math.round((enrollment as any).progress_pct ?? 0))

  // Feedback (FB-1/2/3): program settings apply inside a program; asked once the
  // course is completed or every exam attempt is used without passing.
  const fb = await getFeedbackState(current)
  const showFeedbackForm = fb.due
  const alreadySubmittedFeedback = fb.settings.enabled && fb.submitted

  const DeliveryIcon  = DELIVERY_ICONS[course.delivery_mode] ?? Globe

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Program access banner (program ended → review only) */}
      {current.accessNote && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-slate-700">
          <span className="text-lg">📘</span>
          <p>{current.accessNote}</p>
        </div>
      )}

      {/* Program not open yet / earlier course still to finish */}
      {lock.locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{lock.kind === "not_started" ? "Program not open yet" : "Course locked"}</p>
            <p className="text-amber-700 text-xs mt-0.5">{lock.reason}</p>
            {lock.kind === "sequential" && (
              <Link href={`/lms/courses/${lock.blockedBy.course_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline mt-1">
                Go to {lock.blockedBy.title} <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Feedback asked (mandatory ones hold the certificate download) */}
      {showFeedbackForm && (
        <a href="#feedback" className={cn("rounded-xl px-4 py-3 flex items-center gap-3 text-sm border transition-colors",
          fb.settings.mandatory ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100" : "bg-[#1B4F8A]/5 border-[#1B4F8A]/15 text-[#1B4F8A] hover:bg-[#1B4F8A]/10")}>
          <Star className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{fb.settings.mandatory ? "Feedback required" : "Tell us how the course went"}</span>
            <span className="block text-xs opacity-80">{fb.settings.mandatory ? "Answer the short feedback form to download your certificate." : "A short feedback form is waiting at the bottom of this page."}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </a>
      )}

      {/* Date access banners */}
      {courseNotStarted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-800">
          <span className="text-lg">🔒</span>
          <div>
            <p className="font-semibold">Course not yet available</p>
            <p className="text-amber-600 text-xs mt-0.5">Access opens on {fmtDate(course.start_date!)}</p>
          </div>
        </div>
      )}
      {courseEnded && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-slate-600">
          <span className="text-lg">📅</span>
          <div>
            <p className="font-semibold">Course has ended</p>
            <p className="text-slate-400 text-xs mt-0.5">This course closed on {fmtDate(course.end_date!)}. Content is read-only.</p>
          </div>
        </div>
      )}

        {/* Course hero */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {course.thumbnail_url && (
            <div className="h-36 bg-[#1B4F8A]/5 overflow-hidden">
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                width={800}
                height={144}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6">
            {current.program && !current.program.is_individual && (
              <Link href={`/lms/programs/${current.program.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline mb-2">
                {current.program.name}{trackName ? ` · ${trackName}` : ""} <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Badge variant="outline" className="text-xs gap-1">
                    <DeliveryIcon className="h-3 w-3" /> {course.delivery_mode}
                  </Badge>
                  {enrollment.status === "completed" && (
                    <Badge className="text-xs border-0 bg-emerald-100 text-emerald-700 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                  )}
                </div>
              </div>
              {/* Overall progress ring */}
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                    <circle
                      cx="32" cy="32" r="26"
                      fill="none"
                      stroke={overallPct >= 100 ? "#22c55e" : "#1B4F8A"}
                      strokeWidth="5"
                      strokeDasharray={`${(overallPct / 100) * 163.4} 163.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                    {overallPct}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{overallPct}% complete</p>
                {((enrollment as any).time_spent_s ?? 0) >= 60 && (
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    {(() => { const s = (enrollment as any).time_spent_s ?? 0; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h${m>0?` ${m}m`:""}` : `${m}m` })()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About this course — open until the student starts, then folded away */}
        {(() => {
          const objectives = ((course as any).learning_outcomes ?? []) as string[]
          const prereqs = ((course as any).prerequisites ?? []) as string[]
          const modList = modsWithLock as any[]
          if (!course.description && !objectives.length && !prereqs.length && !modList.length) return null
          const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{children}</h3>
          return (
            <details open={overallPct === 0} className="bg-white rounded-2xl border border-slate-200 group">
              <summary className="px-6 py-4 cursor-pointer select-none flex items-center justify-between list-none">
                <span className="text-base font-bold text-slate-800">About this course</span>
                <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-6 pb-6 space-y-6 border-t border-slate-100 pt-5">
                {course.description && (
                  <section><H>Course overview</H><p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{course.description}</p></section>
                )}
                {objectives.length > 0 && (
                  <section>
                    <H>Learning objectives</H>
                    <ul className="space-y-1.5">
                      {objectives.map((o, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />{o}</li>)}
                    </ul>
                  </section>
                )}
                {modList.length > 0 && (
                  <section>
                    <H>Course modules</H>
                    <ol className="space-y-1.5">
                      {modList.map((m, i) => (
                        <li key={m.id} className="flex items-center gap-2.5 text-sm text-slate-600">
                          <span className="w-5 h-5 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          {m.title}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {prereqs.length > 0 && (
                  <section>
                    <H>Prerequisites</H>
                    <ul className="space-y-1.5">
                      {prereqs.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />{p}</li>)}
                    </ul>
                  </section>
                )}
              </div>
            </details>
          )
        })()}

        {/* Modules */}
        <div className="space-y-3">
          {modsWithLock.map((mod: any, mi: number) => {
            const isPackage = mod.module_type === "package"
            const isExam    = mod.module_type === "final_exam"
            const isAssign  = mod.module_type === "assignment"
            const isSession = mod.module_type === "live_session"
            const isSingle  = isPackage || isExam || isAssign || isSession
            const isLocked  = mod.isModuleLocked === true || !!courseNotStarted || lock.locked

            // For single-action modules, wrap the whole card in a Link
            const href = isPackage ? `/lms/courses/${courseId}/package/${mod.id}`
                       : isExam    ? `/lms/courses/${courseId}/exam/${mod.id}`
                       : isAssign  ? `/lms/courses/${courseId}/assignment/${mod.id}`
                       : null

            const moduleCompleted = isPackage
              ? (mod.pkgStatus === "passed" || mod.pkgStatus === "completed")
              : isExam ? mod.examAttempt?.passed
              : false

            const ctaLabel = moduleCompleted ? null
              : isPackage
              ? (mod.pkgStatus === "failed"      ? "Retry"
               : mod.pkgStatus === "in_progress" ? "Resume"
               :                                   "Launch")
              : isExam
              ? (mod.examBlocked ? null : mod.examAttempt ? "Retry" : "Start")
              : isAssign ? "Open" : null

            const ctaColor = isExam    ? "bg-amber-600 hover:bg-amber-700"
                           : isAssign  ? "bg-green-600 hover:bg-green-700"
                           : "bg-teal-600 hover:bg-teal-700"

            const statusBadge = moduleCompleted
              ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</span>
              : isPackage ? (
                mod.pkgStatus === "failed"      ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Not passed{mod.pkgScore != null ? ` · ${mod.pkgScore}%` : ""}</span>
              : mod.pkgStatus === "in_progress" ? <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">In progress</span>
              : null
              ) : isExam ? (
                mod.examBlocked
                  ? <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">Max attempts reached</span>
                : mod.examAttempt
                  ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Not passed{mod.examAttempt.score != null ? ` · ${mod.examAttempt.score}%` : ""} · {mod.examAttempt.totalAttempts}/{mod.examAttempt.maxAttempts} attempts</span>
                : null
              ) : null

            const cardInner = (
              <>
                {/* Left: number + info */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    moduleCompleted ? "bg-emerald-100 text-emerald-600"
                    : mod.pkgStatus === "failed" ? "bg-red-100 text-red-500"
                    : mod.pct >= 100 ? "bg-emerald-100 text-emerald-600"
                    : "bg-[#1B4F8A]/10 text-[#1B4F8A]"
                  )}>
                    {moduleCompleted    ? <CheckCircle2 className="h-4 w-4" />
                    : mod.pkgStatus === "failed" ? mi + 1
                    : mod.pct >= 100   ? <CheckCircle2 className="h-4 w-4" />
                    : mi + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{mod.title}</p>
                      {statusBadge}
                    </div>
                    {mod.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{mod.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {mod.estimated_duration && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />{formatDuration(mod.estimated_duration)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[#1B4F8A]">{mod.pct}%</span>
                      {/* Progress bar inline */}
                      <div className="flex-1 max-w-[160px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all",
                          moduleCompleted ? "bg-emerald-500"
                          : mod.pkgStatus === "failed" ? "bg-red-400"
                          : mod.pct >= 100 ? "bg-emerald-500"
                          : "bg-[#1B4F8A]")}
                          style={{ width: `${mod.pct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: CTA or completed lock */}
                {isSingle && moduleCompleted ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {isPackage && (
                      <Link
                        href={`/lms/courses/${courseId}/package/${mod.id}?review=true`}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                      >
                        Review
                      </Link>
                    )}
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  </div>
                ) : isSingle && isPackage && mod.pkgStatus === "failed" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/lms/courses/${courseId}/package/${mod.id}?review=true`}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    >
                      Review
                    </Link>
                    <Link
                      href={`/lms/courses/${courseId}/package/${mod.id}`}
                      className={cn("shrink-0 flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors", ctaColor)}
                    >
                      Retry <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : isSingle && ctaLabel ? (
                  <div className={cn(
                    "shrink-0 flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors",
                    ctaColor
                  )}>
                    {ctaLabel} <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                ) : null}
              </>
            )

            return (
              <div key={mod.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Locked modules (any type) */}
                {isLocked ? (
                  <div className="flex items-center gap-4 px-5 py-4 opacity-50 cursor-not-allowed select-none">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-slate-100 text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-400 text-sm">{mod.title}</p>
                      {mod.description && (
                        <p className="text-xs text-slate-300 mt-0.5 truncate">{mod.description}</p>
                      )}
                      {mod.estimated_duration && (
                        <span className="flex items-center gap-1 text-xs text-slate-300 mt-1">
                          <Clock className="h-3 w-3" />{formatDuration(mod.estimated_duration)}
                        </span>
                      )}
                    </div>
                    <Lock className="h-5 w-5 text-slate-300 shrink-0" />
                  </div>
                ) : isSingle && (mod.examBlocked) ? (
                  <div className="flex items-center gap-4 px-5 py-4 bg-red-50/40 cursor-not-allowed">
                    {cardInner}
                    <div className="shrink-0 text-xs text-red-400 font-medium text-right max-w-[120px] leading-tight">
                      Contact your instructor to reset
                    </div>
                  </div>
                ) : isSingle && isPackage && mod.pkgStatus === "failed" ? (
                  <div className="flex items-center gap-4 px-5 py-4">
                    {cardInner}
                  </div>
                ) : isSingle && href && !moduleCompleted ? (
                  <Link href={href} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group">
                    {cardInner}
                  </Link>
                ) : isSingle && moduleCompleted ? (
                  <div className="flex items-center gap-4 px-5 py-4 bg-emerald-50/40 cursor-default">
                    {cardInner}
                  </div>
                ) : (
                  <div className="flex items-center gap-4 px-5 py-4">
                    {cardInner}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Live Sessions section ──────────────────────────────── */}
        {(liveSessions ?? []).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#1B4F8A]" />
              Live Sessions
            </h2>

            {/* Upcoming */}
            {upcomingSessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Upcoming</p>
                {upcomingSessions.map((s: any) => {
                  const att = sessionAttMap.get(s.id)
                  return (
                    <div key={s.id}
                      className="bg-white rounded-xl border border-[#1B4F8A]/20 overflow-hidden">
                      <div className="flex items-start gap-4 px-5 py-4">
                        <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                          <CalendarDays className="h-5 w-5 text-[#1B4F8A]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(s.session_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                              {" · "}{s.start_time?.slice(0, 5)}
                              {s.duration_minutes && <> · {s.duration_minutes} min</>}
                            </span>
                            {s.location && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {s.location}
                              </span>
                            )}
                          </div>
                          {att && (
                            <span className={cn(
                              "inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full",
                              att.status === "present" ? "bg-emerald-100 text-emerald-700" :
                              att.status === "late"    ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            )}>
                              {att.status === "present" ? "✓ Present" :
                               att.status === "late"    ? "⏱ Late" : att.status}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col gap-2 items-end">
                          {s.meeting_link && (
                            <a href={s.meeting_link} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1B4F8A] text-white hover:bg-[#163f6e] transition-colors">
                              <Video className="h-3.5 w-3.5" /> Join
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Past */}
            {pastSessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Past Sessions</p>
                {pastSessions.map((s: any) => {
                  const att = sessionAttMap.get(s.id)
                  return (
                    <div key={s.id}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden opacity-80">
                      <div className="flex items-start gap-4 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <CalendarDays className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-700 text-sm">{s.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(s.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            {" · "}{s.start_time?.slice(0, 5)}
                            {s.location && <> · {s.location}</>}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {att ? (
                            <span className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full",
                              att.status === "present" ? "bg-emerald-100 text-emerald-700" :
                              att.status === "late"    ? "bg-amber-100 text-amber-700" :
                              att.status === "excused" ? "bg-blue-100 text-blue-700" :
                              "bg-red-50 text-red-500"
                            )}>
                              {att.status === "present" ? "✓ Present" :
                               att.status === "late"    ? "⏱ Late" :
                               att.status === "excused" ? "Excused" : "Absent"}
                            </span>
                          ) : (
                            <span className="text-xs bg-red-50 text-red-400 font-semibold px-2 py-0.5 rounded-full">
                              Absent
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Previous attempts (earlier runs of this course) ───────── */}
        {previousRuns.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <History className="h-5 w-5 text-[#1B4F8A]" />
              Previous attempts
            </h2>
            <p className="text-xs text-slate-500 px-1">You took this course before. Those results are kept separately and don&apos;t affect this attempt.</p>
            {previousRuns.map(r => {
              const exam = runExam.get(r.id)
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-medium text-slate-800">{r.lms_programs?.name ?? "Individual enrollment"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Enrolled {fmtDate(r.enrolled_at)}
                      {r.completed_at && <> · Completed {fmtDate(r.completed_at)}</>}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{Math.min(100, Math.round(r.progress_pct ?? 0))}% progress</span>
                  {exam && (
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                      exam.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600")}>
                      Final exam {exam.passed ? "passed" : "not passed"} · {exam.pct}%
                    </span>
                  )}
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                    r.status === "completed" ? "bg-emerald-100 text-emerald-700"
                    : r.status === "dropped" ? "bg-slate-100 text-slate-500"
                    : "bg-blue-100 text-blue-700")}>
                    {r.status === "completed" ? "Completed" : r.status === "dropped" ? "Withdrawn" : "Active"}
                  </span>
                  {runCert.get(r.id) && (
                    <Link href="/lms/certificates" className="text-xs font-medium text-[#1B4F8A] hover:underline flex items-center gap-1">
                      <Award className="h-3.5 w-3.5" /> Certificate
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Feedback form ────────────────────────────────── */}
        {showFeedbackForm && (
          <CourseFeedbackForm courseId={courseId} isAnonymous={fb.settings.anonymous} askInstructor={fb.askInstructor}
            mandatory={fb.settings.mandatory} reason={fb.reason ?? "completed"} />
        )}
        {alreadySubmittedFeedback && (
          <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Feedback submitted</p>
              <p className="text-xs text-slate-500">Thank you for your feedback on this course.</p>
            </div>
          </div>
        )}
    </div>
  )
}
