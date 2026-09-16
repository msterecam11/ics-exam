// Server-side timing for LMS final exams.
//
// A session is opened when the student presses "Begin Exam"
// (POST /api/lms/exam-attempt/start) and claimed when they submit
// (POST /api/lms/exam-attempt). Elapsed time is therefore measured by the
// server, not reported by the browser, and the time limit is enforced here
// rather than only by a countdown the student controls.

// Slack between the browser's countdown hitting zero and the auto-submit
// reaching the server — network latency, a slow device, AI grading queuing.
// Generous on purpose: rejecting a genuine auto-submit would cost a student an
// attempt, which is far worse than tolerating two minutes.
export const EXAM_GRACE_S = 120

// Exams without a limit still get an upper bound on the time recorded, so a
// session left open for days can't inflate learning-time totals.
export const UNLIMITED_EXAM_CAP_S = 24 * 60 * 60

export function examTimeLimitS(activitySettings: unknown): number | null {
  const min = Number((activitySettings as any)?.time_limit_minutes)
  return Number.isFinite(min) && min > 0 ? Math.round(min * 60) : null
}

export function elapsedSince(startedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000))
}

/** True when a session can no longer be resumed or submitted in time. */
export function isSessionExpired(startedAt: string, limitS: number | null, now: Date = new Date()): boolean {
  if (limitS === null) return elapsedSince(startedAt, now) > UNLIMITED_EXAM_CAP_S
  return elapsedSince(startedAt, now) > limitS + EXAM_GRACE_S
}
