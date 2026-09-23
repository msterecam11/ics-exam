import { db } from "@/lib/db"

// ── Class sessions & attendance ─────────────────────────────────────────
//
// A session belongs to a program (optionally one track) and one of the
// program's courses. Its roster is the program's members in that track (or
// all tracks) who take the course in that program. Attendance is marked by
// staff and counts towards the student's enrollment.
//
// Sessions without a program are from before Program Manager; their roster is
// the course's enrollments outside any program.
//
// A GROUP session (onsite, Phase 2) is one day of a scheduled delivery. Its
// roster is simply the enrolments placed in that group — whichever program (or
// none) each participant came through.

export const ATTEND_STATUSES = ["present", "late", "absent", "excused"] as const
export type AttendStatus = typeof ATTEND_STATUSES[number]

export type SessionScope = { id?: string; course_id: string; program_id: string | null; track_id: string | null; group_id?: string | null }

export type RosterEntry = {
  student_id: string
  enrollment_id: string | null
  name: string
  email: string
  company: string | null
  /** false for someone who has a record but is no longer on the roster (withdrawn, moved track) */
  on_roster: boolean
}

/**
 * Students expected at a session. Withdrawn members and withdrawn course
 * enrollments are not on the roster; anyone who already has an attendance
 * record for the session is still listed (so history never disappears).
 */
export async function sessionRoster(session: SessionScope & { id: string }, opts?: { activeOnly?: boolean }): Promise<RosterEntry[]> {
  const out = new Map<string, RosterEntry>()
  // activeOnly: people still taking the course (for reminders) — no completed
  // enrollments, and nobody listed only because of an old attendance record.
  const statuses = opts?.activeOnly ? ["active"] : ["active", "completed"]

  if (session.group_id) {
    const { data, error } = await db
      .from("lms_enrollments")
      .select("id, student_id, lms_students(id, name, email, company)")
      .eq("group_id", session.group_id)
      .in("status", statuses)
    if (error) throw new Error("Could not load the session roster")
    for (const e of (data ?? []) as any[]) {
      const s = e.lms_students
      if (s) out.set(s.id, { student_id: s.id, enrollment_id: e.id, name: s.name, email: s.email, company: s.company, on_roster: true })
    }
  } else if (session.program_id) {
    let q = db
      .from("lms_enrollments")
      .select("id, student_id, status, lms_program_members!inner(status, track_id), lms_students(id, name, email, company)")
      .eq("program_id", session.program_id)
      .eq("course_id", session.course_id)
      .in("status", statuses)
      .neq("lms_program_members.status", "withdrawn")
    if (session.track_id) q = q.eq("lms_program_members.track_id", session.track_id)
    const { data, error } = await q
    if (error) throw new Error("Could not load the session roster")
    for (const e of (data ?? []) as any[]) {
      const s = e.lms_students
      if (s) out.set(s.id, { student_id: s.id, enrollment_id: e.id, name: s.name, email: s.email, company: s.company, on_roster: true })
    }
  } else {
    const { data, error } = await db
      .from("lms_enrollments")
      .select("id, student_id, lms_students(id, name, email, company)")
      .eq("course_id", session.course_id)
      .is("program_id", null)
      .in("status", statuses)
    if (error) throw new Error("Could not load the session roster")
    for (const e of (data ?? []) as any[]) {
      const s = e.lms_students
      if (s) out.set(s.id, { student_id: s.id, enrollment_id: e.id, name: s.name, email: s.email, company: s.company, on_roster: true })
    }
  }

  if (opts?.activeOnly) return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))

  const { data: records } = await db
    .from("lms_attendance")
    .select("student_id, enrollment_id, lms_students(id, name, email, company)")
    .eq("session_id", session.id)
  for (const r of (records ?? []) as any[]) {
    const s = r.lms_students
    if (s && !out.has(s.id)) out.set(s.id, { student_id: s.id, enrollment_id: r.enrollment_id, name: s.name, email: s.email, company: s.company, on_roster: false })
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The student-side view of one enrollment, enough to pick its sessions. */
export type SessionViewer = {
  course_id: string
  program_id: string | null
  track_id: string | null
  /** The onsite group this enrolment is placed in, if any. */
  group_id?: string | null
}

/** True if this session is one the enrollment's student attends. */
export function sessionIsFor(session: SessionScope, viewer: SessionViewer): boolean {
  if (session.course_id !== viewer.course_id) return false
  // A group's days are for that group's participants only.
  if (session.group_id) return !!viewer.group_id && session.group_id === viewer.group_id
  if (!viewer.program_id) return session.program_id === null
  if (session.program_id !== viewer.program_id) return false
  return session.track_id === null || session.track_id === viewer.track_id
}

/**
 * Sessions for a set of enrollments (each with its program and track, or its
 * onsite group). One query by course, then filtered — a student sees only
 * their own program's (and track's) or group's sessions, never another's. A
 * group's days appear once the group is confirmed.
 */
export async function sessionsForViewers<T = any>(
  viewers: SessionViewer[],
  columns: string,
  build?: (q: any) => any,
): Promise<T[]> {
  const courseIds = [...new Set(viewers.map(v => v.course_id))]
  if (!courseIds.length) return []
  let q = db.from("lms_sessions")
    .select(`${columns}, course_id, program_id, track_id, group_id, session_group:lms_course_groups(status)`)
    .in("course_id", courseIds)
  if (build) q = build(q)
  const { data, error } = await q
  if (error) throw new Error("Could not load sessions")
  return ((data ?? []) as any[])
    .filter(s => !s.group_id || VISIBLE_GROUP_STATUSES.includes(s.session_group?.status))
    .filter(s => viewers.some(v => sessionIsFor(s, v))) as T[]
}

/** A group is shown to its participants only once it's confirmed. */
export const VISIBLE_GROUP_STATUSES = ["confirmed", "completed"]

/** Today's date (YYYY-MM-DD) in the institute's time zone (UTC+3). */
export function sessionToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
}

