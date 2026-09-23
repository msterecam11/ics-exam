// POST /api/lms/attendance/import — attendance for an ONLINE session from the
// meeting's own report (Teams or Zoom).
//
// multipart: session_id, file, apply ("1" to save; otherwise a preview)
//
// Each roster person found in the report (matched by email) gets their total
// minutes, first join and last leave; present, or late if they joined after
// start + the late threshold. Their attendance counts as the share of the
// session they were in. People not in the report are left as they are
// ("not marked" counts as absent). Emails in the report that match nobody on
// the roster are listed, never guessed.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { sessionRoster, isLate, attendanceCredit } from "@/lib/lms-sessions"
import { guardStaff, canTakeAttendance, forbidden } from "@/lib/staff-access"
import { decodeReport, parseMeetingReport } from "@/lib/lms-attendance-import"

export const dynamic = "force-dynamic"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return g.res
  const staff = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Expected a file upload" }, { status: 400 }) }
  const sessionId = String(form.get("session_id") ?? "")
  const file = form.get("file") as File | null
  const apply = form.get("apply") === "1"
  if (!UUID_RE.test(sessionId)) return NextResponse.json({ error: "session_id required" }, { status: 400 })
  if (!file || typeof file === "string" || !file.size) return NextResponse.json({ error: "Choose the report file" }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "That file is too large for an attendance report" }, { status: 413 })

  const { data: sess } = await db.from("lms_sessions")
    .select("id, title, session_date, start_time, duration_minutes, late_threshold, course_id, program_id, track_id, group_id")
    .eq("id", sessionId).maybeSingle()
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (!canTakeAttendance(g.scope, sess as any)) return forbidden()
  const s = sess as any

  let people
  try { people = parseMeetingReport(decodeReport(await file.arrayBuffer())) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? "Could not read the report" }, { status: 400 }) }

  const roster = await sessionRoster(s)
  const byEmail = new Map(roster.map(r => [r.email.trim().toLowerCase(), r]))
  const matched = people.filter(p => byEmail.has(p.email)).map(p => {
    const r = byEmail.get(p.email)!
    const status = p.firstJoin && isLate(s, p.firstJoin) ? "late" : "present"
    const credit = attendanceCredit({ status, minutes_attended: p.minutes }, s) ?? 0
    return { student_id: r.student_id, enrollment_id: r.enrollment_id, name: r.name, email: p.email, minutes: p.minutes, first_join: p.firstJoin?.toISOString() ?? null, last_leave: p.lastLeave?.toISOString() ?? null, status, credit_pct: Math.round(credit * 100) }
  })
  const unmatched = people.filter(p => !byEmail.has(p.email)).map(p => ({ email: p.email, name: p.name, minutes: p.minutes }))
  const matchedIds = new Set(matched.map(m => m.student_id))
  const missing = roster.filter(r => r.on_roster && !matchedIds.has(r.student_id)).map(r => ({ student_id: r.student_id, name: r.name, email: r.email }))

  if (!apply) return NextResponse.json({ preview: true, duration_minutes: s.duration_minutes, matched, unmatched, missing })

  if (matched.length) {
    const now = new Date().toISOString()
    const { error } = await db.from("lms_attendance").upsert(matched.map(m => ({
      session_id: sessionId, student_id: m.student_id, enrollment_id: m.enrollment_id,
      status: m.status, minutes_attended: m.minutes,
      check_in_at: m.first_join, check_out_at: m.last_leave,
      scanned_at: now, manual_override: true, override_by: staff.user.id, excuse_note: null, source: "import",
    })), { onConflict: "session_id,student_id" })
    if (error) return NextResponse.json({ error: "Could not save attendance" }, { status: 500 })
  }
  await auditLog(staff, "lms.attendance.import", "lms_session", sessionId, s.title, { matched: matched.length, unmatched: unmatched.length, file: file.name })
  return NextResponse.json({ applied: true, matched: matched.length, unmatched, missing })
}
