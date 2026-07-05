import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import ExamAttemptsView from "./ExamAttemptsView"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// Map LMS question types to the exam-system AnswerCard's expected types.
function mapType(t: string) { return t === "mcq_multiple" ? "mcq_multi" : t }

// Adapt one LMS attempt (module.questions + attempt.answers + ai scores) into
// the answer[] shape the shared AnswerCard component renders.
function buildAnswers(questions: any[], answers: any, aiScores: any) {
  return questions.map((q: any) => {
    const type = mapType(q.type)
    const raw  = answers?.[q.id]
    const opts = (q.options ?? []).map((o: any) => ({ id: o.id, text: o.text, is_correct: !!o.correct }))
    const pts  = Number(q.points ?? 1)

    let score = 0
    if (q.type === "mcq_single") {
      score = opts.find((o: any) => o.is_correct)?.id === raw ? pts : 0
    } else if (q.type === "mcq_multiple") {
      const correctIds = new Set(opts.filter((o: any) => o.is_correct).map((o: any) => o.id))
      const chosen = new Set(Array.isArray(raw) ? raw : [])
      const exact = chosen.size === correctIds.size && [...correctIds].every(id => chosen.has(id))
      score = exact ? pts : 0
    } else if (q.type === "open_ended") {
      score = Number(aiScores?.[q.id]?.score ?? 0)
    }

    return {
      id: q.id,
      score_achieved: score,
      answer_text: type === "open_ended" ? (typeof raw === "string" ? raw : "") : undefined,
      answer_json: {
        choice_id:  q.type === "mcq_single"   ? raw : undefined,
        choice_ids: q.type === "mcq_multiple" ? (Array.isArray(raw) ? raw : []) : undefined,
      },
      ai_justification: q.type === "open_ended" ? (aiScores?.[q.id]?.justification ?? null) : null,
      questions: { id: q.id, type, text: q.text, score: pts, choices: opts },
    }
  })
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
        answers: buildAnswers(questions, a.answers ?? {}, aiScores),
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
