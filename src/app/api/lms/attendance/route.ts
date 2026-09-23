import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import {
  sessionRoster, ATTEND_STATUSES, sessionInstant, isLate, localHHMM, attendanceCredit, type AttendStatus,
} from "@/lib/lms-sessions"
import { groupLabel } from "@/lib/lms-groups"
import { guardStaff, canTakeAttendance, forbidden } from "@/lib/staff-access"
import { checkCourseCompletion } from "@/lib/lms-completion"

// Attendance for one session (a program's class, or an onsite group's day).
// Who: admins, the program's instructors, and the group's instructors and
// facilitators.
//
// GET    ?session_id=                — the session and its roster with each person's record
// POST   { session_id, student_ids, status, excuse_note? }       mark a status
//        { session_id, student_ids, action: "check_in" | "check_out", at? }
//                                                              arrived / left (now, or "HH:MM")
//        { session_id, student_id, action: "times", check_in: "HH:MM"|null, check_out: "HH:MM"|null }
// DELETE ?session_id=&student_id=     — clear a record (back to "not marked")

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

async function loadSession(id: string) {
  const { data } = await db
    .from("lms_sessions")
    .select(`id, title, session_date, start_time, duration_minutes, late_threshold, location, meeting_link, closed_at,
             topics_covered, instructor_notes, agenda, course_id, program_id, track_id, group_id, module_id,
             lms_courses(id, title), lms_programs(id, name, status), lms_program_tracks(id, name), lms_modules(id, title),
             session_group:lms_course_groups(id, name, start_date, end_date, city)`)
    .eq("id", id)
    .maybeSingle()
  return data as any
}

export async function GET(req: Request) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return g.res

  const sessionId = new URL(req.url).searchParams.get("session_id")
  if (!sessionId || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  const sess = await loadSession(sessionId)
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (!canTakeAttendance(g.scope, sess)) return forbidden()

  let roster
  try { roster = await sessionRoster(sess) } catch { return NextResponse.json({ error: "Could not load the roster" }, { status: 500 }) }

  const [{ data: records }, { data: joins }] = await Promise.all([
    db.from("lms_attendance").select("student_id, status, scanned_at, excuse_note, override_by, check_in_at, check_out_at, minutes_attended, source").eq("session_id", sessionId),
    db.from("lms_session_joins").select("student_id, joined_at").eq("session_id", sessionId).order("joined_at"),
  ])
  const byStudent = new Map(((records ?? []) as any[]).map(r => [r.student_id, r]))
  const firstJoin = new Map<string, string>()
  for (const j of (joins ?? []) as any[]) if (!firstJoin.has(j.student_id)) firstJoin.set(j.student_id, j.joined_at)
  const staffIds = [...new Set(((records ?? []) as any[]).map(r => r.override_by).filter(Boolean))]
  const { data: staffRows } = staffIds.length
    ? await db.from("admin_users").select("id, name").in("id", staffIds)
    : { data: [] }
  const staffName = new Map(((staffRows ?? []) as any[]).map(s => [s.id, s.name]))

  return NextResponse.json({
    session: {
      ...sess,
      course_title: sess.lms_courses?.title ?? null,
      program_name: sess.lms_programs?.name ?? null,
      track_name:   sess.lms_program_tracks?.name ?? null,
      group_label:  sess.session_group ? groupLabel(sess.session_group) : null,
      module_title: sess.lms_modules?.title ?? null,
      is_open:      sess.closed_at === null,
      online:       !!sess.meeting_link,
      can_manage:   g.scope.role !== "facilitator",
    },
    students: roster.map(r => {
      const rec = byStudent.get(r.student_id)
      const credit = attendanceCredit(rec, sess)
      return {
        id: r.student_id, name: r.name, email: r.email, company: r.company,
        on_roster: r.on_roster,
        // No record = not marked yet (shown and counted as absent).
        status: (rec?.status ?? "absent") as AttendStatus,
        marked: !!rec,
        marked_at: rec?.scanned_at ?? null,
        marked_by: rec?.override_by ? (staffName.get(rec.override_by) ?? null) : null,
        excuse_note: rec?.excuse_note ?? null,
        check_in: localHHMM(rec?.check_in_at),
        check_out: localHHMM(rec?.check_out_at),
        minutes: rec?.minutes_attended ?? null,
        source: rec?.source ?? null,
        joined_at: firstJoin.get(r.student_id) ?? null,
        credit,
      }
    }),
  })
}

