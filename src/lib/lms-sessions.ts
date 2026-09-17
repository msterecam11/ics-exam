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

export const ATTEND_STATUSES = ["present", "late", "absent", "excused"] as const
export type AttendStatus = typeof ATTEND_STATUSES[number]

export type SessionScope = { id?: string; course_id: string; program_id: string | null; track_id: string | null }

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

  if (session.program_id) {
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
}

/** True if this session is one the enrollment's student attends. */
export function sessionIsFor(session: SessionScope, viewer: SessionViewer): boolean {
  if (session.course_id !== viewer.course_id) return false
  if (!viewer.program_id) return session.program_id === null
  if (session.program_id !== viewer.program_id) return false
  return session.track_id === null || session.track_id === viewer.track_id
}

/**
 * Sessions for a set of enrollments (each with its program and track). One
 * query by course, then filtered — a student sees only their own program's
 * (and track's) sessions, never another group's.
 */
export async function sessionsForViewers<T = any>(
  viewers: SessionViewer[],
  columns: string,
  build?: (q: any) => any,
): Promise<T[]> {
  const courseIds = [...new Set(viewers.map(v => v.course_id))]
  if (!courseIds.length) return []
  let q = db.from("lms_sessions").select(`${columns}, course_id, program_id, track_id`).in("course_id", courseIds)
  if (build) q = build(q)
  const { data, error } = await q
  if (error) throw new Error("Could not load sessions")
  return ((data ?? []) as any[]).filter(s => viewers.some(v => sessionIsFor(s, v))) as T[]
}

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
  const sessions = await sessionsForViewers<{ id: string }>([viewer], "id", q => q.lte("session_date", today))
  if (!sessions.length) return { sessionTotal: 0, presentCount: 0, excusedCount: 0, attendancePct: null }
  const { data } = await db
    .from("lms_attendance")
    .select("session_id, status")
    .eq("student_id", viewer.student_id)
    .in("session_id", sessions.map(s => s.id))
  const rows = (data ?? []) as any[]
  const presentCount = rows.filter(r => r.status === "present" || r.status === "late").length
  const excusedCount = rows.filter(r => r.status === "excused").length
  const counted = sessions.length - excusedCount
  return {
    sessionTotal: sessions.length,
    presentCount,
    excusedCount,
    attendancePct: counted > 0 ? Math.round((presentCount / counted) * 100) : null,
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
