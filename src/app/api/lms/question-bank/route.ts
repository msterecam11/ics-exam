import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// GET /api/lms/question-bank
// The question sets and their questions, for the "Pick from Question Bank"
// modal in the package and activity editors. Admin / instructor only.
//
// This used to read lms_questions / lms_question_choices — the question tables
// from before the exam bank, which nothing fills any more — so the picker was
// always empty. It now reads the exam bank (lms_bank_questions, current
// versions, archived ones left out) and answers in the shape both pickers were
// written for, so neither editor had to change.
export async function GET() {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res

  const { data: sets, error: setsErr } = await db
    .from("lms_question_sets")
    .select("id, name, topic")
    .order("created_at", { ascending: false })
  if (setsErr) return NextResponse.json({ error: "Could not load the question sets" }, { status: 500 })
  if (!sets?.length) return NextResponse.json([])

  const { data: questions, error: qErr } = await db
    .from("lms_bank_questions")
    .select("id, set_id, type, difficulty, tags, payload")
    .in("set_id", sets.map(s => s.id))
    .is("archived_at", null)
    .order("created_at", { ascending: true })
  if (qErr) return NextResponse.json({ error: "Could not load the questions" }, { status: 500 })

  const qBySet: Record<string, any[]> = {}
  for (const q of (questions ?? []) as any[]) {
    const p = q.payload ?? {}
    ;(qBySet[q.set_id] ??= []).push({
      id:         q.id,
      set_id:     q.set_id,
      type:       q.type === "mcq_multiple" ? "mcq_multi" : q.type === "match_pair" ? "matching" : q.type,
      text_en:    String(p.text ?? ""),
      score:      Number(p.points ?? 1),
      difficulty: q.difficulty,
      tags:       q.tags ?? [],
      ordering_items: Array.isArray(p.items) ? p.items.map((i: any) => ({ text: String(i.text ?? "") })) : null,
      matching_pairs: Array.isArray(p.pairs) ? p.pairs.map((x: any) => ({ left: String(x.left ?? ""), right: String(x.right ?? "") })) : null,
      lms_question_choices: Array.isArray(p.options)
        ? p.options.map((o: any, i: number) => ({ id: String(o.id ?? i), text_en: String(o.text ?? ""), is_correct: !!o.correct, order_index: i }))
        : [],
    })
  }

  // Empty sets would only show as empty tabs.
  return NextResponse.json(sets.filter(s => qBySet[s.id]?.length).map(s => ({ ...s, questions: qBySet[s.id] })))
}