/**
 * Attendance summary for one enrollment (reports). Only sessions that have
 * taken place (today or earlier) count — a scheduled future session isn't an
 * absence. Excused sessions don't count against the student.
 */
export async function enrollmentAttendance(viewer: SessionViewer & { student_id: string }):
  Promise<{ sessionTotal: number; presentCount: number; excusedCount: number; attendancePct: number | null }> {
  const today = sessionToday()
  const sessions = await sessionsForViewers<{ id: string; duration_minutes: number; session_date: string; start_time: string; late_threshold: number }>([viewer], "id, duration_minutes, session_date, start_time, late_threshold", q => q.lte("session_date", today))
  if (!sessions.length) return { sessionTotal: 0, presentCount: 0, excusedCount: 0, attendancePct: null }
  const { data } = await db
    .from("lms_attendance")
    .select("session_id, status, check_in_at, check_out_at, minutes_attended")
    .eq("student_id", viewer.student_id)
    .in("session_id", sessions.map(s => s.id))
  const bySession = new Map(((data ?? []) as any[]).map(r => [r.session_id, r]))
  const rows = (data ?? []) as any[]
  const presentCount = rows.filter(r => r.status === "present" || r.status === "late").length
  const excusedCount = rows.filter(r => r.status === "excused").length
  // Partial days count partly (check-in/out, or minutes from a meeting report).
  let counted = 0, credit = 0
  for (const s of sessions) {
    const c = attendanceCredit(bySession.get(s.id), s)
    if (c === null) continue
    counted++; credit += c
  }
  return {
    sessionTotal: sessions.length,
    presentCount,
    excusedCount,
    attendancePct: counted > 0 ? Math.round((credit / counted) * 100) : null,
  }
}

/** End time "HH:MM" from a start time and duration. */
export function sessionEndTime(start: string | null | undefined, minutes: number | null | undefined): string | undefined {
  if (!start || !minutes) return undefined
  const [h, m] = String(start).split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined
  const total = h * 60 + m + Number(minutes)
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

// ── Time in the room ─────────────────────────────────────────────────────────
//
// Session dates and times are the institute's local time (UTC+3).

/** A session-local "HH:MM" on its date, as an instant. */
export function sessionInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm.slice(0, 5)}:00+03:00`)
}

/** "HH:MM" (institute time) of an instant. */
export function localHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16)
}

/** Late when they arrived after start + the session's late threshold. */
export function isLate(session: { session_date: string; start_time: string; late_threshold?: number | null }, arrived: Date): boolean {
  const start = sessionInstant(session.session_date, session.start_time)
  return arrived.getTime() > start.getTime() + (session.late_threshold ?? 15) * 60_000
}

export type AttendanceRecord = {
  status: string
  check_in_at?: string | null
  check_out_at?: string | null
  minutes_attended?: number | null
}

export type CreditSession = {
  duration_minutes: number
  session_date?: string | null
  start_time?: string | null
  late_threshold?: number | null
}

/**
 * How much of a session counts as attended, 0–1; null = not counted at all
 * (excused). Present or late is a full session unless we know better: the
 * minutes an online meeting report gave, or check-in to check-out in the room
 * — someone who left at noon of a 7-hour day gets about half.
 *
 * The same grace as for lateness applies at both ends: arriving within it of
 * the start, or leaving within it of the end, loses nothing. Only real late
 * arrivals and early departures cut the time.
 */
export function attendanceCredit(rec: AttendanceRecord | null | undefined, session: CreditSession | number): number | null {
  const s: CreditSession = typeof session === "number" ? { duration_minutes: session } : session
  if (!rec) return 0
  if (rec.status === "excused") return null
  if (rec.status !== "present" && rec.status !== "late") return 0
  const full = Math.max(1, s.duration_minutes || 60)
  const grace = s.late_threshold ?? 15
  if (rec.minutes_attended != null)
    return rec.minutes_attended >= full - grace ? 1 : Math.min(1, rec.minutes_attended / full)
  if (rec.check_in_at && rec.check_out_at) {
    let inAt = new Date(rec.check_in_at).getTime(), outAt = new Date(rec.check_out_at).getTime()
    if (s.session_date && s.start_time) {
      const start = sessionInstant(s.session_date, s.start_time).getTime(), end = start + full * 60_000
      if (inAt <= start + grace * 60_000) inAt = start
      if (outAt >= end - grace * 60_000) outAt = end
    }
    const m = (outAt - inAt) / 60_000
    return m > 0 ? Math.min(1, m / full) : 1
  }
  return 1
}
