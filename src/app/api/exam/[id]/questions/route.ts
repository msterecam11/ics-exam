import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scaleToTarget } from "@/lib/scoreDisplay"

// Public — returns questions WITHOUT is_correct flags (prevents cheating)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const candidateId = new URL(req.url).searchParams.get("candidate_id")

  const { data: exam } = await db.from("exams").select("id, shuffle_options").eq("id", id).single()
  if (!exam) return NextResponse.json([], { status: 200 })
  const shuffleOptions = (exam as any).shuffle_options !== false

  let questions: any[] | null = null

  // A candidate with rows in candidate_exam_questions has a frozen random
  // draw — regardless of whether it came from one bank, several banks, or
  // (for manual exams) doesn't exist at all. Checking the data directly
  // instead of an exam-level "question_bank_id" column means this route
  // doesn't need to know how many banks, if any, an exam is linked to.
  if (candidateId) {
    const { data: rows } = await db
      .from("candidate_exam_questions")
      .select(`
        order_index,
        questions(
          id, type, text, score, image_url,
          choices(id, text, order_index),
          matching_pairs(id, left_item, right_item, order_index),
          ordering_items(id, text, order_index)
        )
      `)
      .eq("candidate_id", candidateId)
      .order("order_index")
    if (rows?.length) questions = rows.map((r: any) => r.questions).filter(Boolean)
  }

  if (!questions) {
    // Manual exam (or no draw found) — unchanged from before this feature existed.
    // Sections are exam-only (never on bank questions, see exam_sections.sql),
    // so this is the only branch that ever needs the section join.
    const { data } = await db
      .from("questions")
      .select(`
        id, type, text, score, order_index, image_url, section_id,
        section:exam_sections(id, title, description, order_index),
        choices(id, text, order_index),
        matching_pairs(id, left_item, right_item, order_index),
        ordering_items(id, text, order_index)
      `)
      .eq("exam_id", id)
      .order("order_index")
    questions = data
  }

  if (!questions) return NextResponse.json([], { status: 200 })

  // Candidates always see point values that sum to exactly 100 for their
  // sitting, regardless of the underlying questions' real weights — this is
  // purely a display transform (computed fresh from this candidate's own
  // question set) and never touches grading, which still uses the real
  // question.score values via submit/route.ts.
  const displayScores = scaleToTarget(questions.map((q: any) => q.score ?? 0))

  // Shuffle ordering items so candidates don't see the correct order — gated
  // per-exam by shuffle_options (defaults to true, matching prior behavior).
  const sanitized = questions.map((q: any, i: number) => ({
    ...q,
    display_score: displayScores[i],
    ordering_items: q.ordering_items
      ? (shuffleOptions ? [...q.ordering_items].sort(() => Math.random() - 0.5) : q.ordering_items)
      : [],
    choices: q.choices
      ? (shuffleOptions ? [...q.choices].sort(() => Math.random() - 0.5) : q.choices)
      : [],
  }))

  return NextResponse.json(sanitized)
}
