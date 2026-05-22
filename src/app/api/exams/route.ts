import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generatePassword } from "@/lib/utils"
import bcrypt from "bcryptjs"

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")

  let query = db
    .from("exams")
    .select(`
      *,
      courses(id, name, groups(id, name)),
      candidates(id)
    `)
    .order("created_at", { ascending: false })

  if (courseId) query = query.eq("course_id", courseId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    title, description, course_id, duration_minutes,
    passing_score, show_results, language, custom_fields,
  } = body

  if (!title?.trim() || !course_id) {
    return NextResponse.json({ error: "Title and course are required" }, { status: 400 })
  }

  const plainPassword  = generatePassword(6)
  const password_hash  = await bcrypt.hash(plainPassword, 12)

  const { data: exam, error } = await db
    .from("exams")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      course_id,
      password:      plainPassword,   // kept for display to admin only — never used to verify
      password_hash,
      duration_minutes: duration_minutes ?? 60,
      passing_score: passing_score ?? 60,
      show_results: show_results ?? "admin_release",
      language: language ?? "en",
      status: "draft",
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert custom fields if provided
  if (custom_fields?.length > 0) {
    const fields = custom_fields.map((f: any, i: number) => ({
      exam_id: exam.id,
      label: f.label,
      field_type: f.field_type ?? "text",
      required: f.required ?? true,
      order_index: i,
    }))
    await db.from("exam_custom_fields").insert(fields)
  }

  return NextResponse.json(exam, { status: 201 })
}
