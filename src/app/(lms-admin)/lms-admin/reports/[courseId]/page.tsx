import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import GroupCourseReportView from "@/components/lms/GroupCourseReportView"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

interface Props { params: Promise<{ courseId: string }> }

export default async function LmsCourseReportPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params

  const [courseRes, enrollmentsRes, sessionsRes, modulesRes] = await Promise.all([
    db.from("lms_courses")
      .select("id, title, delivery_mode, status, description")
      .eq("id", courseId)
      .single(),
    db.from("lms_enrollments")
      .select(`
        id, status, enrolled_at, completed_at, progress_pct, time_spent_s,
        lms_students(id, name, email, company, job_title)
      `)
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false }),
    db.from("lms_sessions")
      .select("id, title, session_date, start_time, closed_at, lms_attendance(student_id, status)")
      .eq("course_id", courseId)
      .order("session_date", { ascending: false }),
    // Fetch assessment modules (exam + assignment) for this course
    db.from("lms_modules")
      .select("id, module_type, title")
      .eq("course_id", courseId)
      .in("module_type", ["final_exam", "assignment"]),
  ])

  if (!courseRes.data) notFound()
  const course      = courseRes.data as any
  const enrollments = (enrollmentsRes.data ?? []) as any[]
  const sessions    = (sessionsRes.data ?? []) as any[]
  const assessmentModules = (modulesRes.data ?? []) as any[]

  // Fetch all module attempts for the assessment modules in this course
  const assessmentModuleIds = assessmentModules.map(m => m.id)
  const { data: attemptsRaw } = assessmentModuleIds.length > 0
    ? await db.from("lms_module_attempts")
        .select("student_id, module_id, status, score, max_score, passed, submitted_at")
        .in("module_id", assessmentModuleIds)
        .order("submitted_at", { ascending: false })
    : { data: [] }
  const attempts = (attemptsRaw ?? []) as any[]

  const examModule       = assessmentModules.find(m => m.module_type === "final_exam")
  const assignmentModules = assessmentModules.filter(m => m.module_type === "assignment")

  const enriched = enrollments.map((e: any) => {
    // progress_pct is maintained by syncEnrollmentProgress — use it directly (package model)
    const progressPct = Math.round(e.progress_pct ?? 0)

    // Attendance: count sessions attended
    const attended  = sessions.filter((s: any) =>
      (s.lms_attendance ?? []).some(
        (a: any) => a.student_id === e.lms_students?.id && ["present","late"].includes(a.status)
      )
    ).length
    const attendPct = sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : null

    const studentId = e.lms_students?.id

    // Best exam attempt (highest score, or latest)
    const examAttempts = examModule
      ? attempts.filter(a => a.module_id === examModule.id && a.student_id === studentId)
      : []
    const bestExam = examAttempts.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null

    // Assignment attempts for this student
    const assignAttempts = assignmentModules.map(mod => ({
      moduleId:  mod.id,
      title:     mod.title,
      attempt:   attempts.find(a => a.module_id === mod.id && a.student_id === studentId) ?? null,
    }))
    const pendingAssign  = assignAttempts.filter(a => a.attempt?.status === "submitted").length
    const gradedAssign   = assignAttempts.filter(a => a.attempt?.status === "graded").length

    return {
      enrollmentId:   e.id,
      student:        e.lms_students,
      status:         e.status,
      enrolledAt:     e.enrolled_at,
      completedAt:    e.completed_at,
      progressPct,
      timeS:          e.time_spent_s ?? 0,
      attendPct,
      attended,
      sessionTotal:   sessions.length,
      bestExam,
      assignAttempts,
      pendingAssign,
      gradedAssign,
      totalAssign:    assignmentModules.length,
    }
  })

  const totalEnrolled   = enriched.length
  const totalCompleted  = enriched.filter(e => e.status === "completed").length
  const avgProgress     = totalEnrolled > 0
    ? Math.round(enriched.reduce((s, e) => s + e.progressPct, 0) / totalEnrolled)
    : 0
  const completionRate  = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0
  const examPassCount   = enriched.filter(e => e.bestExam?.passed).length
  const pendingGrades   = enriched.reduce((s, e) => s + e.pendingAssign, 0)

  // ── Time-on-task aggregate ──────────────────────────────────────
  const totalTimeS = enrollments.reduce((s, e) => s + (e.time_spent_s ?? 0), 0)
  const avgTimeS   = totalEnrolled > 0 ? Math.round(totalTimeS / totalEnrolled) : 0
  const fmtDur = (s: number) => { if (!s || s < 60) return s >= 1 ? `${s}s` : "—"; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }

  // ── Progress distribution (buckets) ─────────────────────────────
  const buckets = [
    { label: "0–25%",  count: enriched.filter(e => e.progressPct < 25).length },
    { label: "25–50%", count: enriched.filter(e => e.progressPct >= 25 && e.progressPct < 50).length },
    { label: "50–75%", count: enriched.filter(e => e.progressPct >= 50 && e.progressPct < 75).length },
    { label: "75–99%", count: enriched.filter(e => e.progressPct >= 75 && e.progressPct < 100).length },
    { label: "100%",   count: enriched.filter(e => e.progressPct >= 100).length },
  ]
  const bucketMax = Math.max(1, ...buckets.map(b => b.count))

  // ── At-risk students ────────────────────────────────────────────
  const atRisk = enriched
    .filter(e => e.status !== "dropped")
    .map(e => {
      const reasons: string[] = []
      if (e.progressPct < 40) reasons.push("Low progress")
      if (e.bestExam && !e.bestExam.passed) reasons.push("Failed exam")
      if (e.attendPct !== null && e.attendPct < 50) reasons.push("Low attendance")
      if (e.pendingAssign > 0) reasons.push(`${e.pendingAssign} ungraded`)
      return { name: e.student?.name, email: e.student?.email, id: e.student?.id, progressPct: e.progressPct, reasons }
    })
    .filter(e => e.reasons.length > 0)

  // ── Per-module cohort performance ───────────────────────────────
  const { data: allModules } = await db.from("lms_modules")
    .select("id, title, module_type, order_index").eq("course_id", courseId).order("order_index")
  const studentIds = enriched.map(e => e.student?.id).filter(Boolean) as string[]
  const pkgModIds  = (allModules ?? []).filter((m: any) => m.module_type === "package").map((m: any) => m.id)
  const { data: pkgRows } = pkgModIds.length
    ? await db.from("lms_packages").select("id, module_id").in("module_id", pkgModIds)
    : { data: [] }
  const pkgIds = (pkgRows ?? []).map((p: any) => p.id)
  const [pkgItemsRes, pkgProgRes] = await Promise.all([
    pkgIds.length ? db.from("lms_package_items").select("package_id").in("package_id", pkgIds) : Promise.resolve({ data: [] }),
    pkgIds.length && studentIds.length
      ? db.from("lms_package_progress").select("package_id, student_id, completed_items, status").in("package_id", pkgIds).in("student_id", studentIds)
      : Promise.resolve({ data: [] }),
  ])
  const totalByPkg: Record<string, number> = {}
  for (const it of (pkgItemsRes.data ?? []) as any[]) totalByPkg[it.package_id] = (totalByPkg[it.package_id] ?? 0) + 1
  const pkgIdByMod = new Map((pkgRows ?? []).map((p: any) => [p.module_id, p.id]))
  const progByKey: Record<string, any> = {}
  for (const pp of (pkgProgRes.data ?? []) as any[]) progByKey[`${pp.package_id}:${pp.student_id}`] = pp

  const moduleStats = (allModules ?? []).map((m: any) => {
    if (m.module_type === "package") {
      const pkgId = pkgIdByMod.get(m.id)
      const total = pkgId ? (totalByPkg[pkgId] ?? 0) : 0
      let sum = 0, done = 0
      for (const sid of studentIds) {
        const pp = pkgId ? progByKey[`${pkgId}:${sid}`] : null
        const isDone = pp?.status === "passed" || pp?.status === "completed"
        const comp = Array.isArray(pp?.completed_items) ? pp.completed_items.length : 0
        const pct = isDone ? 100 : total > 0 ? Math.min(100, Math.round((comp / total) * 100)) : 0
        sum += pct; if (pct >= 100) done++
      }
      return { title: m.title, type: "package", avg: studentIds.length ? Math.round(sum / studentIds.length) : 0, done, total: studentIds.length }
    }
    if (m.module_type === "final_exam") {
      const avg = totalEnrolled
        ? Math.round(enriched.reduce((s, e) => s + (e.bestExam?.score != null && e.bestExam?.max_score ? (e.bestExam.score / e.bestExam.max_score) * 100 : 0), 0) / totalEnrolled)
        : 0
      return { title: m.title, type: "final_exam", avg, done: examPassCount, total: totalEnrolled }
    }
    return { title: m.title, type: m.module_type, avg: null as number | null, done: null as number | null, total: totalEnrolled }
  })

  // Stored cohort expert assessment (AI)
  const { data: courseAssessment } = await db.from("lms_course_assessments")
    .select("assessment, generated_at").eq("course_id", courseId).maybeSingle()

  const reportData = {
    course: { id: courseId, title: course.title, delivery_mode: course.delivery_mode ?? "online" },
    stats: {
      enrolled: totalEnrolled, completed: totalCompleted, avgProgress, completionRate,
      examPass: examPassCount, examExists: !!examModule, pendingGrades, avgTimeS, totalTimeS,
    },
    buckets, bucketMax, moduleStats, atRisk,
    roster: enriched.map((e: any) => ({
      id:         e.student?.id,
      name:       e.student?.name,
      email:      e.student?.email,
      status:     e.status,
      progressPct: e.progressPct,
      attendPct:  e.attendPct,
      attended:   e.attended,
      sessionTotal: e.sessionTotal,
      examPassed: e.bestExam ? !!e.bestExam.passed : null,
      examPct:    e.bestExam?.score != null && e.bestExam?.max_score ? Math.round((e.bestExam.score / e.bestExam.max_score) * 100) : null,
      timeS:      e.timeS,
    })),
    assessment:  (courseAssessment?.assessment as any) ?? null,
    generatedAt: (courseAssessment?.generated_at as any) ?? null,
  }

  return <GroupCourseReportView data={reportData} />
}
