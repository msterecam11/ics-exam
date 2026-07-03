import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

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

  // Wipe all progress for this student in this course (keyed on student+course).
  // Certificates are deliberately NOT deleted.
  const targets = [
    "lms_package_progress",     // interactive package/activity progress
    "lms_module_attempts",      // exam + assignment attempts/grades
    "lms_progress",             // legacy content-item progress
    "lms_assignment_submissions", // uploaded assignment files
  ] as const

  for (const table of targets) {
    const { error } = await db.from(table).delete()
      .eq("student_id", student_id).eq("course_id", course_id)
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 })
  }

  // Remove the enrollment itself (student drops off the roster)
  const { error: enrErr } = await db.from("lms_enrollments").delete()
    .eq("student_id", student_id).eq("course_id", course_id)
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
