// ── Report metrics, defined once (RP-11 … RP-14) ──────────────────────────
//
// Every report level (client, program, track, course, student) uses these, so
// the same number means the same thing wherever it appears.

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

/** RP-11 Completion rate: completed enrollments ÷ enrollments (withdrawn excluded). */
export function completionRate(enrollments: { status: string }[]): { completed: number; counted: number; rate: number | null } {
  const counted = enrollments.filter(e => e.status !== "dropped")
  const completed = counted.filter(e => e.status === "completed").length
  return { completed, counted: counted.length, rate: pct(completed, counted.length) }
}

/** RP-12 Pass rate: passed the final exam ÷ SAT the final exam. */
export function passRate(rows: { sat: boolean; passed: boolean }[]): { passed: number; sat: number; rate: number | null } {
  const sat = rows.filter(r => r.sat)
  const passed = sat.filter(r => r.passed).length
  return { passed, sat: sat.length, rate: pct(passed, sat.length) }
}

/** RP-13 Average score: average of each student's BEST exam attempt. */
export function averageScore(bestPcts: (number | null | undefined)[]): { sum: number; count: number; avg: number | null } {
  const vals = bestPcts.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  const sum = vals.reduce((a, b) => a + b, 0)
  return { sum, count: vals.length, avg: vals.length ? Math.round(sum / vals.length) : null }
}

export const INACTIVE_DAYS = 14
export const DEADLINE_WINDOW_DAYS = 14
const PACE_TOLERANCE = 10 // percentage points

const DAY = 86_400_000

/**
 * RP-14 At risk — any of:
 *  • no activity in 14 days
 *  • behind the expected pace with the deadline within 14 days
 *  • failed the final exam with one attempt left
 * Only for enrollments still in progress.
 */
export function atRiskReasons(f: {
  status: string
  progress: number
  lastActivity: string | null
  enrolledAt: string | null
  startDate: string | null
  endDate: string | null
  exam: { sat: boolean; passed: boolean; attempts: number; maxAttempts: number } | null
}, now = new Date()): string[] {
  if (f.status !== "active") return []
  const reasons: string[] = []
  const today = now.getTime()
  const start = f.startDate ? Date.parse(f.startDate + "T00:00:00Z") : f.enrolledAt ? Date.parse(f.enrolledAt) : null
  const started = start === null || start <= today

  const last = f.lastActivity ? Date.parse(f.lastActivity) : f.enrolledAt ? Date.parse(f.enrolledAt) : null
  if (started && last !== null && today - last > INACTIVE_DAYS * DAY) {
    reasons.push(f.lastActivity ? `No activity in ${Math.floor((today - last) / DAY)} days` : `Not started (${Math.floor((today - last) / DAY)} days)`)
  }

  if (f.endDate && start !== null) {
    const end = Date.parse(f.endDate + "T23:59:59Z")
    const daysLeft = Math.ceil((end - today) / DAY)
    if (daysLeft >= 0 && daysLeft <= DEADLINE_WINDOW_DAYS && end > start) {
      const expected = Math.min(100, Math.max(0, Math.round(((today - start) / (end - start)) * 100)))
      if (f.progress + PACE_TOLERANCE < expected)
        reasons.push(`Behind pace: ${Math.round(f.progress)}% done, ${expected}% expected, ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`)
    }
  }

  if (f.exam && f.exam.sat && !f.exam.passed && f.exam.maxAttempts - f.exam.attempts === 1) {
    reasons.push("Failed the exam, one attempt left")
  }
  return reasons
}
