import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createStudentSession, setStudentCookie, deleteStudentSession } from "@/lib/lms-auth"
import { verifyTurnstile } from "@/lib/turnstile"
import { rateLimit } from "@/lib/rateLimit"
import { getIp } from "@/lib/apiUtils"
import bcrypt from "bcryptjs"

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15
const DUMMY_HASH = "$2b$12$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu"

// POST /api/lms/auth — login
export async function POST(req: Request) {
  const { email, password, turnstileToken } = await req.json().catch(() => ({}))

  if (!email || !password)
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })

  // IP-based rate limiting — the same protection the staff login already
  // has (5 attempts / 15 min); previously this route only throttled per
  // account, so an attacker could credential-stuff any number of student
  // accounts from one IP with no limit at all.
  const ip = getIp(req)
  const { allowed } = await rateLimit(`lms-login:${ip}`, 5, 900)
  if (!allowed)
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 })

  // Cloudflare Turnstile CAPTCHA (production only — bypassed in dev)
  if (process.env.NODE_ENV === "production") {
    if (!turnstileToken)
      return NextResponse.json({ error: "Please complete the captcha." }, { status: 400 })
    const captchaOk = await verifyTurnstile(turnstileToken)
    if (!captchaOk)
      return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 })
  }

  const { data: student } = await db
    .from("lms_students")
    .select("id, name, email, password_hash, failed_attempts, locked_until, language, avatar_url")
    .eq("email", email.toLowerCase().trim())
    .single()

  // Always run bcrypt, even for a nonexistent account, so response timing
  // can't be used to enumerate valid student emails (matches the staff
  // login's constant-time comparison in src/lib/auth.ts).
  let valid = false
  try {
    valid = await bcrypt.compare(password, student?.password_hash ?? DUMMY_HASH)
  } catch { valid = false }

  if (!student)
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })

  // Check lock
  if (student.locked_until && new Date(student.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(student.locked_until).getTime() - Date.now()) / 60000)
    return NextResponse.json({ error: `Account locked. Try again in ${mins} minute(s).` }, { status: 423 })
  }

  if (!valid) {
    const attempts = (student.failed_attempts ?? 0) + 1
    const updates: any = { failed_attempts: attempts }
    if (attempts >= MAX_ATTEMPTS) {
      updates.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
    }
    await db.from("lms_students").update(updates).eq("id", student.id)
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  // Reset failed attempts
  await db.from("lms_students").update({ failed_attempts: 0, locked_until: null }).eq("id", student.id)

  const token = await createStudentSession(student.id)
  await setStudentCookie(token)

  return NextResponse.json({ ok: true, name: student.name })
}

// DELETE /api/lms/auth — logout
export async function DELETE() {
  await deleteStudentSession()
  return NextResponse.json({ ok: true })
}
