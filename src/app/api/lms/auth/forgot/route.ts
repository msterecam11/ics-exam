import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail, buildPasswordResetEmail } from "@/lib/email"
import crypto from "crypto"

const EXPIRES_MIN = 30
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ics-exam.vercel.app"

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

  if (!email || typeof email !== "string") return generic

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
  const expiresAt = new Date(Date.now() + EXPIRES_MIN * 60 * 1000)

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
    expiresMin: EXPIRES_MIN,
  })
  sendEmail({ type: "password_reset", to: student.email, subject, html, studentId: student.id })
    .catch(() => {})

  return generic
}
