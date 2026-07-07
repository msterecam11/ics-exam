import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { recalculateExamScores } from "@/lib/scoring"
import bcrypt from "bcryptjs"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data, error } = await db
    .from("exams")
    .select(`
      *,
      courses(id, name, groups(id, name)),
      exam_custom_fields(*),
      questions(
        *,
        choices(*),
        matching_pairs(*),
        ordering_items(*)
      )
    `)
    .eq("id", id)
    .order("order_index", { referencedTable: "questions", ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { title, description, duration_minutes, passing_score, show_results, language, status, password,
          question_bank_id, bank_draw_config } = body

  // If a new password is provided, hash it
  const passwordUpdates: Record<string, string> = {}
  if (password) {
    passwordUpdates.password      = password           // keep plaintext for admin display
    passwordUpdates.password_hash = await bcrypt.hash(password, 12)
  }

  // Question Bank link — only touched when explicitly provided, so the
  // existing exam-settings form (which never sends these) never affects them.
  const bankUpdates: Record<string, unknown> = {}
  if (question_bank_id !== undefined) bankUpdates.question_bank_id = question_bank_id
  if (bank_draw_config !== undefined) bankUpdates.bank_draw_config = bank_draw_config

  const { data, error } = await db
    .from("exams")
    .update({ title, description, duration_minutes, passing_score, show_results, language, status, ...passwordUpdates, ...bankUpdates })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If passing_score changed, recalculate pass/fail for all submitted candidates
  if (passing_score !== undefined) {
    recalculateExamScores(id).catch(console.error)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { course_id } = await req.json()
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db
    .from("exams")
    .update({ course_id })
    .eq("id", id)
    .select("id, title, course_id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { auditLog } = await import("@/lib/audit")
  await auditLog(session, "exam.move", "exam", id, data?.title)

  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Fetch name before deleting (for audit log)
  const { data: exam } = await db.from("exams").select("title").eq("id", id).single()

  const { error } = await db.from("exams").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { auditLog } = await import("@/lib/audit")
  await auditLog(session, "exam.delete", "exam", id, exam?.title)

  return NextResponse.json({ success: true })
}
