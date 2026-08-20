import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { recalculateAttemptScore, type ExamQuestion } from "@/lib/lms-exam-scoring"
import { checkCourseCompletion, checkLearningPathCompletion, checkCohortCompletion } from "@/lib/lms-completion"

// Admin: re-grades every existing attempt on a Final Exam module against
// its CURRENT questions (e.g. after fixing a wrongly-keyed MCQ answer).
// Unlike the standalone exam system's recalculateExamScores(), this has
// no prior equivalent for LMS Final Exams — attempts were previously
// frozen forever at whatever the answer key said at submission time.
//
// open_ended questions are left alone: their stored AI score is reused
// as-is (see lms-exam-scoring.ts) rather than re-run.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || (session.user.role !== "admin" && session.user.role !== "instructor"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: moduleId } = await params

  const { data: module } = await db
    .from("lms_modules")
    .select("id, course_id, module_type, questions, activity_settings")
    .eq("id", moduleId)
    .single()

  if (!module) return NextResponse.json({ error: "Module not found" }, { status: 404 })
  if (module.module_type !== "final_exam")
    return NextResponse.json({ error: "Not a Final Exam module" }, { status: 400 })

  const questions = (module.questions as ExamQuestion[] | null) ?? []
  if (questions.length === 0)
    return NextResponse.json({ error: "This module has no questions" }, { status: 400 })

  const { data: course } = await db
    .from("lms_courses")
    .select("final_exam_pass_mark")
    .eq("id", module.course_id)
    .single()

  const settings = module.activity_settings as any
  const passMark = (course as any)?.final_exam_pass_mark ?? settings?.pass_mark ?? 70

  const { data: attempts, error: fetchError } = await db
    .from("lms_module_attempts")
    .select("id, student_id, score, max_score, passed, answers, ai_feedback")
    .eq("module_id", moduleId)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!attempts || attempts.length === 0)
    return NextResponse.json({ recalculated: 0, changed: 0, flips: [] })

  const changedStudentIds = new Set<string>()
  const flips: { student_id: string; before: { score: number; passed: boolean }; after: { score: number; passed: boolean } }[] = []

  for (const attempt of attempts) {
    const openEndedScores = (attempt.ai_feedback as any)?.open_ended_scores as Record<string, { score: number }> | undefined
    const openEndedEarned = openEndedScores
      ? Object.values(openEndedScores).reduce((sum, s) => sum + (s?.score ?? 0), 0)
      : 0

    const { score, maxScore, pct } = recalculateAttemptScore(
      questions,
      (attempt.answers as any) ?? {},
      openEndedEarned
    )
    const passed = pct >= passMark

    const before = { score: Number(attempt.score), passed: attempt.passed }
    const after = { score, passed }

    if (before.score !== after.score || before.passed !== after.passed) {
      changedStudentIds.add(attempt.student_id)
      flips.push({ student_id: attempt.student_id, before, after })

      const { error: updateError } = await db
        .from("lms_module_attempts")
        .update({ score, max_score: maxScore, passed })
        .eq("id", attempt.id)

      if (updateError) {
        return NextResponse.json({ error: `Failed updating attempt ${attempt.id}: ${updateError.message}` }, { status: 500 })
      }
    }
  }

  // A student who newly passes may now satisfy course/path/cohort
  // completion that wasn't met at submission time — a student who newly
  // fails is deliberately NOT un-completed here; walking back completion
  // (and anything downstream of it, e.g. a certificate already issued)
  // is a bigger, separate decision than "fix the score."
  const newlyPassed = flips.filter((f) => !f.before.passed && f.after.passed)
  for (const f of newlyPassed) {
    await Promise.all([
      checkCourseCompletion(f.student_id, module.course_id),
      checkLearningPathCompletion(f.student_id, module.course_id),
      checkCohortCompletion(f.student_id, module.course_id),
    ])
  }

  return NextResponse.json({
    recalculated: attempts.length,
    changed: changedStudentIds.size,
    flips,
  })
}
