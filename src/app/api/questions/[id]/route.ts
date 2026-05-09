import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { recalculateExamScores } from "@/lib/scoring"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { text, score, ai_scoring_guide, choices, matching_pairs, ordering_items } = body

  // Fetch exam_id and old score before updating (needed for proportional open_ended rescaling)
  const { data: existing } = await db.from("questions").select("exam_id, score").eq("id", id).single()

  await db.from("questions").update({ text, score, ai_scoring_guide }).eq("id", id)

  // Replace related data
  if (choices !== undefined) {
    await db.from("choices").delete().eq("question_id", id)
    if (choices.length > 0) {
      await db.from("choices").insert(
        choices.map((c: any, i: number) => ({ question_id: id, text: c.text, is_correct: c.is_correct, score: c.score, order_index: i }))
      )
    }
  }

  if (matching_pairs !== undefined) {
    await db.from("matching_pairs").delete().eq("question_id", id)
    if (matching_pairs.length > 0) {
      await db.from("matching_pairs").insert(
        matching_pairs.map((p: any, i: number) => ({ question_id: id, left_item: p.left_item, right_item: p.right_item, order_index: i }))
      )
    }
  }

  if (ordering_items !== undefined) {
    await db.from("ordering_items").delete().eq("question_id", id)
    if (ordering_items.length > 0) {
      await db.from("ordering_items").insert(
        ordering_items.map((item: any, i: number) => ({ question_id: id, text: item.text, correct_position: item.correct_position, order_index: i }))
      )
    }
  }

  const { data } = await db
    .from("questions")
    .select("*, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("id", id)
    .single()

  // Recalculate all submitted candidates' scores in the background.
  // Pass old score so open_ended answers are scaled proportionally (not just clamped).
  if (existing?.exam_id) {
    const prevScores = existing.score != null ? { [id]: existing.score } : undefined
    recalculateExamScores(existing.exam_id, prevScores).catch(console.error)
  }

  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { error } = await db.from("questions").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
