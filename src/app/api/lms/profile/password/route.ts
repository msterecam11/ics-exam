import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, deleteOtherStudentSessions, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import bcrypt from "bcryptjs"

// POST /api/lms/profile/password
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  // A stolen-but-not-yet-expired session cookie could otherwise be used to
  // brute-force the real account password (via `current`) at unlimited
  // speed — throttle per-account like every other password check in the app.
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-pw-change:${student.id}`, 5, 900)
  if (!allowed) return res429(retryAfterSeconds)

  const { current, next } = await req.json().catch(() => ({}))
  if (typeof current !== "string" || typeof next !== "string" || !current || !next)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  if (next.length < 8)   return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  // Matters most for a required change: re-entering the same password would
  // clear the requirement without changing anything.
  if (next === current)  return NextResponse.json({ error: "Your new password must be different from your current one" }, { status: 400 })

  const { data } = await db
    .from("lms_students")
    .select("password_hash")
    .eq("id", student.id)
    .single()

  if (!data?.password_hash)
    return NextResponse.json({ error: "No password set on this account" }, { status: 400 })

  const match = await bcrypt.compare(current, data.password_hash)
  if (!match) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })

  const hash = await bcrypt.hash(next, 10)
  const { error } = await db
    .from("lms_students")
    // Clears an admin-required change and records that the student chose this
    // password themselves (shown in LMS Settings -> Student Passwords).
    .update({ password_hash: hash, must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq("id", student.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sign out every other device. The reset-link flow already ends all sessions;
  // this path didn't, so a student changing their password because they
  // suspected someone else was in left that other session valid for up to 30
  // days. The session making this request is kept so the student isn't bounced
  // to the login page.
  await deleteOtherStudentSessions(student.id)

  return NextResponse.json({ ok: true })
}
