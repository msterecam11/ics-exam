import { db } from "@/lib/db"
import { checkCourseCompletion, checkLearningPathCompletion, checkCohortCompletion } from "@/lib/lms-completion"

// Re-applies a course's CURRENT final-exam pass mark to every stored attempt.
//
// `passed` is written once, at submission, using the pass mark of that moment.
// Changing the course's Final Exam Pass Mark afterwards left every earlier
// attempt with its old verdict — a 75% stayed "failed" after the mark was
// lowered to 70, and the report, roster and certificate eligibility all read
// that stale flag. This recomputes the verdict from the stored score.
//
// Only the verdict changes. Scores are not re-marked here (that is what
// "Recalculate Attempts" in the exam editor does, against the answer key).
//
// Rules:
//  • An attempt submitted after the time limit can never pass, whatever the mark.
//  • A student who NOW passes is run through completion, exactly as if they had
//    passed at submission (enrollment completed, certificate issued per course
//    settings, path/cohort completion).
//  • A student who NOW fails is not un-completed and keeps any certificate
//    already issued — withdrawing a credential is a separate, deliberate admin
//    action. They are returned in `newlyFailedWithCertificate` so the admin
//    is told exactly who is affected.

export type PassMarkRegradeResult = {
  checked:        number   // attempts
  newlyPassed:    number   // students
  newlyFailed:    number   // students left with no passing attempt
  newlyFailedWithCertificate: number
}

export function examPct(score: unknown, maxScore: unknown): number {
  const s = Number(score), m = Number(maxScore)
  // Same rounding as recalculateAttemptScore (lms-exam-scoring.ts).
  return m > 0 && Number.isFinite(s) ? Math.round((s / m) * 100) : 0
}

export function attemptPasses(attempt: { score: unknown; max_score: unknown; ai_feedback?: unknown }, passMark: number): boolean {
  if ((attempt.ai_feedback as any)?.time_limit_exceeded === true) return false
  return examPct(attempt.score, attempt.max_score) >= passMark
}

export async function reapplyExamPassMark(courseId: string): Promise<PassMarkRegradeResult> {
  const result: PassMarkRegradeResult = { checked: 0, newlyPassed: 0, newlyFailed: 0, newlyFailedWithCertificate: 0 }

  const { data: course } = await db
    .from("lms_courses").select("final_exam_pass_mark").eq("id", courseId).single()

  const { data: examModules } = await db
    .from("lms_modules").select("id, activity_settings")
    .eq("course_id", courseId).eq("module_type", "final_exam")

  const newlyPassedStudents = new Set<string>()
  const newlyFailedStudents = new Set<string>()

  for (const mod of examModules ?? []) {
    // Same precedence as grading in /api/lms/exam-attempt.
    const passMark = Number((course as any)?.final_exam_pass_mark ?? (mod as any).activity_settings?.pass_mark ?? 70)

    const { data: attempts, error } = await db
      .from("lms_module_attempts")
      .select("id, student_id, score, max_score, passed, ai_feedback")
      .eq("module_id", (mod as any).id)
    if (error) throw new Error("Could not load exam attempts")

    for (const a of attempts ?? []) {
      result.checked++
      const passed = attemptPasses(a as any, passMark)
      if (passed === (a as any).passed) continue

      const { error: upErr } = await db.from("lms_module_attempts").update({ passed }).eq("id", (a as any).id)
      if (upErr) throw new Error("Could not update an exam attempt")

      if (passed) newlyPassedStudents.add((a as any).student_id)
      else        newlyFailedStudents.add((a as any).student_id)
    }
  }
  // Counted in students, not attempts (a student may have several attempts).
  result.newlyPassed = newlyPassedStudents.size

  // Completion for students who now pass (checkCourseCompletion itself confirms
  // a passing attempt exists and de-duplicates certificates).
  for (const studentId of newlyPassedStudents) {
    await checkCourseCompletion(studentId, courseId)
    await checkLearningPathCompletion(studentId, courseId)
    await checkCohortCompletion(studentId, courseId)
  }

  // A student with several attempts may have lost one passing attempt but still
  // hold another — only count students with no passing attempt left.
  if (newlyFailedStudents.size) {
    const moduleIds = (examModules ?? []).map((m: any) => m.id)
    const { data: stillPassing } = await db
      .from("lms_module_attempts").select("student_id")
      .in("module_id", moduleIds).in("student_id", [...newlyFailedStudents]).eq("passed", true)
    const keep = new Set((stillPassing ?? []).map((r: any) => r.student_id))
    const nowFailing = [...newlyFailedStudents].filter(id => !keep.has(id))
    result.newlyFailed = nowFailing.length

    if (nowFailing.length) {
      const { count } = await db
        .from("lms_certificates").select("*", { count: "exact", head: true })
        .eq("course_id", courseId).eq("type", "course")
        .in("student_id", nowFailing).is("revoked_at", null)
      result.newlyFailedWithCertificate = count ?? 0
    }
  }

  return result
}
