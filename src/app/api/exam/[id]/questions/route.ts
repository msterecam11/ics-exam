import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public — returns questions WITHOUT is_correct flags (prevents cheating)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const candidateId = new URL(req.url).searchParams.get("candidate_id")

  const { data: exam } = await db.from("exams").select("id, question_bank_id").eq("id", id).single()
  if (!exam) return NextResponse.json([], { status: 200 })

  let questions: any[] | null = null

  if (exam.question_bank_id) {
    // Question Bank exam — return ONLY this candidate's frozen random draw.
    if (!candidateId) return NextResponse.json({ error: "candidate_id required" }, { status: 400 })
    const { data: rows } = await db
      .from("candidate_exam_questions")
      .select(`
        order_index,
        questions(
          id, type, text, score,
          choices(id, text, order_index),
          matching_pairs(id, left_item, right_item, order_index),
          ordering_items(id, text, order_index)
        )
      `)
      .eq("candidate_id", candidateId)
      .order("order_index")
    questions = (rows ?? []).map((r: any) => r.questions).filter(Boolean)
  } else {
    // Manual exam — unchanged from before this feature existed.
    const { data } = await db
      .from("questions")
      .select(`
        id, type, text, score, order_index,
        choices(id, text, order_index),
        matching_pairs(id, left_item, right_item, order_index),
        ordering_items(id, text, order_index)
      `)
      .eq("exam_id", id)
      .order("order_index")
    questions = data
  }

  if (!questions) return NextResponse.json([], { status: 200 })

  // Shuffle ordering items so candidates don't see the correct order
  const sanitized = questions.map((q: any) => ({
    ...q,
    ordering_items: q.ordering_items
      ? [...q.ordering_items].sort(() => Math.random() - 0.5)
      : [],
    // Shuffle choices too for variety
    choices: q.choices
      ? [...q.choices].sort(() => Math.random() - 0.5)
      : [],
  }))

  return NextResponse.json(sanitized)
}
