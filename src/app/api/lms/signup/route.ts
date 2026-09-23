// Self sign-up. Creates an UNVERIFIED account and emails a confirmation link;
// the account can do nothing at all until that link is clicked.
//
// The response is deliberately identical whether the address was free, already
// registered, or rate-limited — otherwise the form becomes a way to discover
// which of a client's staff already have accounts.

import { NextResponse } from "next/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp } from "@/lib/apiUtils"
import { verifyTurnstile } from "@/lib/turnstile"
import { sendEmail, buildVerifyEmail, buildAlreadyRegisteredEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const EXPIRES_HOURS = 24
const MIN_PASSWORD = 8
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex")
const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s.slice(0, max) : null
}

export async function POST(req: Request) {
  // One answer for every outcome below.
  const generic = NextResponse.json({
    ok: true,
    message: "Check your email — we've sent you a link to confirm your address.",
  })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const ip = getIp(req)

  const perIp = await rateLimit(`lms-signup-ip:${ip}`, 5, 3600)
  if (!perIp.allowed) return generic

  if (process.env.NODE_ENV === "production") {
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : ""
    if (!token || !(await verifyTurnstile(token)))
      return NextResponse.json({ error: "Please complete the captcha." }, { status: 400 })
  }

  const name = text(body.name, 200)
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""

  // These three are worth telling the truth about: they are about what the
  // person typed, not about who exists.
  if (!name) return NextResponse.json({ error: "Enter your full name" }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 })
  if (password.length < MIN_PASSWORD)
    return NextResponse.json({ error: `Your password needs at least ${MIN_PASSWORD} characters` }, { status: 400 })
  if (body.consent !== true)
    return NextResponse.json({ error: "Please accept the privacy policy to continue" }, { status: 400 })

  const perEmail = await rateLimit(`lms-signup-email:${email}`, 3, 3600)
  if (!perEmail.allowed) return generic

  const { data: existing } = await db.from("lms_students").select("id, name, email").eq("email", email).maybeSingle()

  if (existing) {
    // Tell the OWNER of the address, not the person filling in the form.
    const { subject, html } = buildAlreadyRegisteredEmail({
      studentName: (existing as any).name,
      loginUrl: `${APP_URL}/lms/login`,
      forgotUrl: `${APP_URL}/lms/forgot-password`,
    })
    sendEmail({ type: "signup", to: (existing as any).email, subject, html, studentId: (existing as any).id }).catch(() => {})
    return generic
  }

  const { data: student, error } = await db.from("lms_students").insert({
    name,
    email,
    password_hash: bcrypt.hashSync(password, 10),
    phone: text(body.phone, 50),
    company: text(body.company, 200),   // free text — never links them to a client
    job_title: text(body.job_title, 200),
    self_registered: true,
    signup_source: text(body.source, 100) ?? "web",
    consent_at: new Date().toISOString(),
    email_verified_at: null,
  }).select("id, name, email").single()

  // A race on the unique email lands here; the generic answer covers it.
  if (error || !student) return generic

  const token = crypto.randomBytes(32).toString("hex")
  await db.from("lms_email_verifications").insert({
    student_id: (student as any).id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + EXPIRES_HOURS * 3600_000).toISOString(),
  })

  const { subject, html } = buildVerifyEmail({
    studentName: (student as any).name,
    verifyUrl: `${APP_URL}/lms/verify?token=${token}`,
    expiresHours: EXPIRES_HOURS,
  })
  sendEmail({ type: "signup", to: (student as any).email, subject, html, studentId: (student as any).id }).catch(() => {})

  return generic
}
