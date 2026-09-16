import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { examTimeLimitS, elapsedSince, isSessionExpired } from "@/lib/lms-exam-session"

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
    .select("id, module_type, activity_settings")
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

  const respond = (startedAt: string) => {
    const elapsed = elapsedSince(startedAt, now)
    return NextResponse.json({
      started_at:   startedAt,
      time_limit_s: limitS,
      remaining_s:  limitS === null ? null : Math.max(0, limitS - elapsed),
    })
  }

  const { data: open } = await db
    .from("lms_exam_sessions")
    .select("id, started_at")
    .eq("student_id", student.id)
    .eq("module_id", module_id)
    .is("submitted_at", null)
    .maybeSingle()

  if (open) {
    if (!isSessionExpired(open.started_at, limitS, now)) return respond(open.started_at)
    // Abandoned past its limit: close it (no attempt_id = never submitted) so a
    // fresh session can open. It is kept, not deleted, as a record of the start.
    await db.from("lms_exam_sessions").update({ submitted_at: now.toISOString() })
      .eq("id", open.id).is("submitted_at", null)
  }

  const { data: created, error } = await db
    .from("lms_exam_sessions")
    .insert({ student_id: student.id, module_id, course_id, started_at: now.toISOString() })
    .select("started_at")
    .single()

  if (error) {
    // Two "Begin" clicks racing: the partial unique index let only one open
    // session through. Resume whichever won.
    const { data: winner } = await db
      .from("lms_exam_sessions")
      .select("started_at")
      .eq("student_id", student.id)
      .eq("module_id", module_id)
      .is("submitted_at", null)
      .maybeSingle()
    if (winner) return respond(winner.started_at)
    console.error("[exam-session] could not open session", { studentId: student.id, module_id, error })
    return NextResponse.json({ error: "Could not start the exam. Please try again." }, { status: 500 })
  }

  return respond(created.started_at)
}
