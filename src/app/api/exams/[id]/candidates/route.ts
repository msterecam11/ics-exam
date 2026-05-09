import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Public — no auth needed (candidate registration)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: exam_id } = await params
  const body = await req.json()
  const { full_name, email, job_title, years_of_experience, company, custom_field_values } = body

  // Verify exam exists and is active
  const { data: exam } = await db
    .from("exams")
    .select("id, status")
    .eq("id", exam_id)
    .single()

  if (!exam || exam.status !== "active") {
    return NextResponse.json({ error: "Exam is not available" }, { status: 400 })
  }

  const { data, error } = await db
    .from("candidates")
    .insert({
      exam_id,
      full_name,
      email,
      job_title,
      years_of_experience,
      company,
      custom_field_values: custom_field_values ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// Admin: get all candidates for an exam
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params

  const { data, error } = await db
    .from("candidates")
    .select("*")
    .eq("exam_id", exam_id)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
