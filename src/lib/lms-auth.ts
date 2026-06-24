// ─── LMS Student Authentication ──────────────────────────────
// Separate from admin NextAuth — students use their own
// session tokens stored in an httpOnly cookie.

import { cookies } from "next/headers"
import { db } from "@/lib/db"
import crypto from "crypto"

const COOKIE_NAME = "lms_session"
const SESSION_DAYS = 30

export type StudentSession = {
  id:         string
  name:       string
  email:      string
  language:   string
  avatar_url: string | null
}

// ── Hash token for storage ────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// ── Create a new session (called after successful login) ───────
export async function createStudentSession(studentId: string): Promise<string> {
  const token     = crypto.randomBytes(32).toString("hex")
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await db.from("lms_student_sessions").insert({
    student_id: studentId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  })

  // Update last_login
  await db.from("lms_students").update({ last_login: new Date().toISOString() }).eq("id", studentId)

  return token
}

// ── Set session cookie ────────────────────────────────────────
export async function setStudentCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   SESSION_DAYS * 24 * 60 * 60,
  })
}

// ── Get current student from cookie ──────────────────────────
export async function getStudentSession(): Promise<StudentSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const tokenHash = hashToken(token)

  const { data: session } = await db
    .from("lms_student_sessions")
    .select("student_id, expires_at")
    .eq("token_hash", tokenHash)
    .single()

  if (!session) return null
  if (new Date(session.expires_at) < new Date()) {
    await db.from("lms_student_sessions").delete().eq("token_hash", tokenHash)
    return null
  }

  const { data: student } = await db
    .from("lms_students")
    .select("id, name, email, language, avatar_url")
    .eq("id", session.student_id)
    .single()

  if (!student) return null

  return {
    id:         student.id,
    name:       student.name,
    email:      student.email,
    language:   student.language,
    avatar_url: student.avatar_url,
  }
}

// ── Delete session (logout) ───────────────────────────────────
export async function deleteStudentSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) {
    await db.from("lms_student_sessions").delete().eq("token_hash", hashToken(token))
    cookieStore.delete(COOKIE_NAME)
  }
}

// ── Clean up expired sessions (call periodically) ─────────────
export async function purgeExpiredSessions() {
  await db.from("lms_student_sessions").delete().lt("expires_at", new Date().toISOString())
}
