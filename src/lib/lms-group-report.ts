import { db } from "@/lib/db"
import { buildCourseReport, gradeQuestion } from "@/lib/lms-course-report"

// ── Types ──────────────────────────────────────────────────────────
export interface GroupReport {
  course: { id: string; title: string; delivery_mode: string | null }
  generatedAt: string
  stats: {
    enrolled: number; completed: number; completionRate: number
    avgMastery: number | null
    examExists: boolean; examPassed: number; examAttempted: number; examPassRate: number | null
    avgTimeS: number
  }
  distribution: { label: string; count: number }[]        // mastery bands
  passFail: { passed: number; failed: number; notAttempted: number }
  moduleStats: { moduleId: string; title: string; avgMastery: number | null; strong: number; weak: number; assessed: number }[]
  topicHeatmap: { moduleId: string; module: string; topic: string; avgPct: number; students: number }[]
  itemAnalysis: {
    hardest: { text: string; correctPct: number; avgPct: number; n: number }[]
    difficulty: { mastered: number; mixed: number; struggled: number; total: number }
  }
  ranking: { id: string; name: string; mastery: number; examPct: number | null; passed: boolean | null; completion: number }[]
  atRisk: { id: string; name: string; mastery: number | null; reasons: string[] }[]
  attendance: { overallPct: number } | null
  feedback: {
    count: number
    ratings: { label: string; avg: number; dist: number[] }[]   // dist[0..4] = count of 1..5 stars
    comments: string[]
  } | null
  roster: {
    id: string; name: string; company: string | null; jobTitle: string | null
    mastery: number | null; examPct: number | null; passed: boolean | null
    completion: number; timeS: number; attendancePct: number | null; atRisk: boolean
  }[]
}

const round = (n: number) => Math.round(n)

