import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"
import bcrypt from "bcryptjs"

// Public — verify exam password and return basic exam info
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit — 10 password attempts per IP per 15 min (prevents brute force)
  const ip = getIp(req)
  const { allowed, retryAfterSeconds } = await rateLimit(`exam-pw:${ip}`, 10, 900)
  if (!allowed) return res429(retryAfterSeconds)

  const { id } = await params
  const { password } = await req.json()

  const { data: exam } = await db
    .from("exams")
    .select("id, title, description, status, password, password_hash, duration_minutes, language, courses(name, groups(name)), exam_custom_fields(*)")
    .eq("id", id)
    .single()

  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  if (exam.status !== "active") return NextResponse.json({ error: "This exam is not currently active." }, { status: 403 })

  const e = exam as any
  let passwordOk = false

  if (e.password_hash) {
    // New path — bcrypt compare
    passwordOk = await bcrypt.compare(password, e.password_hash)
  } else {
    // Legacy plaintext — compare then lazily migrate to hash
    passwordOk = e.password === password
    if (passwordOk) {
      // Upgrade on first successful login — fire-and-forget
      bcrypt.hash(password, 12).then(hash =>
        db.from("exams").update({ password_hash: hash, password: "" }).eq("id", id)
      ).catch(() => {})
    }
  }

  if (!passwordOk) return NextResponse.json({ error: "Incorrect password." }, { status: 401 })

  // Return exam info — strip both password fields
  const { password: _p, password_hash: _ph, ...safeExam } = e
  return NextResponse.json(safeExam)
}

// Public — get basic exam info (name, course) without password
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: exam } = await db
    .from("exams")
    .select("id, title, description, status, language, duration_minutes, passing_score, courses(name, groups(name))")
    .eq("id", id)
    .single()

  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  return NextResponse.json(exam)
}
