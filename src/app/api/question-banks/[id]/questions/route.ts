import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: question_bank_id } = await params
  const { data } = await db
    .from("questions")
    .select("*, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("question_bank_id", question_bank_id)
    .order("order_index")

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: question_bank_id } = await params
  const body = await req.json()
  const { type, text, score, order_index, ai_scoring_guide, choices, matching_pairs, ordering_items } = body

  // Insert question
  const { data: question, error: qErr } = await db
    .from("questions")
    .insert({ question_bank_id, type, text, score, order_index: order_index ?? 0, ai_scoring_guide: ai_scoring_guide ?? null })
    .select()
    .single()

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  // Insert related data depending on type
  if ((type === "mcq_single" || type === "mcq_multi") && choices?.length > 0) {
    const rows = choices.map((c: any, i: number) => ({
      question_id: question.id,
      text: c.text,
      is_correct: c.is_correct ?? false,
      score: c.score ?? 0,
      order_index: i,
    }))
    await db.from("choices").insert(rows)
  }

  if (type === "matching" && matching_pairs?.length > 0) {
    const rows = matching_pairs.map((p: any, i: number) => ({
      question_id: question.id,
      left_item: p.left_item,
      right_item: p.right_item,
      order_index: i,
    }))
    await db.from("matching_pairs").insert(rows)
  }

  if (type === "ordering" && ordering_items?.length > 0) {
    const rows = ordering_items.map((item: any, i: number) => ({
      question_id: question.id,
      text: item.text,
      correct_position: item.correct_position ?? i,
      order_index: i,
    }))
    await db.from("ordering_items").insert(rows)
  }

  // Return question with all related data
  const { data: full } = await db
    .from("questions")
    .select("*, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("id", question.id)
    .single()

  return NextResponse.json(full, { status: 201 })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: question_bank_id } = await params
  const body = await req.json()
  const { questions } = body

  // Reorder questions (update order_index for each)
  const updates = questions.map((q: { id: string; order_index: number }) =>
    db.from("questions").update({ order_index: q.order_index }).eq("id", q.id).eq("question_bank_id", question_bank_id)
  )

  await Promise.all(updates)
  return NextResponse.json({ success: true })
}