// ── Builder ────────────────────────────────────────────────────────
export async function buildGroupReport(courseId: string): Promise<GroupReport | null> {
  const [courseRes, enrollRes, modulesRes] = await Promise.all([
    db.from("lms_courses").select("id, title, delivery_mode").eq("id", courseId).single(),
    db.from("lms_enrollments").select("student_id, status").eq("course_id", courseId).neq("status", "dropped"),
    db.from("lms_modules").select("id, title, module_type, order_index, questions").eq("course_id", courseId).order("order_index"),
  ])
  if (!courseRes.data) return null

  const course  = courseRes.data as any
  const enr     = (enrollRes.data ?? []) as any[]
  const modules = (modulesRes.data ?? []) as any[]
  const examMod = modules.find(m => m.module_type === "final_exam")
  const modOrder = new Map<string, number>(modules.map((m: any) => [m.id, m.order_index ?? 999]))

  // Per-student reports — the SAME accurate scoring the individual reports use.
  const reports = await Promise.all(enr.map(e => buildCourseReport(e.student_id, courseId)))
  const rows = enr
    .map((e, i) => ({ e, r: reports[i] }))
    .filter((x): x is { e: any; r: NonNullable<typeof x.r> } => x.r !== null)

  const enrolled  = enr.length
  const completed = enr.filter(e => e.status === "completed").length
  const masteries = rows.map(x => x.r.overall.score).filter((s): s is number => s !== null)
  const avgMastery = masteries.length ? round(masteries.reduce((a, b) => a + b, 0) / masteries.length) : null
  const avgTimeS   = rows.length ? round(rows.reduce((a, x) => a + x.r.overall.timeSpent, 0) / rows.length) : 0

  let examPassed = 0, examAttempted = 0
  for (const x of rows) if (x.r.exam) { examAttempted++; if (x.r.exam.passed) examPassed++ }
  const examPassRate = examMod ? round((examPassed / Math.max(1, enrolled)) * 100) : null

  // Mastery distribution
  const band = (p: number) => (p < 40 ? 0 : p < 60 ? 1 : p < 80 ? 2 : 3)
  const dc = [0, 0, 0, 0]
  for (const m of masteries) dc[band(m)]++
  const distribution = [
    { label: "0–40%", count: dc[0] }, { label: "40–60%", count: dc[1] },
    { label: "60–80%", count: dc[2] }, { label: "80–100%", count: dc[3] },
  ]
  const passFail = {
    passed:       rows.filter(x => x.r.exam?.passed).length,
    failed:       rows.filter(x => x.r.exam && !x.r.exam.passed).length,
    notAttempted: rows.filter(x => !x.r.exam).length,
  }

  // Per-module cohort mastery
  const modAgg = new Map<string, { title: string; sum: number; n: number; strong: number; weak: number }>()
  for (const x of rows) for (const rm of x.r.modules) {
    if (rm.masteryScore === null) continue
    const cur = modAgg.get(rm.id) ?? { title: rm.title, sum: 0, n: 0, strong: 0, weak: 0 }
    cur.sum += rm.masteryScore; cur.n++
    if (rm.masteryScore >= 80) cur.strong++
    if (rm.masteryScore < 60) cur.weak++
    modAgg.set(rm.id, cur)
  }
  const moduleStats = [...modAgg.entries()]
    .map(([moduleId, v]) => ({ moduleId, title: v.title, avgMastery: v.n ? round(v.sum / v.n) : null, strong: v.strong, weak: v.weak, assessed: v.n }))
    .sort((a, b) => (modOrder.get(a.moduleId) ?? 999) - (modOrder.get(b.moduleId) ?? 999))

  // Cohort topic heatmap — average each topic's mastery across students
  const topicAgg = new Map<string, { moduleId: string; module: string; topic: string; sum: number; n: number }>()
  for (const x of rows) for (const t of x.r.topicScores) {
    const key = `${t.moduleId}||${t.topic}`
    const cur = topicAgg.get(key) ?? { moduleId: t.moduleId, module: t.module, topic: t.topic, sum: 0, n: 0 }
    cur.sum += t.pct; cur.n++
    topicAgg.set(key, cur)
  }
  const topicHeatmap = [...topicAgg.values()]
    .map(t => ({ moduleId: t.moduleId, module: t.module, topic: t.topic, avgPct: round(t.sum / t.n), students: t.n, _ord: modOrder.get(t.moduleId) ?? 999 }))
    .sort((a, b) => a._ord - b._ord || b.avgPct - a.avgPct)
    .map(({ _ord, ...rest }) => rest)

  // Exam item analysis — per-question cohort performance (best attempt per student)
  let itemAnalysis: GroupReport["itemAnalysis"] = { hardest: [], difficulty: { mastered: 0, mixed: 0, struggled: 0, total: 0 } }
  if (examMod) {
    const questions: any[] = Array.isArray(examMod.questions) ? examMod.questions : []
    const { data: attempts } = await db
      .from("lms_module_attempts")
      .select("student_id, answers, ai_feedback, score")
      .eq("module_id", examMod.id)
      .in("student_id", rows.map(x => x.e.student_id))
    const bestByStu = new Map<string, any>()
    for (const a of (attempts ?? []) as any[]) {
      const cur = bestByStu.get(a.student_id)
      if (!cur || (a.score ?? 0) > (cur.score ?? 0)) bestByStu.set(a.student_id, a)
    }
    const takers = [...bestByStu.values()]
    const perQ = questions.map(q => {
      const pts = Number(q.points ?? 0)
      let earnedSum = 0, ptsSum = 0, full = 0, n = 0
      for (const a of takers) {
        const answers = (a.answers && typeof a.answers === "object" && !Array.isArray(a.answers)) ? a.answers : {}
        const ai = a.ai_feedback?.open_ended_scores ?? {}
        const earned = q.type === "open_ended" ? Number(ai[q.id]?.score ?? 0) : gradeQuestion(q, answers[q.id])
        n++; ptsSum += pts; earnedSum += earned
        if (pts > 0 && earned >= pts) full++
      }
      return { text: String(q.text ?? ""), correctPct: n ? round((full / n) * 100) : 0, avgPct: ptsSum ? round((earnedSum / ptsSum) * 100) : 0, n }
    })
    const difficulty = { mastered: 0, mixed: 0, struggled: 0, total: perQ.length }
    for (const q of perQ) { if (q.avgPct >= 80) difficulty.mastered++; else if (q.avgPct >= 40) difficulty.mixed++; else difficulty.struggled++ }
    itemAnalysis = { hardest: [...perQ].sort((a, b) => a.avgPct - b.avgPct).slice(0, 10), difficulty }
  }

  // Ranking + at-risk
  const ranking = rows
    .map(x => ({ id: x.r.student.id, name: x.r.student.name, mastery: x.r.overall.score ?? 0, examPct: x.r.exam?.pct ?? null, passed: x.r.exam ? x.r.exam.passed : null, completion: x.r.overall.completionPct }))
    .sort((a, b) => b.mastery - a.mastery)
  const atRisk = rows.map(x => {
    const reasons: string[] = []
    const m = x.r.overall.score
    if (m !== null && m < 40) reasons.push("Low mastery")
    if (x.r.exam && !x.r.exam.passed) reasons.push("Failed exam")
    if (x.r.overall.attendancePct !== null && x.r.overall.attendancePct < 50) reasons.push("Low attendance")
    if (x.r.overall.completionPct < 50) reasons.push("Low completion")
    return { id: x.r.student.id, name: x.r.student.name, mastery: m, reasons }
  }).filter(a => a.reasons.length > 0)
  const atRiskIds = new Set(atRisk.map(a => a.id))

  // Attendance (cohort)
  const attPcts = rows.map(x => x.r.overall.attendancePct).filter((p): p is number => p !== null)
  const attendance = attPcts.length ? { overallPct: round(attPcts.reduce((a, b) => a + b, 0) / attPcts.length) } : null

  // Feedback (aggregate all submissions — anonymized, for charts)
  const { data: fbRows } = await db
    .from("lms_feedback")
    .select("rating_overall, rating_content, rating_instructor, rating_pace, rating_materials, comments")
    .eq("course_id", courseId)
  const fb = (fbRows ?? []) as any[]
  let feedback: GroupReport["feedback"] = null
  if (fb.length) {
    const cats: [string, string][] = [
      ["Overall", "rating_overall"], ["Content", "rating_content"], ["Instructor", "rating_instructor"],
      ["Pace", "rating_pace"], ["Materials", "rating_materials"],
    ]
    const ratings = cats.map(([label, key]) => {
      const vals = fb.map(f => Number(f[key])).filter(v => v >= 1 && v <= 5)
      const dist = [0, 0, 0, 0, 0]
      for (const v of vals) dist[Math.round(v) - 1]++
      return { label, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0, dist }
    }).filter(r => r.dist.some(d => d > 0))
    const comments = fb.map(f => String(f.comments ?? "").trim()).filter(Boolean).slice(0, 12)
    feedback = { count: fb.length, ratings, comments }
  }

  const roster = rows.map(x => ({
    id: x.r.student.id, name: x.r.student.name,
    company: x.r.student.company ?? null, jobTitle: (x.r.student as any).job_title ?? null,
    mastery: x.r.overall.score, examPct: x.r.exam?.pct ?? null, passed: x.r.exam ? x.r.exam.passed : null,
    completion: x.r.overall.completionPct, timeS: x.r.overall.timeSpent, attendancePct: x.r.overall.attendancePct,
    atRisk: atRiskIds.has(x.r.student.id),
  })).sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1))

  return {
    course: { id: course.id, title: course.title, delivery_mode: course.delivery_mode ?? "online" },
    generatedAt: new Date().toISOString(),
    stats: {
      enrolled, completed, completionRate: enrolled ? round((completed / enrolled) * 100) : 0,
      avgMastery, examExists: !!examMod, examPassed, examAttempted, examPassRate, avgTimeS,
    },
    distribution, passFail, moduleStats, topicHeatmap, itemAnalysis, ranking, atRisk, attendance, feedback, roster,
  }
}
