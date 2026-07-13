import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

// Same shape as GET /api/admin/candidates/[id] (candidate + answers), except
// score_achieved on each answer is overlaid with the active manual score
// version's overrides where one exists — untouched questions fall back to
// their real value unchanged. Powers "Manual Answers".
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(title, passing_score, show_results, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: manualScore } = await db
    .from("manual_scores")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!manualScore) return NextResponse.json({ error: "No active manual score" }, { status: 404 })

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const { data: overrides } = await db
    .from("manual_score_answer_overrides")
    .select("candidate_answer_id, manual_score_achieved")
    .eq("manual_score_id", manualScore.id)

  const overrideMap = new Map((overrides ?? []).map((o: any) => [o.candidate_answer_id, o.manual_score_achieved]))

  const manualAnswers = (answers ?? []).map((a: any) => {
    const override = overrideMap.get(a.id)
    return override === undefined ? a : { ...a, score_achieved: override }
  })

  return NextResponse.json({
    candidate: {
      ...candidate,
      total_score: manualScore.achieved_score,
      passed: manualScore.achieved_score >= ((candidate.exams as any)?.passing_score ?? 60),
    },
    answers: manualAnswers,
    manualScore,
  })
}
