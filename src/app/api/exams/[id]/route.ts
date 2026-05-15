import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { recalculateExamScores } from "@/lib/scoring"

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
  const { title, description, duration_minutes, passing_score, show_results, language, status, password } = body

  const { data, error } = await db
    .from("exams")
    .update({ title, description, duration_minutes, passing_score, show_results, language, status, ...(password ? { password } : {}) })
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

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { error } = await db.from("exams").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
