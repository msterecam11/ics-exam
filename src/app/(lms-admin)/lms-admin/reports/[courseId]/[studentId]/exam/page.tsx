import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import ExamAttemptsView from "./ExamAttemptsView"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// Points earned for one question — mirrors FinalExamPlayer.score() exactly,
// covering every LMS exam type (incl. partial credit for ordering & match_pair).
function earnedFor(q: any, ans: any, aiScores: any): number {
  const pts = Number(q.points ?? 1)
  if (q.type === "mcq_single") {
    const correctId = (q.options ?? []).find((o: any) => o.correct)?.id
    const given = Array.isArray(ans) ? ans[0] : ans
    return correctId && given === correctId ? pts : 0
  }
  if (q.type === "mcq_multiple") {
    const corr = (q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.id)
    const sel: string[] = Array.isArray(ans) ? ans : []
    return corr.length > 0 && sel.length === corr.length && corr.every((id: string) => sel.includes(id)) ? pts : 0
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
  if (q.type === "open_ended") return Number(aiScores?.[q.id]?.score ?? 0)
  return 0
}

// Build the per-question review items for one attempt (LMS-native shape).
function buildItems(questions: any[], answers: any, aiScores: any) {
  return questions.map((q: any) => ({
    id: q.id,
    question: {
      id: q.id, type: q.type, text: q.text, points: Number(q.points ?? 1),
      options: q.options ?? undefined, items: q.items ?? undefined, pairs: q.pairs ?? undefined,
    },
    answer: answers?.[q.id] ?? null,
    earned: earnedFor(q, answers?.[q.id], aiScores),
    aiJustification: q.type === "open_ended" ? (aiScores?.[q.id]?.justification ?? null) : null,
  }))
}

interface Props { params: Promise<{ courseId: string; studentId: string }> }

export default async function StudentExamResultsPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId, studentId } = await params

  const [studentRes, courseRes, examRes] = await Promise.all([
    db.from("lms_students").select("id, name, email, company, job_title").eq("id", studentId).single(),
    db.from("lms_courses").select("id, title, final_exam_pass_mark").eq("id", courseId).single(),
    db.from("lms_modules").select("id, title, questions, activity_settings")
      .eq("course_id", courseId).eq("module_type", "final_exam")
      .order("order_index", { ascending: true }).limit(1),
  ])

  if (!studentRes.data || !courseRes.data) notFound()
  const student = studentRes.data as any
  const course  = courseRes.data as any
  const examMod = ((examRes.data ?? []) as any[])[0] ?? null

  const passMark = Number(course.final_exam_pass_mark ?? examMod?.activity_settings?.pass_mark ?? 70)
  const questions: any[] = Array.isArray(examMod?.questions) ? examMod.questions : []

  let attempts: any[] = []
  if (examMod) {
    const { data } = await db
      .from("lms_module_attempts")
      .select("id, attempt_no, score, max_score, passed, answers, ai_feedback, time_spent_s, submitted_at, graded_at")
      .eq("module_id", examMod.id)
      .eq("student_id", studentId)
      .order("attempt_no", { ascending: true })

    attempts = (data ?? []).map((a: any) => {
      const aiScores = a.ai_feedback?.open_ended_scores ?? {}
      const sec = a.ai_feedback?.security_events ?? null
      return {
        id: a.id,
        attemptNo: a.attempt_no,
        pct: a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : null,
        passed: !!a.passed,
        submittedAt: a.submitted_at ?? a.graded_at ?? null,
        timeS: a.time_spent_s ?? 0,
        answers: buildItems(questions, a.answers ?? {}, aiScores),
        security: sec ? {
          tabs: Number(sec.tabs ?? 0), fs: Number(sec.fs ?? 0),
          rightClicks: Number(sec.rightClicks ?? 0), copyAttempts: Number(sec.copyAttempts ?? 0),
        } : null,
      }
    })
  }

  return (
    <ExamAttemptsView
      courseId={courseId}
      student={student}
      courseTitle={course.title}
      examTitle={examMod?.title ?? "Final Exam"}
      passMark={passMark}
      hasExam={!!examMod}
      attempts={attempts}
    />
  )
}
