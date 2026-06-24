import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"

// GET /api/lms/profile
export async function GET() {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await db
    .from("lms_students")
    .select("id, name, email, job_title, company, language")
    .eq("id", student.id)
    .single()

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/lms/profile
export async function PATCH(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, job_title, company, language } = await req.json().catch(() => ({}))

  const { error } = await db
    .from("lms_students")
    .update({ name: name?.trim() || undefined, job_title, company, language })
    .eq("id", student.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
