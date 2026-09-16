// Scoring for the scored items inside a package ("quiz" and "exam" / Knowledge
// Test). Pure functions, safe to import from both server and client code.
//
// Until this existed the student's BROWSER graded these items and posted the
// result ({ score, max, pct, passed }) to /api/lms/packages/[id]/progress, which
// stored it. The answer key was in the page, and the posted score was believed.
// Now the browser posts only the answers; the server grades them against the
// stored item, and the key is removed from what the student's page receives.

export type PkgQuestion = {
  id: string
  type: "mcq_single" | "mcq_multiple" | "open_ended" | "ordering" | "match_pair"
  text: string
  points: number
  options?: { id: string; text: string; is_correct?: boolean }[]
  items?:   { id: string; text: string }[]
  pairs?:   { id: string; left: string; right: string }[]
  explanation?:  string
  model_answer?: string
}

export type PkgItemScore = {
  score: number; max: number; pct: number; passed: boolean
  attempts?: number
  ai?: Record<string, { score: number; justification: string }>
}

export const SCORED_ITEM_TYPES = ["quiz", "exam"] as const
export const isScoredItemType = (t: unknown) => t === "quiz" || t === "exam"

/** Objective questions only; open_ended contributes to max but earns 0 here. */
export function scoreQuestions(questions: PkgQuestion[], answers: Record<string, any>) {
  let earned = 0, max = 0
  for (const q of questions) {
    const pts = Number(q.points) || 0
    max += pts
    const a = answers?.[q.id]
    if (q.type === "mcq_single") {
      const correct = q.options?.find(o => o.is_correct)?.id
      if (a && a === correct) earned += pts
    } else if (q.type === "mcq_multiple") {
      const sel = new Set(Array.isArray(a) ? a : [])
      const cor = new Set(q.options?.filter(o => o.is_correct).map(o => o.id) ?? [])
      if (cor.size > 0 && sel.size === cor.size && [...cor].every(id => sel.has(id))) earned += pts
    } else if (q.type === "ordering") {
      const studentOrder = Array.isArray(a) ? a : []
      const correctOrder = (q.items ?? []).map(it => it.id)
      if (correctOrder.length > 0 && correctOrder.length === studentOrder.length &&
          correctOrder.every((id, i) => studentOrder[i] === id)) earned += pts
    } else if (q.type === "match_pair") {
      const studentMap = a && typeof a === "object" && !Array.isArray(a) ? a : {}
      const pairs = q.pairs ?? []
      if (pairs.length > 0 && pairs.every(p => studentMap[p.id] === p.right)) earned += pts
    }
  }
  return { score: earned, max, pct: max > 0 ? Math.round((earned / max) * 100) : 0 }
}

export function itemMaxAttempts(item: { type: string; config?: any }): number {
  const n = Number(item.config?.max_attempts)
  return Number.isInteger(n) && n > 0 ? n : (item.type === "exam" ? 1 : 3)
}

export function itemPassMark(item: { type: string; config?: any }, packagePassMark: number): number {
  // Quizzes are completion-only: submitting always counts as passed.
  if (item.type !== "exam") return 0
  const n = Number(item.config?.pass_mark)
  return Number.isFinite(n) ? n : packagePassMark
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * The config a STUDENT's page receives for a quiz/exam item: no correct-choice
 * flags, ordering items in random order (their stored order IS the answer),
 * match pairs without their right-hand side (offered separately, shuffled),
 * and no model answers or explanations. The full questions come back from the
 * server with the graded result, for the review screen.
 */
export function stripAnswerKey(config: any): any {
  const questions: PkgQuestion[] = Array.isArray(config?.questions) ? config.questions : []
  return {
    ...config,
    questions: questions.map(q => {
      const { explanation, model_answer, ...rest } = q
      return {
        ...rest,
        options: q.options?.map(({ id, text }) => ({ id, text })),
        items:   q.items ? shuffled(q.items) : undefined,
        pairs:   q.pairs?.map(({ id, left }) => ({ id, left, right: "" })),
        right_options: q.pairs ? shuffled(q.pairs.map(p => p.right)) : undefined,
      }
    }),
    answer_key_hidden: true,
  }
}
