import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { scaleToTarget } from "@/lib/scoreDisplay"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(title, passing_score, show_results, courses(name, groups(name)))")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", id)

  // Question Bank exams draw a random subset per candidate, so raw question
  // weights have no reason to sum to 100 for any given draw — this is
  // display-only scaling (same scaleToTarget already used on every
  // candidate-facing/report page) so the admin Answers view's points always
  // sum to exactly 100 too. Grading itself (score_achieved, total_score) is
  // completely untouched.
  const rawAnswers = answers ?? []
  const rawPossible = rawAnswers.map((a: any) => a.questions?.score ?? 0)
  const displayPossible = scaleToTarget(rawPossible)
  const answersWithDisplay = rawAnswers.map((a: any, i: number) => {
    const raw = rawPossible[i]
    const ratio = raw > 0 ? displayPossible[i] / raw : 0
    return {
      ...a,
      display_possible: displayPossible[i],
      display_achieved: Math.round((a.score_achieved ?? 0) * ratio * 100) / 100,
    }
  })

  return NextResponse.json({ candidate, answers: answersWithDisplay })
}
