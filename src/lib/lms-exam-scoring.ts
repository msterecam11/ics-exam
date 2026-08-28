// Server-side mirror of the OBJECTIVE grading rules in
// FinalExamPlayer.tsx's score() (client-side, used at submission time).
// Kept in one place so the recalculation route can re-grade a stored
// attempt against a CURRENT (possibly corrected) answer key without
// duplicating — and risking drifting from — the original logic.
//
// Deliberately excludes open_ended: those are AI-rubric-graded once at
// submission time and stored in ai_feedback.open_ended_scores. A wrong
// MCQ/ordering/matching KEY is what this tool fixes; an open-ended
// question has no "key" to be wrong, so its stored score is reused as-is
// rather than re-run (re-running AI grading on every recalculation would
// be slow, costly, and isn't what a key fix is correcting anyway).

interface MCQOption { id: string; text: string; correct: boolean }
interface OrderItem { id: string; text: string }
interface MatchPair { id: string; left: string; right: string }

export interface ExamQuestion {
  id: string
  type: "mcq_single" | "mcq_multiple" | "ordering" | "match_pair" | "open_ended"
  points: number
  options?: MCQOption[]
  items?: OrderItem[]
  pairs?: MatchPair[]
  rightPool?: string[] // client-safe, unlinked right-side pool (see sanitizeQuestionsForClient)
}

type AnswerMap = Record<string, string | string[] | Record<string, string>>

export function scoreObjectiveQuestion(q: ExamQuestion, ans: unknown): number {
  if (q.type === "mcq_single" && q.options) {
    const correctId = q.options.find((o) => o.correct)?.id
    const given = Array.isArray(ans) ? ans[0] : (ans as string)
    return correctId && given === correctId ? q.points : 0
  }
  if (q.type === "mcq_multiple" && q.options) {
    const corrIds = q.options.filter((o) => o.correct).map((o) => o.id)
    const sel = (Array.isArray(ans) ? ans : []) as string[]
    return corrIds.length > 0 && sel.length === corrIds.length && corrIds.every((id) => sel.includes(id)) ? q.points : 0
  }
  if (q.type === "ordering" && q.items) {
    const correct = q.items.map((i) => i.id)
    const given = (Array.isArray(ans) ? ans : []) as string[]
    const ok = correct.filter((id, i) => id === given[i]).length
    return given.length > 0 ? Math.round((ok / correct.length) * q.points) : 0
  }
  if (q.type === "match_pair" && q.pairs) {
    const given = (typeof ans === "object" && ans && !Array.isArray(ans) ? ans : {}) as Record<string, string>
    const ok = q.pairs.filter((p) => given[p.id] === p.right).length
    return Math.round((ok / q.pairs.length) * q.points)
  }
  return 0 // open_ended, or a question type/shape mismatch — handled by the caller
}

// Fisher-Yates — used to make the client's initial payload order-independent
// of the answer key (see sanitizeQuestionsForClient below).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Strips every field that would let a student read the answer key straight
// out of the page's initial data (View Source / devtools / RSC payload),
// before it's ever sent to FinalExamPlayer. Grading always happens against
// the REAL `module.questions` server-side (see exam-attempt/route.ts) — the
// client only ever sees this sanitized shape.
export function sanitizeQuestionsForClient(questions: ExamQuestion[]): ExamQuestion[] {
  return questions.map((q) => {
    if ((q.type === "mcq_single" || q.type === "mcq_multiple") && q.options) {
      return { ...q, options: q.options.map(({ id, text }) => ({ id, text, correct: false })) }
    }
    if (q.type === "ordering" && q.items) {
      // Shuffle display order — ids/text are unchanged so grading (which
      // compares submitted id order to the ORIGINAL array order) still
      // works, but the initial payload no longer IS the answer key.
      return { ...q, items: shuffle(q.items) }
    }
    if (q.type === "match_pair" && q.pairs) {
      // Never send a left/right pair pre-matched — that pairing IS the
      // answer key. Send left items with their `right` blanked out, plus
      // an unlinked, shuffled pool of right-side text for the picker.
      const rightPool = shuffle(q.pairs.map((p) => p.right))
      return { ...q, pairs: q.pairs.map((p) => ({ ...p, right: "" })), rightPool }
    }
    return q
  })
}

// Re-grades one attempt's stored raw `answers` against the CURRENT
// `questions` (the possibly-just-corrected key). `openEndedEarned` is the
// sum of the attempt's already-stored AI scores for its open_ended
// questions — reused, not recomputed.
export function recalculateAttemptScore(
  questions: ExamQuestion[],
  answers: AnswerMap,
  openEndedEarned: number
): { score: number; maxScore: number; pct: number } {
  let maxScore = 0
  let objectiveEarned = 0

  for (const q of questions) {
    maxScore += q.points
    if (q.type === "open_ended") continue
    objectiveEarned += scoreObjectiveQuestion(q, answers[q.id])
  }

  const score = objectiveEarned + openEndedEarned
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  return { score, maxScore, pct }
}
