import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { parseCSV } from "@/lib/csv-parser"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params
  const { csv_text, start_index = 0 } = await req.json()

  if (!csv_text?.trim()) return NextResponse.json({ error: "No CSV content provided" }, { status: 400 })

  const { questions, errors } = parseCSV(csv_text)

  if (questions.length === 0) {
    return NextResponse.json(
      { error: "No valid questions found", errors },
      { status: 400 }
    )
  }

  let orderIndex = start_index
  let created = 0

  for (const q of questions) {
    const { data: question, error } = await db
      .from("questions")
      .insert({
        exam_id: examId,
        type: q.type,
        text: q.text,
        score: q.score,
        order_index: orderIndex++,
        ai_scoring_guide: q.ai_guide ?? null,
      })
      .select("id")
      .single()

    if (error || !question) continue

    if ((q.type === "mcq_single" || q.type === "mcq_multi") && q.choices?.length) {
      await db.from("choices").insert(
        q.choices.map((c, i) => ({
          question_id: question.id,
          text: c.text,
          is_correct: c.is_correct,
          score: c.score,
          order_index: i,
        }))
      )
    }

    if (q.type === "ordering" && q.ordering_items?.length) {
      await db.from("ordering_items").insert(
        q.ordering_items.map((item, i) => ({
          question_id: question.id,
          text: item.text,
          correct_position: item.correct_position,
          order_index: i,
        }))
      )
    }

    if (q.type === "matching" && q.matching_pairs?.length) {
      await db.from("matching_pairs").insert(
        q.matching_pairs.map((p, i) => ({
          question_id: question.id,
          left_item: p.left_item,
          right_item: p.right_item,
          order_index: i,
        }))
      )
    }

    created++
  }

  return NextResponse.json({ created, total: questions.length, errors })
}
