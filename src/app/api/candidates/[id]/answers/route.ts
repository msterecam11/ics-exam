import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scaleToTarget } from "@/lib/scoreDisplay"

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

  // Strip is_correct and score from choices — prevents candidates from using the
  // result page to learn correct answers and sharing them with others sitting the same exam
  const sanitizedAnswers = sorted.map((a: any) => ({
    ...a,
    questions: a.questions ? {
      ...a.questions,
      choices: (a.questions.choices ?? []).map(({ is_correct, score, ...rest }: any) => rest),
    } : null,
  }))

  // Same display-only scaling as the take page — the "possible" column
  // always sums to exactly 100 for this candidate's own question set, and
  // "achieved" is scaled by the same per-question ratio so the review page
  // is visually consistent with what was shown while taking the exam.
  // Grading itself (candidate.total_score) is untouched — already computed
  // as a percentage at submit time from the real raw question.score values.
  const rawPossible = sorted.map((a: any) => a.questions?.score ?? 0)
  const displayPossible = scaleToTarget(rawPossible)
  const answersWithDisplay = sanitizedAnswers.map((a: any, i: number) => {
    const raw = rawPossible[i]
    const ratio = raw > 0 ? displayPossible[i] / raw : 0
    return {
      ...a,
      display_possible: displayPossible[i],
      display_achieved: Math.round((a.score_achieved ?? 0) * ratio * 100) / 100,
    }
  })

  return NextResponse.json({
    visible  : true,
    candidate: {
      full_name   : candidate.full_name,
      total_score : candidate.total_score,
      passed      : candidate.passed,
      submitted_at: candidate.submitted_at,
      started_at  : candidate.started_at,
      exams       : {
        title        : (candidate.exams as any)?.title        ?? null,
        passing_score: (candidate.exams as any)?.passing_score ?? null,
      },
    },
    answers: answersWithDisplay,
  })
}
