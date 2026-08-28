/**
 * POST /api/lms/admin/preview-as
 * Admin, or an instructor assigned to the given course, only. Creates a
 * student session token for any enrolled student so the caller can test
 * the student portal as that student.
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

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const COOKIE_NAME  = "lms_session"
const SESSION_SECS = 2 * 60 * 60 // 2 hours

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { student_id, course_id } = body
  if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

  // Instructors may only preview as a student in a course they're actually
  // assigned to; admins can preview anyone. Previously any instructor could
  // impersonate any student in any course.
  if (session.user.role === "instructor") {
    if (!course_id)
      return NextResponse.json({ error: "course_id required for instructor preview" }, { status: 400 })
    const { data: assignment } = await db
      .from("lms_course_instructors")
      .select("course_id")
      .eq("course_id", course_id)
      .eq("instructor_id", session.user.id)
      .single()
    if (!assignment)
      return NextResponse.json({ error: "You are not assigned to this course" }, { status: 403 })
  }

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
