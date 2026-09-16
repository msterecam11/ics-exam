import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"

// LMS Settings -> Student Passwords.
//
// Lets an admin require selected students to set a new password. While the
// requirement is in place every portal page redirects the student to
// /lms/change-password; choosing a new password (or using a reset link) clears
// it. Admin only — this signs people out, so instructors don't get it.

// GET — every student with their password status
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("lms_students")
    .select("id, name, email, company, last_login, created_at, must_change_password, password_changed_at")
    .order("name", { ascending: true })

  if (error) return NextResponse.json({ error: "Could not load students" }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — { student_ids: string[], require: boolean }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { student_ids, require } = await req.json().catch(() => ({}))
  if (!Array.isArray(student_ids) || student_ids.length === 0 || !student_ids.every(id => typeof id === "string"))
    return NextResponse.json({ error: "Select at least one student" }, { status: 400 })
  if (typeof require !== "boolean")
    return NextResponse.json({ error: "require must be true or false" }, { status: 400 })

  const { data: updated, error } = await db
    .from("lms_students")
    .update({ must_change_password: require })
    .in("id", student_ids)
    .select("id, name")

  if (error) return NextResponse.json({ error: "Could not update students" }, { status: 500 })

  if (require && updated?.length) {
    // Sign them out everywhere. Otherwise a student already signed in (sessions
    // last 30 days) would only meet the requirement on their next page load —
    // and, more to the point, anyone else holding a session on that account
    // keeps it. After this, getting back in means signing in with the current
    // password and then choosing a new one.
    await db.from("lms_student_sessions").delete().in("student_id", updated.map(s => s.id))
  }

  await auditLog(
    { user: { id: session.user.id, name: session.user.name, role: session.user.role } },
    require ? "lms.student_password_change.required" : "lms.student_password_change.cancelled",
    "lms_student", null, null,
    { count: updated?.length ?? 0, student_ids: (updated ?? []).map(s => s.id) },
  )

  return NextResponse.json({ updated: updated?.length ?? 0 })
}
