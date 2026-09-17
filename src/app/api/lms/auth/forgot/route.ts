import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildPasswordResetEmail } from "@/lib/email"
import { loadEmailSettings, effectiveRule, sendRuleEmail } from "@/lib/lms-email-settings"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"
import crypto from "crypto"

const EXPIRES_MIN = 30
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// POST /api/lms/auth/forgot — request a password-reset link
// Always returns a generic success so the endpoint can't be used to
// discover which emails have accounts (no enumeration).
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}))
  const generic = NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  })

  // This endpoint had no rate limit. Anyone could make the app send unlimited
  // reset emails to any student (burning the email quota), and because every
  // request invalidates the previous link, repeating it kept a student's real
  // link permanently dead.
  //
  // Per IP: a real 429 is fine — it applies whatever email is typed, so it
  // reveals nothing about which accounts exist.
  const ip = getIp(req)
  const perIp = await rateLimit(`lms-forgot-ip:${ip}`, 5, 900)
  if (!perIp.allowed) return res429(perIp.retryAfterSeconds)

  if (!email || typeof email !== "string") return generic

  // Per email: return the SAME generic success when limited. A 429 here would
  // only ever appear for addresses someone has been requesting, which is a
  // signal worth not giving.
  const normalized = email.toLowerCase().trim()
  const perEmail = await rateLimit(`lms-forgot-email:${normalized}`, 3, 3600)
  if (!perEmail.allowed) return generic

  const { data: student } = await db
    .from("lms_students")
    .select("id, name, email")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (!student) return generic  // same response — don't reveal existence

  // Invalidate any earlier unused tokens for this student
  await db.from("lms_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("student_id", student.id)
    .is("used_at", null)

  const token     = crypto.randomBytes(32).toString("hex")
  // EM-12 — the link's lifetime is a setting; EXPIRES_MIN is only the fallback.
  const settings = await loadEmailSettings()
  const expiresMin = Number(effectiveRule(settings, "password_reset").config.expiry_minutes ?? EXPIRES_MIN)
  const expiresAt = new Date(Date.now() + expiresMin * 60 * 1000)

  const { error } = await db.from("lms_password_resets").insert({
    student_id: student.id,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  })
  if (error) return generic  // fail closed, still generic

  const resetUrl = `${APP_URL}/lms/reset-password?token=${token}`
  const { subject, html } = buildPasswordResetEmail({
    studentName: student.name,
    resetUrl,
    expiresMin,
  })
  sendRuleEmail({ rule: "password_reset", to: student.email, subject, html, studentId: student.id })
    .catch(() => {})

  return generic
}
