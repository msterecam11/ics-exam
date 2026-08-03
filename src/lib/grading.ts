// Letter grades for manual (client-facing) reports.
//
// ONE definition, imported everywhere. This previously lived as six separate
// copies across the admin and print report pages; they happened to agree, but
// nothing kept them agreeing, and a threshold change meant editing six files
// and hoping none was missed.
//
// The colours belong to the LETTER, not to the percentage. A percentage has
// its own colour ladder (scoreColor, used in Original mode) with different
// boundaries — reading the letter from one ladder and its colour from the
// other is what produced grades like a "B" rendered in green.

export type GradeLetter = "A" | "B" | "C" | "D"

export interface Grade {
  letter: GradeLetter
  /** Text colour for the letter itself. */
  text: string
  /** Background + border for chips and badges. */
  bg: string
  border: string
}

/** Inclusive lower bounds, highest first. A=90-100, B=80-89.99, C=70-79.99, D=<70. */
export const GRADE_BANDS: { min: number; grade: Grade }[] = [
  { min: 90, grade: { letter: "A", text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" } },
  { min: 80, grade: { letter: "B", text: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" } },
  { min: 70, grade: { letter: "C", text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" } },
  { min: 0,  grade: { letter: "D", text: "#ef4444", bg: "#fee2e2", border: "#fca5a5" } },
]

export function letterGrade(pct: number): Grade {
  const safe = Number.isFinite(pct) ? pct : 0
  return (GRADE_BANDS.find(b => safe >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]).grade
}

/** "A (90-100%)" — for legends and report keys. */
export const GRADE_LEGEND: { letter: GradeLetter; range: string; text: string }[] = [
  { letter: "A", range: "90-100%", text: "#10b981" },
  { letter: "B", range: "80-89%",  text: "#2563eb" },
  { letter: "C", range: "70-79%",  text: "#f59e0b" },
  { letter: "D", range: "Below 70%", text: "#ef4444" },
]
