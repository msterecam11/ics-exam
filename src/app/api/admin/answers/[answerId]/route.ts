import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ answerId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { answerId } = await params
  const { score_achieved } = await req.json()

  if (typeof score_achieved !== "number" || score_achieved < 0) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 })
  }

  // Get the answer to find the candidate and question max score
  const { data: answer } = await db
    .from("candidate_answers")
    .select("candidate_id, questions(score)")
    .eq("id", answerId)
    .single()

  if (!answer) return NextResponse.json({ error: "Answer not found" }, { status: 404 })

  const maxScore = (answer.questions as any)?.score ?? 0
  const clamped = Math.min(Math.max(0, score_achieved), maxScore)

  // Update the answer score
  await db
    .from("candidate_answers")
    .update({ score_achieved: Math.round(clamped * 100) / 100 })
    .eq("id", answerId)

  // Recalculate candidate total from all answers
  const { data: allAnswers } = await db
    .from("candidate_answers")
    .select("score_achieved, questions(score)")
    .eq("candidate_id", answer.candidate_id)

  const totalEarned = (allAnswers ?? []).reduce((s, a) => s + (a.score_achieved ?? 0), 0)
  const totalPossible = (allAnswers ?? []).reduce((s, a) => s + ((a.questions as any)?.score ?? 0), 0)
  const percentage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0

  // Get passing score
  const { data: candidate } = await db
    .from("candidates")
    .select("exams(passing_score)")
    .eq("id", answer.candidate_id)
    .single()

  const passingScore = (candidate?.exams as any)?.passing_score ?? 60
  const passed = percentage >= passingScore

  await db
    .from("candidates")
    .update({
      total_score: Math.round(percentage * 100) / 100,
      passed,
    })
    .eq("id", answer.candidate_id)

  return NextResponse.json({
    score_achieved: clamped,
    new_total: Math.round(percentage * 100) / 100,
    passed,
  })
}
