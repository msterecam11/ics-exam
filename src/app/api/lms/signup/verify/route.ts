// Confirming the address, and asking for the link again.
//
// POST { token }  → confirms the account
// PUT  { email }  → sends a fresh link, answering the same way whatever happens

import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp } from "@/lib/apiUtils"
import { sendEmail, buildVerifyEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const EXPIRES_HOURS = 24
const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex")

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (!token || typeof token !== "string")
    return NextResponse.json({ error: "That link is missing its code" }, { status: 400 })

  const ip = getIp(req)
  const { allowed } = await rateLimit(`lms-verify-ip:${ip}`, 20, 900)
  if (!allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 })

  const { data: row } = await db.from("lms_email_verifications")
    .select("id, student_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle()

  const r = row as any
  if (!r) return NextResponse.json({ error: "That link isn't valid. Ask for a new one." }, { status: 400 })
  if (r.used_at) return NextResponse.json({ error: "That link has already been used. Try signing in." }, { status: 410 })
  if (new Date(r.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: "That link has expired. Ask for a new one." }, { status: 410 })

  const now = new Date().toISOString()
  await db.from("lms_email_verifications").update({ used_at: now }).eq("id", r.id)
  await db.from("lms_students").update({ email_verified_at: now }).eq("id", r.student_id).is("email_verified_at", null)

  return NextResponse.json({ ok: true })
}

// Ask for the link again. Always the same answer — an unknown address must not
// look different from a known one.
export async function PUT(req: Request) {
  const generic = NextResponse.json({
    ok: true,
    message: "If that address needs confirming, a new link is on its way.",
  })

  const { email } = await req.json().catch(() => ({})) as { email?: string }
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : ""
  if (!normalized) return generic

  const ip = getIp(req)
  if (!(await rateLimit(`lms-resend-ip:${ip}`, 5, 3600)).allowed) return generic
  if (!(await rateLimit(`lms-resend-email:${normalized}`, 3, 3600)).allowed) return generic

  const { data: student } = await db.from("lms_students")
    .select("id, name, email, email_verified_at").eq("email", normalized).maybeSingle()
  const s = student as any
  if (!s || s.email_verified_at) return generic   // already confirmed, or no such account

  // Earlier links stop working the moment a new one is issued.
  await db.from("lms_email_verifications").update({ used_at: new Date().toISOString() })
    .eq("student_id", s.id).is("used_at", null)

  const token = crypto.randomBytes(32).toString("hex")
  await db.from("lms_email_verifications").insert({
    student_id: s.id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + EXPIRES_HOURS * 3600_000).toISOString(),
  })

  const { subject, html } = buildVerifyEmail({
    studentName: s.name,
    verifyUrl: `${APP_URL}/lms/verify?token=${token}`,
    expiresHours: EXPIRES_HOURS,
  })
  sendEmail({ type: "signup", to: s.email, subject, html, studentId: s.id }).catch(() => {})

  return generic
}
