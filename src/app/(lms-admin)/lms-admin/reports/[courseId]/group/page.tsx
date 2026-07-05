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
      .select("id, title, delivery_mode, status, description, start_date, end_date, lms_course_instructors(admin_users(name))")
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
      ? db.from("lms_package_progress").select("package_id, student_id, completed_items, status, time_spent").in("package_id", pkgIds).in("student_id", studentIds)
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
      let sum = 0, done = 0, timeSum = 0
      for (const sid of studentIds) {
        const pp = pkgId ? progByKey[`${pkgId}:${sid}`] : null
        const isDone = pp?.status === "passed" || pp?.status === "completed"
        const comp = Array.isArray(pp?.completed_items) ? pp.completed_items.length : 0
        const pct = isDone ? 100 : total > 0 ? Math.min(100, Math.round((comp / total) * 100)) : 0
        sum += pct; if (pct >= 100) done++
        timeSum += pp?.time_spent ?? 0
      }
      return { title: m.title, type: "package", avg: studentIds.length ? Math.round(sum / studentIds.length) : 0, done, total: studentIds.length, avgTimeS: studentIds.length ? Math.round(timeSum / studentIds.length) : 0 }
    }
    if (m.module_type === "final_exam") {
      const avg = totalEnrolled
        ? Math.round(enriched.reduce((s, e) => s + (e.bestExam?.score != null && e.bestExam?.max_score ? (e.bestExam.score / e.bestExam.max_score) * 100 : 0), 0) / totalEnrolled)
        : 0
      return { title: m.title, type: "final_exam", avg, done: examPassCount, total: totalEnrolled, avgTimeS: 0 }
    }
    return { title: m.title, type: m.module_type, avg: null as number | null, done: null as number | null, total: totalEnrolled, avgTimeS: 0 }
  })

  // ── Charts: exam-score distribution, pass/fail, status ──────────
  const examPct = (e: any) => e.bestExam && e.bestExam.max_score ? (e.bestExam.score / e.bestExam.max_score) * 100 : null
  const examScoreBuckets = examModule ? [
    { label: "0–40%",   count: enriched.filter(e => { const p = examPct(e); return p !== null && p < 40 }).length },
    { label: "40–60%",  count: enriched.filter(e => { const p = examPct(e); return p !== null && p >= 40 && p < 60 }).length },
    { label: "60–80%",  count: enriched.filter(e => { const p = examPct(e); return p !== null && p >= 60 && p < 80 }).length },
    { label: "80–100%", count: enriched.filter(e => { const p = examPct(e); return p !== null && p >= 80 }).length },
  ] : []
  const passFail = {
    passed:       enriched.filter(e => e.bestExam?.passed).length,
    failed:       enriched.filter(e => e.bestExam && !e.bestExam.passed).length,
    notAttempted: enriched.filter(e => !e.bestExam).length,
  }
  const statusCounts = {
    active:    enriched.filter(e => e.status === "active").length,
    completed: enriched.filter(e => e.status === "completed").length,
    dropped:   enriched.filter(e => e.status === "dropped").length,
  }

  // ── Exam question analysis (hardest questions + difficulty spread + topic radar) ──
  let hardestQuestions: { text: string; correctPct: number; n: number }[] = []
  let topicRadar: { label: string; value: number }[] = []
  const questionDifficulty = { mastered: 0, mixed: 0, struggled: 0, total: 0 }
  if (examModule && studentIds.length) {
    const { data: examFull } = await db.from("lms_modules").select("questions").eq("id", examModule.id).single()
    const questions: any[] = Array.isArray((examFull as any)?.questions) ? (examFull as any).questions : []
    const { data: ansRows } = await db.from("lms_module_attempts")
      .select("student_id, answers, attempt_no").eq("module_id", examModule.id)
      .in("student_id", studentIds).not("answers", "is", null).order("attempt_no", { ascending: false })
    const ansByStudent = new Map<string, any>()
    for (const r of (ansRows ?? []) as any[]) if (!ansByStudent.has(r.student_id)) ansByStudent.set(r.student_id, r.answers ?? {})
    const grade = (q: any, ans: any): number | null => {
      if (q.type === "mcq_single")   { const c = (q.options ?? []).find((o: any) => o.correct); return c && ans === c.id ? 1 : 0 }
      if (q.type === "mcq_multiple") { const ci = new Set((q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.id)); const ch = new Set(Array.isArray(ans) ? ans : []); return ch.size === ci.size && [...ci].every(id => ch.has(id)) ? 1 : 0 }
      return null
    }
    if (ansByStudent.size > 0) {
      const perQ = questions.map((q: any) => {
        let correct = 0, n = 0
        for (const ans of ansByStudent.values()) { const g = grade(q, ans?.[q.id]); if (g !== null) { n++; if (g >= 1) correct++ } }
        return { text: q.text ?? "", correctPct: n > 0 ? Math.round((correct / n) * 100) : null, n }
      }).filter((q): q is { text: string; correctPct: number; n: number } => q.correctPct !== null)
      questionDifficulty.total = perQ.length
      for (const q of perQ) { if (q.correctPct >= 80) questionDifficulty.mastered++; else if (q.correctPct >= 40) questionDifficulty.mixed++; else questionDifficulty.struggled++ }
      hardestQuestions = [...perQ].sort((a, b) => a.correctPct - b.correctPct).slice(0, 8)

      // Topic radar — grade each analysis section's questions across the cohort
      const { data: examAnalysisRow } = await db.from("lms_module_analysis")
        .select("analysis").eq("module_id", examModule.id).maybeSingle()
      const sections: any[] = Array.isArray((examAnalysisRow?.analysis as any)?.sections) ? (examAnalysisRow!.analysis as any).sections : []
      const qById = new Map(questions.map((q: any) => [q.id, q]))
      topicRadar = sections.map((s: any) => {
        let correct = 0, n = 0
        for (const qid of (s.question_ids ?? [])) {
          const q = qById.get(qid); if (!q) continue
          for (const ans of ansByStudent.values()) { const g = grade(q, ans?.[qid]); if (g !== null) { n++; if (g >= 1) correct++ } }
        }
        return { label: String(s.title ?? ""), value: n > 0 ? Math.round((correct / n) * 100) : 0 }
      }).filter((t: any) => t.label)
    }
  }

  // ── Certificates ────────────────────────────────────────────────
  const { data: certRows } = await db.from("lms_certificates").select("id, released_at, revoked_at").eq("course_id", courseId)
  const certificates = {
    issued:   (certRows ?? []).filter((c: any) => !c.revoked_at).length,
    released: (certRows ?? []).filter((c: any) => c.released_at && !c.revoked_at).length,
  }

  // ── Attendance summary (only if the course has sessions) ────────
  const attendance = sessions.length > 0 ? {
    overallPct: (() => {
      let present = 0, poss = 0
      for (const s of sessions) for (const e of enriched) { poss++; if ((s.lms_attendance ?? []).some((a: any) => a.student_id === e.student?.id && ["present", "late"].includes(a.status))) present++ }
      return poss > 0 ? Math.round((present / poss) * 100) : 0
    })(),
    perSession: sessions.slice(0, 12).map((s: any) => ({
      title: s.title, date: s.session_date,
      presentPct: totalEnrolled > 0 ? Math.round((s.lms_attendance ?? []).filter((a: any) => ["present", "late"].includes(a.status)).length / totalEnrolled * 100) : 0,
    })),
  } : null

  // ── Feedback summary (only if any submitted) ────────────────────
  const { data: fbRows } = await db.from("lms_feedback")
    .select("rating_overall, rating_content, rating_instructor, rating_pace, rating_materials").eq("course_id", courseId)
  const feedback = (fbRows ?? []).length > 0 ? {
    count: (fbRows ?? []).length,
    avg: (k: string) => { const vals = (fbRows ?? []).map((f: any) => f[k]).filter((v: any) => typeof v === "number"); return vals.length ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length * 10) / 10 : null },
  } : null
  const feedbackRatings = feedback ? [
    { label: "Overall",    value: feedback.avg("rating_overall") },
    { label: "Content",    value: feedback.avg("rating_content") },
    { label: "Instructor", value: feedback.avg("rating_instructor") },
    { label: "Pace",       value: feedback.avg("rating_pace") },
    { label: "Materials",  value: feedback.avg("rating_materials") },
  ].filter(r => r.value !== null) as { label: string; value: number }[] : []

  // Stored cohort expert assessment (AI)
  const { data: courseAssessment } = await db.from("lms_course_assessments")
    .select("assessment, generated_at").eq("course_id", courseId).maybeSingle()

  const instructorName = (course as any).lms_course_instructors?.[0]?.admin_users?.name ?? null

  const reportData = {
    course: { id: courseId, title: course.title, delivery_mode: course.delivery_mode ?? "online", description: course.description ?? "", status: course.status ?? "" },
    meta: {
      startDate:  (course as any).start_date ?? null,
      endDate:    (course as any).end_date ?? null,
      instructor: instructorName,
      preparedBy: "ICS Learning Management System",
    },
    stats: {
      enrolled: totalEnrolled, completed: totalCompleted, avgProgress, completionRate,
      examPass: examPassCount, examExists: !!examModule, pendingGrades, avgTimeS, totalTimeS,
    },
    buckets, bucketMax, moduleStats, atRisk,
    charts: { examScoreBuckets, passFail, statusCounts },
    examAnalysis: { hardestQuestions, difficulty: questionDifficulty, topicRadar },
    certificates,
    attendance,
    feedbackRatings,
    feedbackCount: feedback?.count ?? 0,
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
