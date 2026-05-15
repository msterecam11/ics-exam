import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"

// Public — candidate submits their exam
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit by IP — 10 submissions per hour per IP
  const ip = getIp(req)
  const { allowed, retryAfterSeconds } = await rateLimit(`submit:${ip}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { id: exam_id } = await params
  const { candidate_id, answers } = await req.json()
  // answers: { [question_id]: answer_text | answer_json }

  // Verify candidate belongs to this exam
  const { data: candidate } = await db
    .from("candidates")
    .select("id, submitted_at")
    .eq("id", candidate_id)
    .eq("exam_id", exam_id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.submitted_at) return NextResponse.json({ error: "Already submitted" }, { status: 400 })

  // Fetch all questions with answers
  const { data: questions } = await db
    .from("questions")
    .select("*, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("exam_id", exam_id)
    .order("order_index")

  if (!questions) return NextResponse.json({ error: "No questions found" }, { status: 400 })

  let totalScore = 0
  const answerRows = []

  for (const question of questions) {
    const rawAnswer = answers[question.id]
    let scoreAchieved = 0
    let aiJustification: string | null = null
    let answerText: string | null = null
    let answerJson: unknown = null

    if (question.type === "open_ended") {
      answerText = typeof rawAnswer === "string" ? rawAnswer : (rawAnswer?.text ?? "")
      if (answerText) {
        try {
          const guide = question.ai_scoring_guide?.trim()
            || "Evaluate the answer for accuracy, completeness, and relevance to the question."
          const result = await scoreOpenEndedAnswer(
            question.text,
            guide,
            answerText,
            question.score
          )
          scoreAchieved = result.score
          aiJustification = result.justification
        } catch (err) {
          console.error("[AI scoring error]", err instanceof Error ? err.message : err)
          scoreAchieved = 0
          aiJustification = "AI scoring unavailable."
        }
      }
    } else if (question.type === "mcq_single") {
      answerJson = rawAnswer
      const selectedId = rawAnswer?.choice_id
      if (selectedId) {
        const selected = question.choices?.find((c: any) => c.id === selectedId)
        if (selected) {
          // Use explicit choice score if set, otherwise full/zero based on is_correct
          scoreAchieved = (selected.score != null && selected.score > 0)
            ? Math.min(selected.score, question.score)
            : selected.is_correct ? question.score : 0
        }
      }
    } else if (question.type === "mcq_multi") {
      answerJson = rawAnswer
      const selectedIds: string[] = rawAnswer?.choice_ids ?? []
      // Partial scoring: sum scores of correct choices, subtract for wrong ones (min 0)
      let partial = 0
      for (const choice of question.choices ?? []) {
        if (selectedIds.includes(choice.id)) {
          partial += choice.is_correct ? (choice.score || 0) : -(choice.score || 0)
        }
      }
      scoreAchieved = Math.max(0, Math.min(partial, question.score))
    } else if (question.type === "ordering") {
      answerJson = rawAnswer
      const submittedOrder: string[] = rawAnswer?.order ?? []
      const items = question.ordering_items ?? []
      let correct = 0
      items.forEach((item: any) => {
        const submittedPos = submittedOrder.indexOf(item.id)
        if (submittedPos === item.correct_position) correct++
      })
      scoreAchieved = items.length > 0
        ? (correct / items.length) * question.score
        : 0
    } else if (question.type === "matching") {
      answerJson = rawAnswer
      const submittedPairs: { left_id: string; right_id: string }[] = rawAnswer?.pairs ?? []
      const correctPairs = question.matching_pairs ?? []
      // A pair is correct when left_id === right_id (candidate picked the right side of the same pair)
      const pairMap = new Map(correctPairs.map((p: any) => [p.id, p.right_item]))
      let correctCount = 0
      submittedPairs.forEach((p) => {
        const expectedRight  = pairMap.get(p.left_id)
        const submittedRight = correctPairs.find((cp: any) => cp.id === p.right_id)?.right_item
        if (expectedRight && expectedRight === submittedRight) correctCount++
      })
      scoreAchieved = correctPairs.length > 0
        ? (correctCount / correctPairs.length) * question.score
        : 0
    }

    totalScore += scoreAchieved
    answerRows.push({
      candidate_id,
      question_id: question.id,
      answer_text: answerText,
      answer_json: answerJson,
      score_achieved: Math.round(scoreAchieved * 100) / 100,
      ai_justification: aiJustification,
    })
  }

  // Get passing score
  const { data: exam } = await db
    .from("exams")
    .select("passing_score")
    .eq("id", exam_id)
    .single()

  const totalPossible = questions.reduce((sum: number, q: any) => sum + q.score, 0)
  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0
  const passed = percentage >= (exam?.passing_score ?? 60)

  // Save answers and update candidate
  await db.from("candidate_answers").insert(answerRows)
  await db
    .from("candidates")
    .update({
      submitted_at: new Date().toISOString(),
      total_score: Math.round(percentage * 100) / 100,
      passed,
    })
    .eq("id", candidate_id)

  return NextResponse.json({ total_score: percentage, passed })
}
