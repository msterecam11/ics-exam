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
export interface ModuleActivity { type: string; count: number; avgPct: number | null }
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
  activities: ModuleActivity[]  // coursework practice aggregated by activity type
  ai?: ModuleAI | null          // AI analysis of this module (from the expert assessment)
  examSection?: ExamSection | null  // this module's slice of the final exam, graded
  masteryScore: number | null   // exam-weighted mastery (the real measure), used for topics/overall
}
export interface TopicMastery { topic: string; pct: number; level: "strong" | "developing" | "weak" }
export interface CourseReport {
  student: { id: string; name: string; email: string; job_title: string | null; company: string | null; department: string | null }
  course: { id: string; title: string; delivery_mode: string | null }
  enrollment: { status: string; enrolled_at: string; completed_at: string | null; progress_pct: number }
  overall: { score: number | null; completionPct: number; timeSpent: number; attendancePct: number | null; presentCount: number; sessionTotal: number }
  modules: ReportModule[]
  exam: { title: string; score: number | null; maxScore: number | null; pct: number | null; passed: boolean; attempts: number; maxAttempts: number; passMark: number } | null
  // Every final-exam section (from the course-builder analysis) scored for THIS student.
  examSections: { title: string; pct: number; correct: number; partial: number; zero: number; earned: number; possible: number; questionCount: number; questions: ExamSectionQuestion[] }[]
  // Per-TOPIC mastery (question→topic tags from Expert Analyze), grouped by module — the heatmap.
  topicScores: { moduleId: string; module: string; topic: string; pct: number; earned: number; possible: number; questionCount: number; correct: number; zero: number }[]
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
  // Final-exam attempt trajectory (attempt 1 → final) — improvement over attempts.
  examTrajectory: { attemptNo: number; pct: number; passed: boolean }[]
  // Cohort benchmark within the same course (null when alone / no comparators).
  cohort: { rank: number; total: number; classAvg: number; selfScore: number } | null
  // This student's own course feedback — only when the course collects it by name.
  feedback: { ratings: { label: string; value: number | null }[]; comment: string | null } | null
}

const num = (v: any): number | null => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v))

// Points earned for one question — mirrors FinalExamPlayer.score() for every
// auto-gradable type (incl. partial credit). open_ended is graded by the AI and
// its score is applied by the caller (aiScores), NOT here.
function gradeQuestion(q: any, ans: any): number {
  const pts = Number(q?.points ?? 0)
  if (!q || ans === undefined || ans === null) return 0
  if (q.type === "mcq_single") {
    const correctId = (q.options ?? []).find((o: any) => o.correct)?.id
    const given = Array.isArray(ans) ? ans[0] : ans
    return correctId && given === correctId ? pts : 0
  }
  if (q.type === "mcq_multiple") {
    const correctIds = (q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.id)
    const chosen: string[] = Array.isArray(ans) ? ans : (ans != null ? [ans] : [])
    return correctIds.length > 0 && chosen.length === correctIds.length && correctIds.every((id: string) => chosen.includes(id)) ? pts : 0
  }
  if (q.type === "ordering") {
    const correct = (q.items ?? []).map((i: any) => i.id)
    const given: string[] = Array.isArray(ans) ? ans : []
    const ok = correct.filter((id: string, i: number) => id === given[i]).length
    return given.length > 0 && correct.length > 0 ? Math.round((ok / correct.length) * pts) : 0
  }
  if (q.type === "match_pair") {
    const given = (ans && typeof ans === "object" && !Array.isArray(ans)) ? ans : {}
    const pairs = q.pairs ?? []
    const ok = pairs.filter((p: any) => given[p.id] === p.right).length
    return pairs.length > 0 ? Math.round((ok / pairs.length) * pts) : 0
  }
  return 0  // open_ended — scored by the caller from AI feedback
}

