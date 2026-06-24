import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import bcrypt from "bcryptjs"

// POST /api/lms/profile/password
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { current, next } = await req.json().catch(() => ({}))
  if (!current || !next) return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  if (next.length < 6)   return NextResponse.json({ error: "Password too short" }, { status: 400 })

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
    .update({ password_hash: hash })
    .eq("id", student.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
