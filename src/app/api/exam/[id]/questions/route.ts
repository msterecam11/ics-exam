import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public — returns questions WITHOUT is_correct flags (prevents cheating)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: questions } = await db
    .from("questions")
    .select(`
      id, type, text, score, order_index,
      choices(id, text, order_index),
      matching_pairs(id, left_item, right_item, order_index),
      ordering_items(id, text, order_index)
    `)
    .eq("exam_id", id)
    .order("order_index")

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
