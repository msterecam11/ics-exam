/**
 * POST /api/lms/admin/preview-as
 * Admin, or an instructor for a student in their own programs. Creates a
 * READ-ONLY student session so the caller can see the portal as that student;
 * nothing done in it is recorded (see PREVIEW_READ_ONLY in lms-auth).
 *
 * Sets the student session cookie directly on this same-origin response
 * (rather than returning the raw token for a follow-up navigation to embed
 * in a URL) and returns { redirect_to } — a plain path with no secret in
 * it, safe to log/appear in browser history.
 */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import crypto from "crypto"
import { isMgr } from "@/lib/staff-roles"
import { staffScope, canSeeStudent } from "@/lib/staff-access"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"

const COOKIE_NAME  = "lms_session"
const SESSION_SECS = 2 * 60 * 60 // 2 hours

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { student_id, course_id } = body
  if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

  // Admins may preview anyone. An instructor only a student in one of their
  // own programs (and tracks) — the same scope as everywhere else. This used to
  // check lms_course_instructors, a table from before programs that nothing
  // fills, so no instructor could ever use it.
  if (session.user.role !== "admin") {
    const scope = await staffScope({ id: session.user.id, role: session.user.role })
    if (!(await canSeeStudent(scope, student_id)))
      return NextResponse.json({ error: "This student isn't in one of your programs" }, { status: 403 })
  }
  // Previewing a course only makes sense for a student actually enrolled in it.
  if (course_id && !(await getCurrentEnrollment(student_id, course_id)))
    return NextResponse.json({ error: "This student isn't enrolled in this course" }, { status: 404 })

  // Verify student exists
  const { data: student } = await db
    .from("lms_students")
    .select("id, name")
    .eq("id", student_id)
    .single()

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })

  // Create a real session token (valid for 2 hours for preview)
  const token     = crypto.randomBytes(32).toString("hex")
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
  const expiresAt = new Date(Date.now() + SESSION_SECS * 1000)

  await db.from("lms_student_sessions").insert({
    student_id:  student.id,
    token_hash:  tokenHash,
    expires_at:  expiresAt.toISOString(),
    // Read-only: the portal shows everything but records nothing in the
    // student's name (no exam, progress, feedback or profile changes).
    is_preview:  true,
  })

  await auditLog(session, "lms.preview_as", "lms_student", student.id, student.name, { course_id })

  // Set the cookie directly on this same-origin response — the admin's
  // browser already has this response; no separate URL-embedded-token
  // navigation is needed.
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   SESSION_SECS,
  })

  const redirect_to = course_id ? `/lms/courses/${course_id}` : `/lms/dashboard`

  return NextResponse.json({ ok: true, student_name: student.name, redirect_to })
}
