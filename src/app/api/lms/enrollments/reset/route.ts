import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"

// POST /api/lms/enrollments/reset
// Body: { course_id, student_id }
// Removes a student from ONE course and wipes their progress for it, so a
// later re-enrollment starts from scratch. Certificates are intentionally
// kept (past achievement stays on record). Other courses are untouched.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { course_id, student_id } = await req.json().catch(() => ({}))
  if (!course_id || !student_id)
    return NextResponse.json({ error: "course_id and student_id required" }, { status: 400 })

  // Resets the student's CURRENT enrollment in the course. Earlier program runs
  // (a course taken again later) are history and are never touched.
  const current = await getCurrentEnrollment(student_id, course_id)
  if (!current) return NextResponse.json({ error: "Student is not enrolled in this course" }, { status: 404 })

  // Wipe all progress of this enrollment. Certificates are deliberately NOT
  // deleted (their link to the enrollment is cleared by the database).
  const targets = [
    // Exam sessions first: they reference attempts, and an open session left
    // behind would otherwise be resumed (with an old clock) after re-enrolment.
    "lms_exam_sessions",
    "lms_package_progress",     // interactive package/activity progress
    "lms_module_attempts",      // exam + assignment attempts/grades
    "lms_progress",             // legacy content-item progress
    "lms_assignment_submissions", // uploaded assignment files
  ] as const

  for (const table of targets) {
    const { error } = await db.from(table).delete().eq("enrollment_id", current.id)
    if (error) return NextResponse.json({ error: `Could not reset ${table.replace("lms_", "").replace(/_/g, " ")}` }, { status: 500 })
  }
  await db.from("lms_report_assessments").delete().eq("enrollment_id", current.id)

  if (current.program_id) {
    // Inside a program the student stays a member: keep the enrollment and
    // start it over, rather than leaving the member with no course.
    const { error: enrErr } = await db.from("lms_enrollments")
      .update({ status: "active", completed_at: null, progress_pct: 0, time_spent_s: 0 })
      .eq("id", current.id)
    if (enrErr) return NextResponse.json({ error: "Could not reset the enrollment" }, { status: 500 })
    return NextResponse.json({ ok: true, kept_enrollment: true })
  }

  // Outside programs: remove the enrollment itself (student drops off the roster)
  const { error: enrErr } = await db.from("lms_enrollments").delete().eq("id", current.id)
  if (enrErr) return NextResponse.json({ error: "Could not remove the enrollment" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
