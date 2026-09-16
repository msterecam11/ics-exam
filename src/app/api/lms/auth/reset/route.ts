import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import crypto from "crypto"

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// POST /api/lms/auth/reset — set a new password using a reset token
export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}))

  if (!token || typeof token !== "string")
    return NextResponse.json({ error: "Invalid or missing reset link." }, { status: 400 })
  if (!password || typeof password !== "string" || password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })

  const { data: reset } = await db
    .from("lms_password_resets")
    .select("id, student_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle()

  if (!reset || reset.used_at)
    return NextResponse.json({ error: "This reset link is invalid or has already been used." }, { status: 400 })

  if (new Date(reset.expires_at) < new Date())
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 })

  // Claim the token BEFORE changing anything. This used to check used_at, set
  // the password, and only then mark the token used — so two requests racing
  // with the same link both passed the check and both set a password. The
  // conditional update below succeeds for exactly one request; any other sees
  // no row come back and stops.
  const { data: claimed } = await db
    .from("lms_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", reset.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle()

  if (!claimed)
    return NextResponse.json({ error: "This reset link is invalid or has already been used." }, { status: 400 })

  const password_hash = await bcrypt.hash(password, 10)

  // Update password + clear any lockout from failed logins
  const { error: upErr } = await db
    .from("lms_students")
    // A reset is the student choosing a new password, so it also satisfies an
    // admin-required change.
    .update({ password_hash, failed_attempts: 0, locked_until: null, must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq("id", reset.student_id)
  if (upErr)
    // The token was already claimed above, so this link can't be retried.
    return NextResponse.json({ error: "Could not update password. Please request a new reset link." }, { status: 500 })

  // Invalidate all existing sessions so the old password can't linger
  await db.from("lms_student_sessions").delete().eq("student_id", reset.student_id)

  return NextResponse.json({ ok: true })
}
