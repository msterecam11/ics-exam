import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { sessionRoster, ATTEND_STATUSES, type AttendStatus } from "@/lib/lms-sessions"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadSession(id: string) {
  const { data } = await db
    .from("lms_sessions")
    .select(`id, title, session_date, start_time, duration_minutes, location, meeting_link, closed_at,
             topics_covered, instructor_notes, agenda, course_id, program_id, track_id, module_id,
             lms_courses(id, title), lms_programs(id, name, status), lms_program_tracks(id, name), lms_modules(id, title)`)
    .eq("id", id)
    .maybeSingle()
  return data as any
}

// GET /api/lms/attendance?session_id=xxx — the session and its roster with each student's status
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const sessionId = new URL(req.url).searchParams.get("session_id")
  if (!sessionId || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  const sess = await loadSession(sessionId)
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })

  let roster
  try { roster = await sessionRoster(sess) } catch { return NextResponse.json({ error: "Could not load the roster" }, { status: 500 }) }

  const { data: records } = await db
    .from("lms_attendance")
    .select("student_id, status, scanned_at, excuse_note, override_by")
    .eq("session_id", sessionId)
  const byStudent = new Map(((records ?? []) as any[]).map(r => [r.student_id, r]))
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
      module_title: sess.lms_modules?.title ?? null,
      is_open:      sess.closed_at === null,
    },
    students: roster.map(r => {
      const rec = byStudent.get(r.student_id)
      return {
        id: r.student_id, name: r.name, email: r.email, company: r.company,
        on_roster: r.on_roster,
        // No record = not marked yet (shown and counted as absent).
        status: (rec?.status ?? "absent") as AttendStatus,
        marked: !!rec,
        marked_at: rec?.scanned_at ?? null,
        marked_by: rec?.override_by ? (staffName.get(rec.override_by) ?? null) : null,
        excuse_note: rec?.excuse_note ?? null,
      }
    }),
  })
}

// POST — mark attendance (staff only)
// Body: { session_id, student_id, status: 'present'|'late'|'absent'|'excused', excuse_note? }
//   or  { session_id, student_ids: string[], status }   — mark several at once
export async function POST(req: Request) {
  const staff = await auth()
  if (!staff || !isMgr(staff.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { session_id, status, excuse_note } = body
  if (typeof session_id !== "string" || !UUID_RE.test(session_id)) return NextResponse.json({ error: "session_id required" }, { status: 400 })
  if (!ATTEND_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids : body.student_id ? [body.student_id] : []
  const studentIds = [...new Set(ids.filter(x => typeof x === "string" && UUID_RE.test(x)))]
  if (!studentIds.length) return NextResponse.json({ error: "Choose at least one student" }, { status: 400 })

  const sess = await loadSession(session_id)
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })

  // Only students who belong to this session can be marked. Nothing checked
  // this before: any student id could be written into any session's attendance.
  let roster
  try { roster = await sessionRoster(sess) } catch { return NextResponse.json({ error: "Could not load the roster" }, { status: 500 }) }
  const byStudent = new Map(roster.map(r => [r.student_id, r]))
  const notOnRoster = studentIds.filter(id => !byStudent.has(id))
  if (notOnRoster.length) return NextResponse.json({ error: "Some students are not part of this session" }, { status: 400 })

  const note = status === "excused" && typeof excuse_note === "string" && excuse_note.trim() ? excuse_note.trim().slice(0, 1000) : null
  const now = new Date().toISOString()
  const rows = studentIds.map(id => ({
    session_id,
    student_id:      id,
    enrollment_id:   byStudent.get(id)!.enrollment_id,
    status,
    scanned_at:      now,          // when it was marked
    manual_override: true,         // always staff-marked (self check-in was removed)
    override_by:     staff.user.id,
    excuse_note:     note,
  }))

  const { error } = await db.from("lms_attendance").upsert(rows, { onConflict: "session_id,student_id" })
  if (error) return NextResponse.json({ error: "Could not save attendance" }, { status: 500 })

  await auditLog(staff, "lms.attendance.mark", "lms_session", session_id, sess.title, { status, count: studentIds.length })
  return NextResponse.json({ ok: true, marked: studentIds.length })
}

// DELETE /api/lms/attendance?session_id=&student_id= — clear a mark (back to "not marked")
export async function DELETE(req: Request) {
  const staff = await auth()
  if (!staff || !isMgr(staff.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const sessionId = sp.get("session_id"), studentId = sp.get("student_id")
  if (!sessionId || !studentId || !UUID_RE.test(sessionId) || !UUID_RE.test(studentId))
    return NextResponse.json({ error: "session_id and student_id required" }, { status: 400 })

  const { error } = await db.from("lms_attendance").delete().eq("session_id", sessionId).eq("student_id", studentId)
  if (error) return NextResponse.json({ error: "Could not clear the mark" }, { status: 500 })
  await auditLog(staff, "lms.attendance.clear", "lms_session", sessionId, null, { student_id: studentId })
  return NextResponse.json({ ok: true })
}
