import { db } from "@/lib/db"

// ── Types ──────────────────────────────────────────────────────────
export interface ReportItem {
  title: string
  type: string
  activity_type?: string | null
  pct: number | null
  passed: boolean | null
  ai?: string | null            // per-item Expert evaluation (if stored)
  answer?: string | null        // learner's answer (if stored)
}
export interface ModuleAI { summary: string; strengths: string[]; weaknesses: string[]; development: string[] }
export interface ExamSectionQuestion { text: string; points: number; scoreAchieved: number }
export interface ExamSection {
  pct: number; correct: number; partial: number; zero: number
  earned: number; possible: number; questions: ExamSectionQuestion[]
}
export interface ReportModule {
  id: string
  title: string
  order_index: number
  module_type: string
  summary: string
  topics: string[]
  status: string                // passed | failed | in_progress | not_started
  score: number | null          // overall module pct
  timeSpent: number             // seconds
  startedAt: string | null
  completedAt: string | null
  items: ReportItem[]
  ai?: ModuleAI | null          // AI analysis of this module (from the expert assessment)
  examSection?: ExamSection | null  // this module's slice of the final exam, graded
}
export interface TopicMastery { topic: string; pct: number; level: "strong" | "developing" | "weak" }
export interface CourseReport {
  student: { id: string; name: string; email: string; job_title: string | null; company: string | null; department: string | null }
  course: { id: string; title: string; delivery_mode: string | null }
  enrollment: { status: string; enrolled_at: string; completed_at: string | null; progress_pct: number }
  overall: { score: number | null; completionPct: number; timeSpent: number; attendancePct: number | null; presentCount: number; sessionTotal: number }
  modules: ReportModule[]
  exam: { title: string; score: number | null; maxScore: number | null; pct: number | null; passed: boolean; attempts: number; maxAttempts: number } | null
  assignments: { title: string; status: string; score: number | null; maxScore: number | null; note: string | null }[]
  topicMastery: TopicMastery[]
  assessment: {
    executiveSummary: string
    strengths: string[]
    weaknesses: string[]
    recommendations: { area: string; score: number | null; action: string }[]
    generated_at: string
  } | null
  security: {
    tabs: number; fs: number; rightClicks: number; copyAttempts: number
    totalEvents: number
    riskLevel: "clean" | "medium" | "high"
    analysis: string | null
  } | null
}

const num = (v: any): number | null => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v))

// Grade one exam question against the learner's answer → points earned
function gradeQuestion(q: any, ans: any): number {
  const pts = Number(q?.points ?? 0)
  if (!q || ans === undefined || ans === null) return 0
  if (q.type === "mcq_single") {
    const correct = (q.options ?? []).find((o: any) => o.correct)
    return correct && ans === correct.id ? pts : 0
  }
  if (q.type === "mcq_multiple") {
    const correctIds = new Set((q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.id))
    const chosen = new Set(Array.isArray(ans) ? ans : [ans])
    const exact = chosen.size === correctIds.size && [...correctIds].every(id => chosen.has(id))
    return exact ? pts : 0
  }
  // ordering / matching / open_ended are not auto-graded in the section view
  return 0
}

