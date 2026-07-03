export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  CheckCircle2, PlayCircle, FileText, Image as ImageIcon,
  Link2, ListOrdered, HelpCircle, ClipboardList,
  Lock, Globe, Monitor, Layers, Clock, ChevronRight,
  CalendarDays, MapPin, Video, FlaskConical, GraduationCap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import CourseFeedbackForm from "@/components/lms/CourseFeedbackForm"

// ── Icons & labels ────────────────────────────────────────────
const CONTENT_ICONS: Record<string, React.ElementType> = {
  video:         PlayCircle,
  ppt:           FileText,
  pdf:           FileText,
  text:          FileText,
  image:         ImageIcon,
  link:          Link2,
  steps:         ListOrdered,
  quiz:          HelpCircle,
  progress_test: FlaskConical,
  final_exam:    GraduationCap,
  assignment:    ClipboardList,
}

const CONTENT_COLORS: Record<string, string> = {
  video:         "text-purple-600 bg-purple-50",
  ppt:           "text-orange-600 bg-orange-50",
  pdf:           "text-red-600 bg-red-50",
  text:          "text-slate-600 bg-slate-100",
  image:         "text-pink-600 bg-pink-50",
  link:          "text-blue-600 bg-blue-50",
  steps:         "text-teal-600 bg-teal-50",
  quiz:          "text-amber-600 bg-amber-50",
  progress_test: "text-blue-600 bg-blue-50",
  final_exam:    "text-amber-700 bg-amber-100",
  assignment:    "text-green-600 bg-green-50",
}

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

  // Verify enrollment
  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at, progress_pct")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()

  if (!enrollment) notFound()

  // Fetch course
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, description, delivery_mode, thumbnail_url, progress_enforcement, feedback_enabled, feedback_anonymous, start_date, end_date")
    .eq("id", courseId)
    .single()

  if (!course) notFound()

  const now = new Date()
  const courseNotStarted = course.start_date && new Date(course.start_date) > now
  const courseEnded      = course.end_date   && new Date(course.end_date)   < now

  // Fetch modules with content
  const { data: modules } = await db
    .from("lms_modules")
    .select(`
      id, title, description, delivery_type, order_index, estimated_duration, module_type, lock_until_previous, is_mandatory, activity_settings,
      lms_content_items(id, title, type, order_index, is_mandatory, download_allowed, completion_rule)
    `)
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  // Fetch live sessions for this course
  const { data: liveSessions } = await db
    .from("lms_sessions")
    .select("id, title, session_date, start_time, duration_minutes, location, closed_at, meeting_link")
    .eq("course_id", courseId)
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false })

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
  const today = new Date().toISOString().slice(0, 10)
  const upcomingSessions = (liveSessions ?? []).filter(
    (s: any) => s.session_date >= today && !s.closed_at
  ).reverse() // chronological
  const pastSessions = (liveSessions ?? []).filter(
    (s: any) => s.session_date < today || s.closed_at
  )

  // Fetch student's progress for this course (content items)
  const { data: progressRows } = await db
    .from("lms_progress")
    .select("content_item_id, status, position")
    .eq("student_id", student.id)
    .eq("course_id", courseId)

  const progressMap = new Map(
    (progressRows ?? []).map((p: any) => [p.content_item_id, p])
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
          .eq("student_id", student.id)
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
      .eq("student_id", student.id)
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
        const maxAttempts = (mod?.activity_settings as any)?.max_attempts ?? 3
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
    const items = (m.lms_content_items ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
    const mandatory = items.filter((i: any) => i.is_mandatory)
    const doneCount = mandatory.filter(
      (i: any) => progressMap.get(i.id)?.status === "completed"
    ).length
    const pct = mandatory.length > 0 ? Math.round(doneCount / mandatory.length * 100) : 0
    return { ...m, items, mandatory, doneCount, pct, pkgStatus: null, pkgScore: null, examAttempt: null }
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

  // Check if student already submitted feedback
  let alreadySubmittedFeedback = false
  if (enrollment.status === "completed" && course.feedback_enabled) {
    const { data: existingFeedback } = await db
      .from("lms_feedback")
      .select("id")
      .eq("student_id", student.id)
      .eq("course_id", courseId)
      .maybeSingle()
    alreadySubmittedFeedback = !!existingFeedback
  }

  const showFeedbackForm = enrollment.status === "completed" && course.feedback_enabled && !alreadySubmittedFeedback

  const DeliveryIcon  = DELIVERY_ICONS[course.delivery_mode] ?? Globe

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="p-6 space-y-6">

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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
                {course.description && (
                  <p className="text-slate-500 text-sm mt-1">{course.description}</p>
                )}
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
              </div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="space-y-3">
          {modsWithLock.map((mod: any, mi: number) => {
            const isPackage = mod.module_type === "package"
            const isExam    = mod.module_type === "final_exam"
            const isAssign  = mod.module_type === "assignment"
            const isSession = mod.module_type === "live_session"
            const isSingle  = isPackage || isExam || isAssign || isSession
            const isLocked  = mod.isModuleLocked === true || !!courseNotStarted

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
                  <>
                    {/* Multi-item modules: non-clickable header */}
                    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100">
                      {cardInner}
                    </div>

                    {/* Content items */}
                    <div className="divide-y divide-slate-50">
                      {mod.items.map((item: any, ci: number) => {
                        const prog   = progressMap.get(item.id)
                        const done   = prog?.status === "completed"
                        const inProg = prog?.status === "in_progress"
                        const Icon   = CONTENT_ICONS[item.type] ?? FileText
                        const color  = CONTENT_COLORS[item.type] ?? "text-slate-600 bg-slate-100"

                        let locked = !!courseNotStarted
                        if (!locked && course.progress_enforcement && ci > 0) {
                          const prevMandatory = mod.items.slice(0, ci).filter((i: any) => i.is_mandatory)
                          locked = prevMandatory.some((i: any) => progressMap.get(i.id)?.status !== "completed")
                        }

                        const itemInner = (
                          <>
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-medium", done ? "text-slate-400 line-through" : "text-slate-800")}>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-slate-400 uppercase">{item.type}</span>
                                {!item.is_mandatory && <span className="text-xs text-slate-300">Optional</span>}
                                {inProg && prog?.position && (
                                  <span className="text-[10px] font-medium bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                    ▶ Resume
                                    {prog.position.second != null && ` ${Math.floor(prog.position.second / 60)}m${prog.position.second % 60}s`}
                                    {prog.position.page  != null && ` p.${prog.position.page}`}
                                    {prog.position.slide != null && ` slide ${prog.position.slide}`}
                                    {prog.position.step  != null && ` step ${prog.position.step}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {locked ? <Lock className="h-4 w-4 text-slate-300" />
                               : done  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                               : <ChevronRight className="h-4 w-4 text-slate-300" />}
                            </div>
                          </>
                        )

                        return locked ? (
                          <div key={item.id} className="flex items-center gap-4 px-5 py-3.5 opacity-50 cursor-not-allowed select-none">
                            {itemInner}
                          </div>
                        ) : (
                          <Link key={item.id} href={`/lms/courses/${courseId}/content/${item.id}`}
                            className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50">
                            {itemInner}
                          </Link>
                        )
                      })}
                    </div>
                  </>
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
                          {!att && (
                            <Link href={`/lms/attend/${s.id}`}
                              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#1B4F8A] text-[#1B4F8A] hover:bg-[#1B4F8A]/5 transition-colors">
                              Check In
                            </Link>
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

        {/* ── Feedback form ────────────────────────────────── */}
        {showFeedbackForm && (
          <CourseFeedbackForm courseId={courseId} isAnonymous={course.feedback_anonymous} />
        )}
        {enrollment.status === "completed" && course.feedback_enabled && alreadySubmittedFeedback && (
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
