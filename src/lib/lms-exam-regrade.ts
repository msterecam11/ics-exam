import { db } from "@/lib/db"
import { checkCourseCompletion } from "@/lib/lms-completion"

// Re-applies a CURRENT final-exam pass mark to stored attempts.
//
// `passed` is written once, at submission, using the pass mark of that moment.
// Changing the pass mark afterwards left every earlier attempt with its old
// verdict — a 75% stayed "failed" after the mark was lowered to 70, and the
// report, roster and certificate eligibility all read that stale flag. This
// recomputes the verdict from the stored score.
//
// Scope — pass marks are per program (PM-4):
//  • { programId }         → that program's enrollments, using the program's rule
//  • no programId (course) → enrollments OUTSIDE any program, using the course
//    pass mark. Programs keep their own copied rule, so changing the course
//    default never changes a program's results.
//
// Only the verdict changes. Scores are not re-marked here (that is what
// "Recalculate Attempts" in the exam editor does, against the answer key).
//
// Rules:
//  • An attempt submitted after the time limit can never pass, whatever the mark.
//  • An enrollment that NOW passes is run through completion, exactly as if it
//    had passed at submission (enrollment completed, certificate issued per
//    settings, path/cohort completion).
//  • An enrollment that NOW fails is not un-completed and keeps any certificate
//    already issued — withdrawing a credential is a separate, deliberate admin
//    action. They are counted in `newlyFailedWithCertificate` so the admin is
//    told exactly who is affected.

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

export async function reapplyExamPassMark(courseId: string, opts?: { programId?: string | null }): Promise<PassMarkRegradeResult> {
  const result: PassMarkRegradeResult = { checked: 0, newlyPassed: 0, newlyFailed: 0, newlyFailedWithCertificate: 0 }
  const programId = opts?.programId ?? null

  const [{ data: course }, { data: rule }, { data: examModules }] = await Promise.all([
    db.from("lms_courses").select("final_exam_pass_mark").eq("id", courseId).single(),
    programId
      ? db.from("lms_program_course_rules").select("pass_mark").eq("program_id", programId).eq("course_id", courseId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("lms_modules").select("id, activity_settings").eq("course_id", courseId).eq("module_type", "final_exam"),
  ])
  if (programId && !rule) return result   // the program doesn't deliver this course

  // The enrollments in scope.
  let enrollQuery = db.from("lms_enrollments").select("id, student_id").eq("course_id", courseId)
  enrollQuery = programId ? enrollQuery.eq("program_id", programId) : enrollQuery.is("program_id", null)
  const { data: enrollments, error: eErr } = await enrollQuery
  if (eErr) throw new Error("Could not load enrollments")
  const studentByEnrollment = new Map(((enrollments ?? []) as any[]).map(e => [e.id as string, e.student_id as string]))
  const enrollmentIds = [...studentByEnrollment.keys()]
  if (!enrollmentIds.length) return result

  const newlyPassed = new Set<string>()   // enrollment ids
  const newlyFailed = new Set<string>()

  for (const mod of examModules ?? []) {
    // Same precedence as grading in /api/lms/exam-attempt.
    const passMark = programId
      ? Number((rule as any).pass_mark)
      : Number((course as any)?.final_exam_pass_mark ?? (mod as any).activity_settings?.pass_mark ?? 70)

    const { data: attempts, error } = await db
      .from("lms_module_attempts")
      .select("id, enrollment_id, score, max_score, passed, ai_feedback")
      .eq("module_id", (mod as any).id)
      .in("enrollment_id", enrollmentIds)
    if (error) throw new Error("Could not load exam attempts")

    for (const a of attempts ?? []) {
      result.checked++
      const passed = attemptPasses(a as any, passMark)
      if (passed === (a as any).passed) continue

      const { error: upErr } = await db.from("lms_module_attempts").update({ passed }).eq("id", (a as any).id)
      if (upErr) throw new Error("Could not update an exam attempt")

      if (passed) newlyPassed.add((a as any).enrollment_id)
      else        newlyFailed.add((a as any).enrollment_id)
    }
  }
  result.newlyPassed = newlyPassed.size

  // Completion for enrollments that now pass (checkCourseCompletion itself
  // confirms a passing attempt exists and de-duplicates certificates).
  for (const enrollmentId of newlyPassed) {
    const studentId = studentByEnrollment.get(enrollmentId)!
    await checkCourseCompletion(studentId, courseId, enrollmentId)
  }

  // An enrollment with several attempts may have lost one passing attempt but
  // still hold another — only count those with no passing attempt left.
  if (newlyFailed.size) {
    const moduleIds = (examModules ?? []).map((m: any) => m.id)
    const { data: stillPassing } = await db
      .from("lms_module_attempts").select("enrollment_id")
      .in("module_id", moduleIds).in("enrollment_id", [...newlyFailed]).eq("passed", true)
    const keep = new Set((stillPassing ?? []).map((r: any) => r.enrollment_id))
    const nowFailing = [...newlyFailed].filter(id => !keep.has(id))
    result.newlyFailed = nowFailing.length

    if (nowFailing.length) {
      const { count } = await db
        .from("lms_certificates").select("*", { count: "exact", head: true })
        .eq("type", "course").in("enrollment_id", nowFailing).is("revoked_at", null)
      result.newlyFailedWithCertificate = count ?? 0
    }
  }

  return result
}
