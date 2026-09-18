import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// GET /api/lms/question-bank
// Returns all question sets with their full questions — used by the bank picker modal
// Admin / instructor only
export async function GET() {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res

  const { data: sets, error: setsErr } = await db
    .from("lms_question_sets")
    .select("id, name, topic")
    .order("created_at", { ascending: false })

  if (setsErr) return NextResponse.json({ error: setsErr.message }, { status: 500 })
  if (!sets?.length) return NextResponse.json([])

  const setIds = sets.map(s => s.id)

  const { data: questions, error: qErr } = await db
    .from("lms_questions")
    .select(`
      id, set_id, type, text_en, score, difficulty, tags,
      ordering_items, matching_pairs,
      lms_question_choices(id, text_en, is_correct, order_index)
    `)
    .in("set_id", setIds)
    .order("created_at", { ascending: true })

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const qBySet: Record<string, any[]> = {}
  for (const q of (questions ?? [])) {
    if (!q.set_id) continue
    if (!qBySet[q.set_id]) qBySet[q.set_id] = []
    qBySet[q.set_id].push({
      ...q,
      lms_question_choices: [...(q.lms_question_choices ?? [])].sort(
        (a: any, b: any) => a.order_index - b.order_index
      ),
    })
  }

  // Sets holding exam-bank questions have none here; listing them would show empty sets.
  const result = sets.filter(s => qBySet[s.id]?.length).map(s => ({
    ...s,
    questions: qBySet[s.id],
  }))

  return NextResponse.json(result)
}
