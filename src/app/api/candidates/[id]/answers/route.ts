import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public — candidate result page. Intentionally unauthenticated.
// Returns ONLY the minimum data needed; internal fields are never exposed.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(title, show_results, passing_score)")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const canView =
    candidate.results_released ||
    (candidate.exams as any)?.show_results === "immediate"

  // Results not yet released — return only what the pending screen needs
  if (!canView) {
    return NextResponse.json({
      visible  : false,
      submitted: !!candidate.submitted_at,
      candidate: {
        full_name   : candidate.full_name,
        submitted_at: candidate.submitted_at,
        exams       : { title: (candidate.exams as any)?.title ?? null },
      },
    })
  }

  // Results visible — return score data, strip internal flags
  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", id)

  const sorted = (answers ?? []).sort(
    (a: any, b: any) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
  )

  return NextResponse.json({
    visible  : true,
    candidate: {
      full_name   : candidate.full_name,
      total_score : candidate.total_score,
      passed      : candidate.passed,
      submitted_at: candidate.submitted_at,
      exams       : {
        title        : (candidate.exams as any)?.title        ?? null,
        passing_score: (candidate.exams as any)?.passing_score ?? null,
      },
    },
    answers: sorted,
  })
}
