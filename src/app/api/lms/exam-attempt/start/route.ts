import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { examTimeLimitS, elapsedSince, isSessionExpired } from "@/lib/lms-exam-session"
import { COURSE_ACCESS_STATUSES, hasCourseAccess } from "@/lib/lms-enrollment"
import { sanitizeQuestionsForClient, paperFor, type ExamQuestion } from "@/lib/lms-exam-scoring"

// POST /api/lms/exam-attempt/start
// Body: { module_id, course_id }
//
// Called when the student presses "Begin Exam". Opens (or resumes) the
// server-side exam session and returns how much time is actually left, so the
// countdown the student sees is the server's clock, not a fresh one:
//   - reloading the page mid-exam resumes the same session and remaining time
//     instead of restarting the full limit
//   - a session abandoned past its limit is closed and a new one opened
// Opening a session does not consume an attempt; submitting does.
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { module_id, course_id } = await req.json().catch(() => ({}))
  if (!module_id || !course_id)
    return NextResponse.json({ error: "module_id and course_id required" }, { status: 400 })

  const { data: module } = await db
    .from("lms_modules")
    .select("id, module_type, activity_settings, questions")
    .eq("id", module_id)
    .eq("course_id", course_id)
    .single()

  if (!module || (module as any).module_type !== "final_exam")
    return NextResponse.json({ error: "Module not found" }, { status: 404 })

  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", course_id)
    .in("status", [...COURSE_ACCESS_STATUSES])   // an unenrolled (dropped) student has no access
    .maybeSingle()
  if (!enrollment)
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 })

  const settings    = module.activity_settings as any
  const maxAttempts = settings?.max_attempts ?? 3
  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", module_id)
    .eq("student_id", student.id)
  if ((count ?? 0) >= maxAttempts)
    return NextResponse.json({ error: `Maximum ${maxAttempts} attempt(s) reached` }, { status: 409 })

  const limitS = examTimeLimitS(settings)
  const now    = new Date()

  // The paper is frozen here: the session stores the exact questions (with the
  // key) as they are right now. The browser gets them sanitised, and the
  // submission is graded against the session's copy — so editing the exam while
  // a student is mid-exam, or afterwards, never changes what they are marked on.
  const currentQuestions = Array.isArray((module as any).questions) ? (module as any).questions as ExamQuestion[] : []
  if (currentQuestions.length === 0)
    return NextResponse.json({ error: "This exam has no questions yet" }, { status: 409 })

  const respond = (startedAt: string, paper: ExamQuestion[]) => {
    const elapsed = elapsedSince(startedAt, now)
    return NextResponse.json({
      started_at:   startedAt,
      time_limit_s: limitS,
      remaining_s:  limitS === null ? null : Math.max(0, limitS - elapsed),
      questions:    sanitizeQuestionsForClient(paper),
    })
  }

  const { data: open } = await db
    .from("lms_exam_sessions")
    .select("id, started_at, paper")
    .eq("student_id", student.id)
    .eq("module_id", module_id)
    .is("submitted_at", null)
    .maybeSingle()

  if (open) {
    if (!isSessionExpired(open.started_at, limitS, now)) {
      if (Array.isArray((open as any).paper)) return respond(open.started_at, (open as any).paper)
      // Session opened before frozen papers existed: freeze it now.
      await db.from("lms_exam_sessions").update({ paper: currentQuestions }).eq("id", open.id).is("paper", null)
      return respond(open.started_at, currentQuestions)
    }
    // Abandoned past its limit: close it (no attempt_id = never submitted) so a
    // fresh session can open. It is kept, not deleted, as a record of the start.
    await db.from("lms_exam_sessions").update({ submitted_at: now.toISOString() })
      .eq("id", open.id).is("submitted_at", null)
  }

  const { data: created, error } = await db
    .from("lms_exam_sessions")
    .insert({ student_id: student.id, module_id, course_id, started_at: now.toISOString(), paper: currentQuestions })
    .select("started_at, paper")
    .single()

  if (error) {
    // Two "Begin" clicks racing: the partial unique index let only one open
    // session through. Resume whichever won.
    const { data: winner } = await db
      .from("lms_exam_sessions")
      .select("started_at, paper")
      .eq("student_id", student.id)
      .eq("module_id", module_id)
      .is("submitted_at", null)
      .maybeSingle()
    if (winner) return respond(winner.started_at, paperFor(winner as any, currentQuestions))
    console.error("[exam-session] could not open session", { studentId: student.id, module_id, error })
    return NextResponse.json({ error: "Could not start the exam. Please try again." }, { status: 500 })
  }

  return respond(created.started_at, paperFor(created as any, currentQuestions))
}