// ── Builder ────────────────────────────────────────────────────────
export async function buildCourseReport(studentId: string, courseId: string): Promise<CourseReport | null> {
  const [studentRes, courseRes, enrollRes] = await Promise.all([
    db.from("lms_students").select("id, name, email, job_title, company, department").eq("id", studentId).single(),
    db.from("lms_courses").select("id, title, delivery_mode, feedback_anonymous, final_exam_pass_mark").eq("id", courseId).single(),
    db.from("lms_enrollments").select("status, enrolled_at, completed_at, progress_pct").eq("student_id", studentId).eq("course_id", courseId).maybeSingle(),
  ])
  if (!studentRes.data || !courseRes.data || !enrollRes.data) return null

  // Modules + analysis, packages + items, progress, exam attempts, assignments, attendance
  const [modulesRes, analysisRes, packagesRes, progressRes, attemptsRes, assignRes, sessionsRes, assessmentRes] = await Promise.all([
    db.from("lms_modules").select("id, title, module_type, order_index, activity_settings, questions").eq("course_id", courseId).order("order_index"),
    db.from("lms_module_analysis").select("module_id, analysis").eq("course_id", courseId),
    db.from("lms_packages").select("id, module_id, pass_mark, lms_package_items(id, title, type, config)").eq("course_id", courseId),
    db.from("lms_package_progress").select("package_id, module_id, status, score, item_scores, completed_items, time_spent, started_at, completed_at").eq("student_id", studentId).eq("course_id", courseId),
    db.from("lms_module_attempts").select("module_id, attempt_no, score, max_score, passed, status, answers, ai_feedback, time_spent_s").eq("student_id", studentId).eq("course_id", courseId),
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

    // Aggregate coursework practice by activity type (for the Learning Journey).
    const actAgg = new Map<string, { count: number; sum: number; n: number }>()
    for (const it of items) {
      const key = it.activity_type ?? it.type ?? "activity"
      const cur = actAgg.get(key) ?? { count: 0, sum: 0, n: 0 }
      cur.count++
      if (typeof it.pct === "number") { cur.sum += it.pct; cur.n++ }
      actAgg.set(key, cur)
    }
    const activities = [...actAgg.entries()].map(([type, v]) => ({
      type, count: v.count, avgPct: v.n ? Math.round(v.sum / v.n) : null,
    }))

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
      activities,
      masteryScore: null,
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
        passMark: Number((courseRes.data as any).final_exam_pass_mark ?? (examMod as any).activity_settings?.pass_mark ?? 70),
      }
    }
  }

  // ── Final-exam performance by section (graded from the learner's answers) ──
  let examSections: CourseReport["examSections"] = []
  let topicScores: CourseReport["topicScores"] = []
  if (examMod) {
    const examQuestions: any[] = Array.isArray((examMod as any).questions) ? (examMod as any).questions : []
    const qById = new Map(examQuestions.map((q: any) => [q.id, q]))
    const sections: any[] = Array.isArray(analysisBy.get(examMod.id)?.sections) ? analysisBy.get(examMod.id)!.sections : []
    const questionTopics: Record<string, string> = (analysisBy.get(examMod.id) as any)?.question_topics ?? {}
    const moduleTitleById = new Map<string, string>(modules.map((m: any) => [m.id, m.title]))
    const examAttempts = attempts.filter((a: any) => a.module_id === examMod.id)
    const best = examAttempts.slice().sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0]
    const answers: any = best?.answers && typeof best.answers === "object" && !Array.isArray(best.answers) ? best.answers : {}
    // AI-graded open-ended scores from the attempt (so scenario questions aren't scored 0).
    const aiScores: any = best?.ai_feedback?.open_ended_scores ?? {}
    const scoreQ = (q: any, qid: string) =>
      q.type === "open_ended" ? Number(aiScores[qid]?.score ?? 0) : gradeQuestion(q, answers[qid])
    const sectionByMod = new Map<string, ExamSection>()
    const modOrder = new Map<string, number>(modules.map((m: any) => [m.id, m.order_index ?? 999]))
    for (const s of sections) {
      const qs = ((s.question_ids ?? []) as string[]).map((qid: string) => {
        const q = qById.get(qid); if (!q) return null
        const pts = Number(q.points ?? 0)
        return { text: q.text ?? "", points: pts, scoreAchieved: scoreQ(q, qid) }
      }).filter(Boolean) as ExamSectionQuestion[]
      if (!qs.length) continue
      const earned = qs.reduce((a, b) => a + b.scoreAchieved, 0)
      const possible = qs.reduce((a, b) => a + b.points, 0)
      const correct = qs.filter(q => q.points > 0 && q.scoreAchieved >= q.points).length
      const zero = qs.filter(q => q.scoreAchieved === 0).length
      const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0
      const partial = qs.length - correct - zero
      // Map to its module (for the per-module page) when the section has one.
      if (s.module_id) sectionByMod.set(s.module_id, { pct, correct, partial, zero, earned, possible, questions: qs })
      // Always record it in the flat exam-sections list (for the Final Exam page).
      ;(examSections as any[]).push({ title: s.title ?? "Section", pct, correct, partial, zero, earned, possible, questionCount: qs.length, questions: qs, _ord: s.module_id ? (modOrder.get(s.module_id) ?? 998) : 999 })
    }
    // Present sections in course-module order (module 1 → 2 → 3 …), unmapped last.
    examSections.sort((a, b) => ((a as any)._ord ?? 999) - ((b as any)._ord ?? 999))
    examSections.forEach(s => { delete (s as any)._ord })
    for (const rm of reportModules) rm.examSection = sectionByMod.get(rm.id) ?? null

    // ── Per-topic mastery (the heatmap) — aggregate each question's score into its
    //    tagged topic, grouped by module. Empty when Expert Analyze hasn't tagged topics.
    const topicAgg = new Map<string, { moduleId: string; module: string; topic: string; earned: number; possible: number; count: number; correct: number; zero: number; ord: number }>()
    for (const s of sections) {
      for (const qid of (s.question_ids ?? []) as string[]) {
        const q = qById.get(qid); if (!q) continue
        const topic = questionTopics[qid]; if (!topic) continue
        const pts = Number(q.points ?? 0)
        const earned = scoreQ(q, qid)
        const key = `${s.module_id}||${topic}`
        const cur = topicAgg.get(key) ?? {
          moduleId: s.module_id, module: moduleTitleById.get(s.module_id) ?? s.title ?? "General",
          topic, earned: 0, possible: 0, count: 0, correct: 0, zero: 0,
          ord: s.module_id ? (modOrder.get(s.module_id) ?? 998) : 999,
        }
        cur.earned += earned; cur.possible += pts; cur.count++
        if (pts > 0 && earned >= pts) cur.correct++
        if (earned === 0) cur.zero++
        topicAgg.set(key, cur)
      }
    }
    topicScores = [...topicAgg.values()]
      .map(t => ({
        moduleId: t.moduleId, module: t.module, topic: t.topic,
        pct: t.possible > 0 ? Math.round((t.earned / t.possible) * 100) : 0,
        earned: t.earned, possible: t.possible, questionCount: t.count, correct: t.correct, zero: t.zero,
        _ord: t.ord,
      }))
      // Module order (module 1 → 2 → 3 …), then strongest → weakest within a module.
      .sort((a, b) => a._ord - b._ord || b.pct - a.pct)
    topicScores.forEach(t => { delete (t as any)._ord })
  }

  // Effective mastery per module. Mastery is measured by ASSESSMENTS, never by completion:
  //   - coursework counts only when it was actually graded (has item scores); a bare
  //     "completed" package score (e.g. 100% with no graded items) is NOT mastery.
  //   - when a final-exam section exists it is the real test and dominates.
  //   - if nothing was assessed (no exam, no graded coursework), mastery is null →
  //     the module shows completion, not a misleading score.
  for (const rm of reportModules) {
    const ex = rm.examSection?.pct ?? null
    const cw = rm.items.length > 0 ? rm.score : null   // graded coursework only
    rm.masteryScore =
      ex !== null && cw !== null ? Math.round(cw * 0.4 + ex * 0.6) // graded coursework + exam
      : ex !== null              ? ex                              // exam only
      : cw                                                         // graded coursework only, else null
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

  // ── Topic mastery (exam-weighted module mastery → its topics, averaged) ──
  const topicAgg = new Map<string, { sum: number; n: number }>()
  for (const rm of reportModules) {
    if (rm.masteryScore === null) continue
    for (const t of rm.topics) {
      const cur = topicAgg.get(t) ?? { sum: 0, n: 0 }
      cur.sum += rm.masteryScore; cur.n += 1; topicAgg.set(t, cur)
    }
  }
  const topicMastery: TopicMastery[] = [...topicAgg.entries()]
    .map(([topic, { sum, n }]) => {
      const pct = Math.round(sum / n)
      return { topic, pct, level: (pct >= 80 ? "strong" : pct >= 60 ? "developing" : "weak") as TopicMastery["level"] }
    })
    .sort((a, b) => a.pct - b.pct)

  // ── Overall (exam-weighted mastery across modules) ──
  const masteryScores = reportModules.map(m => m.masteryScore).filter((s): s is number => s !== null)
  const overallScore = masteryScores.length ? Math.round(masteryScores.reduce((a, b) => a + b, 0) / masteryScores.length) : null
  const examTime = examMod ? attempts.filter((a: any) => a.module_id === examMod.id).reduce((s: number, a: any) => s + (a.time_spent_s ?? 0), 0) : 0
  const timeSpent = reportModules.reduce((s, m) => s + m.timeSpent, 0) + examTime

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

  // ── Final-exam improvement trajectory (attempt 1 → final) ──
  const examTrajectory = examMod
    ? attempts.filter((a: any) => a.module_id === examMod.id)
        .slice()
        .sort((a: any, b: any) => (a.attempt_no ?? 0) - (b.attempt_no ?? 0))
        .map((a: any) => ({
          attemptNo: a.attempt_no ?? 0,
          pct: a.max_score ? Math.round((a.score / a.max_score) * 100) : Math.round(num(a.score) ?? 0),
          passed: !!a.passed,
        }))
    : []

  // ── Cohort benchmark (rank within the course) ──
  // Comparable proxy = exam-weighted where an exam exists, else completion %.
  let cohort: CourseReport["cohort"] = null
  {
    const { data: cohortEnrolls } = await db
      .from("lms_enrollments")
      .select("student_id, progress_pct")
      .eq("course_id", courseId)
      .neq("status", "dropped")
    const rows = cohortEnrolls ?? []
    if (rows.length >= 2) {
      let examBest: Record<string, number> = {}
      if (examMod) {
        const { data: allAttempts } = await db
          .from("lms_module_attempts")
          .select("student_id, score, max_score")
          .eq("module_id", examMod.id)
        for (const a of allAttempts ?? []) {
          const pct = a.max_score ? Math.round((a.score / a.max_score) * 100) : 0
          if (pct > (examBest[a.student_id] ?? -1)) examBest[a.student_id] = pct
        }
      }
      const scoreOf = (sid: string, prog: number) =>
        examMod ? Math.round((examBest[sid] ?? 0) * 0.6 + prog * 0.4) : Math.round(prog)
      const ranked = rows
        .map((r: any) => ({ sid: r.student_id, val: scoreOf(r.student_id, num(r.progress_pct) ?? 0) }))
        .sort((a, b) => b.val - a.val)
      const rank = ranked.findIndex(r => r.sid === studentId) + 1
      const classAvg = Math.round(ranked.reduce((s, r) => s + r.val, 0) / ranked.length)
      const self = ranked.find(r => r.sid === studentId)?.val ?? 0
      if (rank > 0) cohort = { rank, total: ranked.length, classAvg, selfScore: self }
    }
  }

  // ── This student's own feedback — only when the course collects it by name ──
  let feedback: CourseReport["feedback"] = null
  if ((courseRes.data as any).feedback_anonymous === false) {
    const { data: fb } = await db
      .from("lms_feedback")
      .select("rating_overall, rating_content, rating_instructor, rating_pace, rating_materials, comments, is_anonymous")
      .eq("student_id", studentId).eq("course_id", courseId).maybeSingle()
    // Respect a per-submission anonymous flag too — never attribute anonymous feedback.
    if (fb && (fb as any).is_anonymous !== true) {
      feedback = {
        ratings: [
          { label: "Overall", value: num((fb as any).rating_overall) },
          { label: "Content", value: num((fb as any).rating_content) },
          { label: "Instructor", value: num((fb as any).rating_instructor) },
          { label: "Pace", value: num((fb as any).rating_pace) },
          { label: "Materials", value: num((fb as any).rating_materials) },
        ].filter(r => r.value !== null),
        comment: (fb as any).comments?.trim() || null,
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
    examSections,
    topicScores,
    assignments,
    topicMastery,
    assessment,
    security,
    examTrajectory,
    cohort,
    feedback,
  }
}