// ── Builder ────────────────────────────────────────────────────────
export async function buildCourseReport(studentId: string, courseId: string): Promise<CourseReport | null> {
  const [studentRes, courseRes, enrollRes] = await Promise.all([
    db.from("lms_students").select("id, name, email, job_title, company, department").eq("id", studentId).single(),
    db.from("lms_courses").select("id, title, delivery_mode").eq("id", courseId).single(),
    db.from("lms_enrollments").select("status, enrolled_at, completed_at, progress_pct").eq("student_id", studentId).eq("course_id", courseId).maybeSingle(),
  ])
  if (!studentRes.data || !courseRes.data || !enrollRes.data) return null

  // Modules + analysis, packages + items, progress, exam attempts, assignments, attendance
  const [modulesRes, analysisRes, packagesRes, progressRes, attemptsRes, assignRes, sessionsRes, assessmentRes] = await Promise.all([
    db.from("lms_modules").select("id, title, module_type, order_index, activity_settings, questions").eq("course_id", courseId).order("order_index"),
    db.from("lms_module_analysis").select("module_id, analysis").eq("course_id", courseId),
    db.from("lms_packages").select("id, module_id, pass_mark, lms_package_items(id, title, type, config)").eq("course_id", courseId),
    db.from("lms_package_progress").select("package_id, module_id, status, score, item_scores, completed_items, time_spent, started_at, completed_at").eq("student_id", studentId).eq("course_id", courseId),
    db.from("lms_module_attempts").select("module_id, attempt_no, score, max_score, passed, status, answers, ai_feedback").eq("student_id", studentId).eq("course_id", courseId),
    db.from("lms_assignment_submissions").select("status, score, max_score, instructor_note, lms_modules(id, title, course_id)").eq("student_id", studentId),
    db.from("lms_sessions").select("id, lms_attendance(student_id, status)").eq("course_id", courseId),
    db.from("lms_report_assessments").select("assessment, generated_at").eq("student_id", studentId).eq("course_id", courseId).maybeSingle(),
  ])

  const modules    = modulesRes.data ?? []
  const analysisBy = new Map((analysisRes.data ?? []).map((a: any) => [a.module_id, a.analysis ?? {}]))
  const pkgByMod   = new Map((packagesRes.data ?? []).map((p: any) => [p.module_id, p]))
  const progByMod  = new Map((progressRes.data ?? []).map((p: any) => [p.module_id, p]))
  const attempts   = attemptsRes.data ?? []

  // ── Per-module ──
  const reportModules: ReportModule[] = []
  for (const m of modules) {
    if (m.module_type !== "package") continue
    const analysis: any = analysisBy.get(m.id) ?? {}
    const pkg: any = pkgByMod.get(m.id)
    const prog: any = progByMod.get(m.id)
    const itemMeta = new Map<string, any>((pkg?.lms_package_items ?? []).map((it: any) => [it.id, it]))

    const itemScores: Record<string, any> = prog?.item_scores ?? {}
    const items: ReportItem[] = Object.entries(itemScores).map(([itemId, sc]: [string, any]) => {
      const meta = itemMeta.get(itemId)
      return {
        title: meta?.title ?? "Item",
        type: meta?.type ?? "activity",
        activity_type: meta?.config?.activity_type ?? null,
        pct: num(sc?.pct ?? sc?.score),
        passed: typeof sc?.passed === "boolean" ? sc.passed : null,
        ai: sc?.ai ?? sc?.comment ?? null,
        answer: sc?.answer ?? null,
      }
    })

    reportModules.push({
      id: m.id, title: m.title, order_index: m.order_index, module_type: m.module_type,
      summary: analysis.summary ?? "",
      topics: Array.isArray(analysis.topics) ? analysis.topics : [],
      status: prog?.status ?? "not_started",
      score: num(prog?.score),
      timeSpent: prog?.time_spent ?? 0,
      startedAt: prog?.started_at ?? null,
      completedAt: prog?.completed_at ?? null,
      items,
    })
  }

  // ── Final exam ──
  const examMod = modules.find((m: any) => m.module_type === "final_exam")
  let exam: CourseReport["exam"] = null
  if (examMod) {
    const examAttempts = attempts.filter((a: any) => a.module_id === examMod.id)
    if (examAttempts.length) {
      const best = examAttempts.slice().sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0]
      const maxAttempts = (examMod as any).activity_settings?.max_attempts ?? 3
      const pct = best.max_score ? Math.round((best.score / best.max_score) * 100) : num(best.score)
      exam = {
        title: examMod.title,
        score: num(best.score), maxScore: num(best.max_score), pct,
        passed: !!examAttempts.some((a: any) => a.passed),
        attempts: examAttempts.length, maxAttempts,
      }
    }
  }

  // ── Final-exam performance by module-section (graded from the learner's answers) ──
  if (examMod) {
    const examQuestions: any[] = Array.isArray((examMod as any).questions) ? (examMod as any).questions : []
    const qById = new Map(examQuestions.map((q: any) => [q.id, q]))
    const sections: any[] = Array.isArray(analysisBy.get(examMod.id)?.sections) ? analysisBy.get(examMod.id)!.sections : []
    const examAttempts = attempts.filter((a: any) => a.module_id === examMod.id)
    const best = examAttempts.slice().sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0]
    const answers: any = best?.answers && typeof best.answers === "object" && !Array.isArray(best.answers) ? best.answers : {}
    const sectionByMod = new Map<string, ExamSection>()
    for (const s of sections) {
      const qs = ((s.question_ids ?? []) as string[]).map((qid: string) => {
        const q = qById.get(qid); if (!q) return null
        const pts = Number(q.points ?? 0)
        return { text: q.text ?? "", points: pts, scoreAchieved: gradeQuestion(q, answers[qid]) }
      }).filter(Boolean) as ExamSectionQuestion[]
      if (!qs.length) continue
      const earned = qs.reduce((a, b) => a + b.scoreAchieved, 0)
      const possible = qs.reduce((a, b) => a + b.points, 0)
      const correct = qs.filter(q => q.points > 0 && q.scoreAchieved >= q.points).length
      const zero = qs.filter(q => q.scoreAchieved === 0).length
      sectionByMod.set(s.module_id, {
        pct: possible > 0 ? Math.round((earned / possible) * 100) : 0,
        correct, partial: qs.length - correct - zero, zero, earned, possible, questions: qs,
      })
    }
    for (const rm of reportModules) rm.examSection = sectionByMod.get(rm.id) ?? null
  }

  // ── Assignments ──
  const assignments = (assignRes.data ?? [])
    .filter((a: any) => (a.lms_modules as any)?.course_id === courseId)
    .map((a: any) => ({
      title: (a.lms_modules as any)?.title ?? "Assignment",
      status: a.status, score: num(a.score), maxScore: num(a.max_score), note: a.instructor_note ?? null,
    }))

  // ── Attendance ──
  const sessions = sessionsRes.data ?? []
  const presentCount = sessions.filter((s: any) =>
    (s.lms_attendance ?? []).some((at: any) => at.student_id === studentId && ["present", "late"].includes(at.status))
  ).length
  const attendancePct = sessions.length ? Math.round((presentCount / sessions.length) * 100) : null

  // ── Topic mastery (module score → its topics, averaged) ──
  const topicAgg = new Map<string, { sum: number; n: number }>()
  for (const rm of reportModules) {
    if (rm.score === null) continue
    for (const t of rm.topics) {
      const cur = topicAgg.get(t) ?? { sum: 0, n: 0 }
      cur.sum += rm.score; cur.n += 1; topicAgg.set(t, cur)
    }
  }
  const topicMastery: TopicMastery[] = [...topicAgg.entries()]
    .map(([topic, { sum, n }]) => {
      const pct = Math.round(sum / n)
      return { topic, pct, level: (pct >= 80 ? "strong" : pct >= 60 ? "developing" : "weak") as TopicMastery["level"] }
    })
    .sort((a, b) => a.pct - b.pct)

  // ── Overall ──
  const moduleScores = reportModules.map(m => m.score).filter((s): s is number => s !== null)
  const scorePool = [...moduleScores, ...(exam?.pct != null ? [exam.pct] : [])]
  const overallScore = scorePool.length ? Math.round(scorePool.reduce((a, b) => a + b, 0) / scorePool.length) : null
  const timeSpent = reportModules.reduce((s, m) => s + m.timeSpent, 0)

  // ── Expert assessment (AI-driven, exam-style structure) ──
  const aRaw: any = assessmentRes.data?.assessment
  const assessment = aRaw && (aRaw.executive_summary || aRaw.narrative)
    ? {
        executiveSummary: aRaw.executive_summary ?? aRaw.narrative ?? "",
        strengths: Array.isArray(aRaw.strengths) ? aRaw.strengths : [],
        weaknesses: Array.isArray(aRaw.improvements) ? aRaw.improvements : (Array.isArray(aRaw.weaknesses) ? aRaw.weaknesses : []),
        recommendations: Array.isArray(aRaw.recommendations)
          ? aRaw.recommendations.map((r: any) => ({ area: String(r.area ?? ""), score: typeof r.score === "number" ? r.score : null, action: String(r.action ?? "") }))
          : [],
        generated_at: assessmentRes.data!.generated_at,
      }
    : null

  // Attach per-module AI analysis (keyed by module title) — the exam's "section_analyses" equivalent
  const modAnalyses: Record<string, any> = (aRaw?.module_analyses && typeof aRaw.module_analyses === "object") ? aRaw.module_analyses : {}
  for (const rm of reportModules) {
    const a = modAnalyses[rm.title]
    rm.ai = a ? {
      summary: a.summary ?? "",
      strengths: Array.isArray(a.strengths) ? a.strengths : [],
      weaknesses: Array.isArray(a.weaknesses) ? a.weaknesses : [],
      development: Array.isArray(a.development) ? a.development : [],
    } : null
  }

  // ── Security / integrity (from the exam attempt's captured events) ──
  let security: CourseReport["security"] = null
  if (examMod) {
    const best2 = attempts.filter((a: any) => a.module_id === examMod.id).slice().sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0]
    const sec: any = best2?.ai_feedback?.security_events
    if (sec) {
      const tabs = Number(sec.tabs ?? 0), fs = Number(sec.fs ?? 0), rc = Number(sec.rightClicks ?? 0), cp = Number(sec.copyAttempts ?? 0)
      const totalEvents = tabs + fs
      security = {
        tabs, fs, rightClicks: rc, copyAttempts: cp, totalEvents,
        riskLevel: totalEvents === 0 ? "clean" : totalEvents <= 2 ? "medium" : "high",
        analysis: aRaw?.security_analysis?.behavioral_assessment ?? null,
      }
    }
  }

  return {
    student: studentRes.data as any,
    course: courseRes.data as any,
    enrollment: enrollRes.data as any,
    overall: {
      score: overallScore,
      completionPct: Math.round(num(enrollRes.data.progress_pct) ?? 0),
      timeSpent, attendancePct, presentCount, sessionTotal: sessions.length,
    },
    modules: reportModules,
    exam,
    assignments,
    topicMastery,
    assessment,
    security,
  }
}
