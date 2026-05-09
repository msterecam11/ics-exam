import { db } from "@/lib/db"

// Recalculates scores for all submitted candidates in an exam.
// Called automatically after any question config change.
// - MCQ / ordering / matching: fully recalculated from current config
// - open_ended: proportionally scaled if max score changed; AI justification kept
// prevScores: map of questionId → old max score, used to scale open_ended answers proportionally
export async function recalculateExamScores(examId: string, prevScores?: Record<string, number>): Promise<void> {
  // Get all submitted candidates
  const { data: candidates } = await db
    .from("candidates")
    .select("id")
    .eq("exam_id", examId)
    .not("submitted_at", "is", null)

  if (!candidates?.length) return

  // Get all questions with their current config
  const { data: questions } = await db
    .from("questions")
    .select("*, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("exam_id", examId)

  if (!questions?.length) return

  const totalPossible = questions.reduce((s, q) => s + q.score, 0)

  for (const candidate of candidates) {
    const { data: answers } = await db
      .from("candidate_answers")
      .select("*")
      .eq("candidate_id", candidate.id)

    if (!answers?.length) continue

    let totalEarned = 0

    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.question_id)
      if (!question) continue

      let newScore = 0

      if (question.type === "open_ended") {
        // Scale proportionally using the old max if available, otherwise keep as-is (clamped)
        const oldMax = prevScores?.[question.id] ?? question.score
        const ratio = oldMax > 0 ? (answer.score_achieved ?? 0) / oldMax : 0
        newScore = Math.min(ratio * question.score, question.score)
      } else if (question.type === "mcq_single") {
        const selectedId = answer.answer_json?.choice_id
        if (selectedId) {
          const selected = question.choices?.find((c: any) => c.id === selectedId)
          if (selected) {
            newScore = (selected.score != null && selected.score > 0)
              ? Math.min(selected.score, question.score)
              : selected.is_correct ? question.score : 0
          }
        }
      } else if (question.type === "mcq_multi") {
        const selectedIds: string[] = answer.answer_json?.choice_ids ?? []
        let partial = 0
        for (const choice of question.choices ?? []) {
          if (selectedIds.includes(choice.id)) {
            partial += choice.is_correct ? (choice.score || 0) : -(choice.score || 0)
          }
        }
        newScore = Math.max(0, Math.min(partial, question.score))
      } else if (question.type === "ordering") {
        const submittedOrder: string[] = answer.answer_json?.order ?? []
        const items = question.ordering_items ?? []
        let correct = 0
        items.forEach((item: any) => {
          if (submittedOrder.indexOf(item.id) === item.correct_position) correct++
        })
        newScore = items.length > 0 ? (correct / items.length) * question.score : 0
      } else if (question.type === "matching") {
        const submittedPairs: { left_id: string; right_id: string }[] = answer.answer_json?.pairs ?? []
        const correctPairs = question.matching_pairs ?? []
        const pairMap = new Map(correctPairs.map((p: any) => [p.id, p.right_item]))
        let correctCount = 0
        submittedPairs.forEach((p) => {
          const expectedRight = pairMap.get(p.left_id)
          const submittedRight = correctPairs.find((cp: any) => cp.id === p.right_id)?.right_item
          if (expectedRight && expectedRight === submittedRight) correctCount++
        })
        newScore = correctPairs.length > 0 ? (correctCount / correctPairs.length) * question.score : 0
      }

      newScore = Math.round(newScore * 100) / 100
      totalEarned += newScore

      await db
        .from("candidate_answers")
        .update({ score_achieved: newScore })
        .eq("id", answer.id)
    }

    // Recalculate total percentage
    const percentage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0

    // Get passing score
    const { data: exam } = await db
      .from("exams")
      .select("passing_score")
      .eq("id", examId)
      .single()

    const passed = percentage >= (exam?.passing_score ?? 60)

    await db
      .from("candidates")
      .update({
        total_score: Math.round(percentage * 100) / 100,
        passed,
      })
      .eq("id", candidate.id)
  }
}
