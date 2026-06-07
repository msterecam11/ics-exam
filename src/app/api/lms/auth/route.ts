import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createStudentSession, setStudentCookie, deleteStudentSession } from "@/lib/lms-auth"
import bcrypt from "bcryptjs"

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

// POST /api/lms/auth — login
export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))

  if (!email || !password)
    return NextResponse.json({ error: "Email and password required" }, { status: 400 })

  const { data: student } = await db
    .from("lms_students")
    .select("id, name, email, password_hash, failed_attempts, locked_until, language, avatar_url, qr_code")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (!student)
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })

  // Check lock
  if (student.locked_until && new Date(student.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(student.locked_until).getTime() - Date.now()) / 60000)
    return NextResponse.json({ error: `Account locked. Try again in ${mins} minute(s).` }, { status: 423 })
  }

  const valid = await bcrypt.compare(password, student.password_hash)

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
