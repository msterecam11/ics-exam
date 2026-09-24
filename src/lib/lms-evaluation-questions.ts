// The evaluation and impact questions. Browser-safe (no database), so the
// participant's forms and the staff screens share one wording.

export const MODULE_CRITERIA = [
  { key: "relevance", label: "Relevant to my job" },
  { key: "clarity", label: "Clear and well organised" },
  { key: "materials", label: "Useful materials" },
] as const
export const INSTRUCTOR_CRITERIA = [
  { key: "knowledge", label: "Knows the subject" },
  { key: "clarity", label: "Explains clearly" },
  { key: "engagement", label: "Keeps the group involved" },
  { key: "time", label: "Manages the time well" },
] as const

/** Rated 1–5 (strongly disagree … strongly agree). */
export const IMPACT_RATINGS = [
  { key: "applied", label: "I have used what I learned in my daily work", scored: true },
  { key: "performance", label: "The course improved how I do my job", scored: true },
  { key: "worth", label: "The course was worth the time away from work", scored: true },
  { key: "support", label: "My manager supported me in applying what I learned", scored: false },
] as const
export const IMPACT_TEXTS = [
  { key: "example", label: "An example of how you used it (optional)" },
  { key: "barriers", label: "What stopped you applying it, if anything (optional)" },
] as const

export type SubjectType = "module" | "instructor"
export type EvalSubject = { type: SubjectType; id: string; title: string; done: boolean }

export const criteriaFor = (t: SubjectType) => (t === "module" ? MODULE_CRITERIA : INSTRUCTOR_CRITERIA)

/** 1–5 ratings → 0–100, over the questions that measure impact. */
export function impactScore(ratings: Record<string, number>): number | null {
  const vals = IMPACT_RATINGS.filter(q => q.scored).map(q => ratings[q.key]).filter(v => typeof v === "number")
  if (!vals.length) return null
  return Math.round(((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100)
}
