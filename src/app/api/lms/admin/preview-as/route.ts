/**
 * POST /api/lms/admin/preview-as
 * Admin-only. Creates a student session token for any enrolled student
 * so the admin can test the student portal as that student.
 *
 * Returns { token, redirect_url } — the caller opens the redirect URL
 * in a new tab, which sets the cookie and goes straight to the course.
 */
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import crypto from "crypto"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { student_id, course_id } = body
  if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

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
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours

  await db.from("lms_student_sessions").insert({
    student_id:  student.id,
    token_hash:  tokenHash,
    expires_at:  expiresAt.toISOString(),
  })

  // The redirect URL goes to /lms/admin-preview-entry which sets the cookie
  const to = course_id
    ? `/lms/courses/${course_id}`
    : `/lms/dashboard`

  const params = new URLSearchParams({ token, to })
  const redirect_url = `${APP_URL}/lms/admin-preview-entry?${params}`

  return NextResponse.json({ ok: true, student_name: student.name, redirect_url })
}
