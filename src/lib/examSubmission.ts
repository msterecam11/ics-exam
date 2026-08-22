import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

// The actual scoring/finalization logic, extracted so it can be called from
// both a normal candidate Submit and the "Check for Overdue Exams" sweep —
// one implementation, so the two paths can't drift apart. Caller is
// responsible for confirming the candidate hasn't already submitted.
export async function finalizeCandidateSubmission(
  examId: string,
  candidateId: string,
  answers: Record<string, any>
): Promise<{ total_score: number; passed: boolean }> {
  const { data: examRow } = await db.from("exams").select("passing_score").eq("id", examId).single()

  // Question pool to score against — a candidate with a frozen bank draw is
  // scored ONLY against that draw, never "every question in the bank."
  let questions: any[] | null = null
  const { data: drawnRows } = await db
    .from("candidate_exam_questions")
    .select("order_index, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)
    .order("order_index")
  if (drawnRows?.length) {
    questions = drawnRows.map((r: any) => r.questions).filter(Boolean)
  } else {
    const { data } = await db
      .from("questions")
      .select("*, choices(*), matching_pairs(*), ordering_items(*)")
      .eq("exam_id", examId)
      .order("order_index")
    questions = data
  }

  if (!questions?.length) throw new Error("No questions found")

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
          const result = await scoreOpenEndedAnswer(question.text, guide, answerText, question.score)
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
          scoreAchieved = (selected.score != null && selected.score > 0)
            ? Math.min(selected.score, question.score)
            : selected.is_correct ? question.score : 0
        }
      }
    } else if (question.type === "mcq_multi") {
      answerJson = rawAnswer
      const selectedIds: string[] = rawAnswer?.choice_ids ?? []
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
      scoreAchieved = items.length > 0 ? (correct / items.length) * question.score : 0
    } else if (question.type === "matching") {
      answerJson = rawAnswer
      const submittedPairs: { left_id: string; right_id: string }[] = rawAnswer?.pairs ?? []
      const correctPairs = question.matching_pairs ?? []
      const pairMap = new Map(correctPairs.map((p: any) => [p.id, p.right_item]))
      let correctCount = 0
      submittedPairs.forEach((p) => {
        const expectedRight  = pairMap.get(p.left_id)
        const submittedRight = correctPairs.find((cp: any) => cp.id === p.right_id)?.right_item
        if (expectedRight && expectedRight === submittedRight) correctCount++
      })
      scoreAchieved = correctPairs.length > 0 ? (correctCount / correctPairs.length) * question.score : 0
    }

    totalScore += scoreAchieved
    answerRows.push({
      candidate_id: candidateId,
      question_id: question.id,
      answer_text: answerText,
      answer_json: answerJson,
      score_achieved: Math.round(scoreAchieved * 100) / 100,
      ai_justification: aiJustification,
    })
  }

  const totalPossible = questions.reduce((sum: number, q: any) => sum + q.score, 0)
  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0
  const passed = percentage >= (examRow?.passing_score ?? 60)

  await db.from("candidate_answers").insert(answerRows)
  await db
    .from("candidates")
    .update({
      submitted_at: new Date().toISOString(),
      total_score: Math.round(percentage * 100) / 100,
      passed,
    })
    .eq("id", candidateId)

  return { total_score: percentage, passed }
}