export async function POST(req: Request) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return g.res
  const staff = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { session_id, action } = body
  if (typeof session_id !== "string" || !UUID_RE.test(session_id)) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids : body.student_id ? [body.student_id] : []
  const studentIds = [...new Set(ids.filter(x => typeof x === "string" && UUID_RE.test(x)))]
  if (!studentIds.length) return NextResponse.json({ error: "Choose at least one person" }, { status: 400 })

  const sess = await loadSession(session_id)
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (!canTakeAttendance(g.scope, sess)) return forbidden()

  // Only people who belong to this session can be marked.
  let roster
  try { roster = await sessionRoster(sess) } catch { return NextResponse.json({ error: "Could not load the roster" }, { status: 500 }) }
  const byStudent = new Map(roster.map(r => [r.student_id, r]))
  if (studentIds.some(id => !byStudent.has(id))) return NextResponse.json({ error: "Some people are not part of this session" }, { status: 400 })

  const now = new Date()
  const { data: existingRows } = await db.from("lms_attendance")
    .select("student_id, status, check_in_at, check_out_at, excuse_note").eq("session_id", session_id).in("student_id", studentIds)
  const existing = new Map(((existingRows ?? []) as any[]).map(r => [r.student_id, r]))
  const base = (id: string) => ({
    session_id, student_id: id, enrollment_id: byStudent.get(id)!.enrollment_id,
    scanned_at: now.toISOString(), manual_override: true, override_by: staff.user.id, source: "manual",
  })
  const at = (hhmm: unknown): Date | null => {
    if (hhmm === undefined || hhmm === null || hhmm === "") return null
    if (typeof hhmm !== "string" || !HHMM_RE.test(hhmm)) return null
    return sessionInstant(sess.session_date, hhmm)
  }

  let rows: any[] = []
  if (action === "check_in") {
    // Arrived: now, or the time given. Late if after start + the late threshold.
    if (body.at !== undefined && !at(body.at)) return NextResponse.json({ error: "Times must look like 08:30" }, { status: 400 })
    const when = at(body.at) ?? now
    rows = studentIds.map(id => ({
      ...base(id), status: isLate(sess, when) ? "late" : "present",
      check_in_at: when.toISOString(), check_out_at: existing.get(id)?.check_out_at ?? null, minutes_attended: null, excuse_note: null,
    }))
  } else if (action === "check_out") {
    if (body.at !== undefined && !at(body.at)) return NextResponse.json({ error: "Times must look like 15:30" }, { status: 400 })
    const when = at(body.at) ?? now
    for (const id of studentIds) {
      const cur = existing.get(id)
      if (cur?.check_in_at && new Date(cur.check_in_at) > when)
        return NextResponse.json({ error: "Check-out can't be before check-in" }, { status: 400 })
    }
    rows = studentIds.map(id => {
      const cur = existing.get(id)
      const present = cur && (cur.status === "present" || cur.status === "late")
      return {
        ...base(id), status: present ? cur.status : "present",
        check_in_at: cur?.check_in_at ?? null, check_out_at: when.toISOString(), minutes_attended: null, excuse_note: null,
      }
    })
  } else if (action === "times") {
    if (studentIds.length !== 1) return NextResponse.json({ error: "One person at a time" }, { status: 400 })
    const inAt = at(body.check_in), outAt = at(body.check_out)
    if ((body.check_in && !inAt) || (body.check_out && !outAt)) return NextResponse.json({ error: "Times must look like 08:30" }, { status: 400 })
    if (inAt && outAt && outAt <= inAt) return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 })
    const id = studentIds[0]
    const cur = existing.get(id)
    const status = inAt ? (isLate(sess, inAt) ? "late" : "present")
      : (cur && (cur.status === "present" || cur.status === "late") ? cur.status : outAt ? "present" : cur?.status ?? "present")
    rows = [{ ...base(id), status, check_in_at: inAt?.toISOString() ?? null, check_out_at: outAt?.toISOString() ?? null, minutes_attended: null, excuse_note: null }]
  } else {
    const { status, excuse_note } = body
    if (!ATTEND_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    const note = status === "excused" && typeof excuse_note === "string" && excuse_note.trim() ? excuse_note.trim().slice(0, 1000) : null
    rows = studentIds.map(id => {
      const cur = existing.get(id)
      const keepTimes = status === "present" || status === "late"
      return {
        ...base(id), status, excuse_note: note,
        // Absent / excused: they weren't in the room, so no times.
        check_in_at: keepTimes ? cur?.check_in_at ?? null : null,
        check_out_at: keepTimes ? cur?.check_out_at ?? null : null,
        minutes_attended: null,
      }
    })
  }

  const { error } = await db.from("lms_attendance").upsert(rows, { onConflict: "session_id,student_id" })
  if (error) return NextResponse.json({ error: "Could not save attendance" }, { status: 500 })

  await auditLog(staff, `lms.attendance.${action ?? "mark"}`, "lms_session", session_id, sess.title, { status: rows[0]?.status, count: rows.length })
  await recheckCompletion(sess.course_id, rows.map(r => ({ student_id: r.student_id, enrollment_id: r.enrollment_id })))
  return NextResponse.json({ ok: true, marked: rows.length })
}

export async function DELETE(req: Request) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return g.res
  const staff = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const sp = new URL(req.url).searchParams
  const sessionId = sp.get("session_id"), studentId = sp.get("student_id")
  if (!sessionId || !studentId || !UUID_RE.test(sessionId) || !UUID_RE.test(studentId))
    return NextResponse.json({ error: "session_id and student_id required" }, { status: 400 })

  const sess = await loadSession(sessionId)
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (!canTakeAttendance(g.scope, sess)) return forbidden()

  const { error } = await db.from("lms_attendance").delete().eq("session_id", sessionId).eq("student_id", studentId)
  if (error) return NextResponse.json({ error: "Could not clear the mark" }, { status: 500 })
  await auditLog(staff, "lms.attendance.clear", "lms_session", sessionId, null, { student_id: studentId })
  return NextResponse.json({ ok: true })
}

// Attendance can be what completes a course under its pass rule (the rule
// waits until the last day has passed).
async function recheckCompletion(courseId: string, people: { student_id: string; enrollment_id: string | null }[]) {
  for (const p of people)
    if (p.enrollment_id) await checkCourseCompletion(p.student_id, courseId, p.enrollment_id).catch(() => {})
}
