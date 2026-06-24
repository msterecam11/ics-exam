import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/attendance?session_id=xxx — list all attendance for a session (admin)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("session_id")
  if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  // First get all enrolled students for this session's course
  const { data: sess } = await db
    .from("lms_sessions")
    .select("course_id")
    .eq("id", sessionId)
    .single()

  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 })

  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("student_id, lms_students(id, name, email, company)")
    .eq("course_id", sess.course_id)
    .eq("status", "active")

  // Get attendance records
  const { data: attendance } = await db
    .from("lms_attendance")
    .select("student_id, status, scanned_at, manual_override")
    .eq("session_id", sessionId)

  const attMap = new Map(
    (attendance ?? []).map((a: any) => [a.student_id, a])
  )

  const students = (enrollments ?? []).map((e: any) => {
    const s   = e.lms_students
    const att = attMap.get(s.id)
    return {
      id:             s.id,
      name:           s.name,
      email:          s.email,
      company:        s.company,
      status:         att?.status         ?? "absent",
      scanned_at:     att?.scanned_at     ?? null,
      manual_override: att?.manual_override ?? false,
    }
  })

  return NextResponse.json(students)
}

// POST — mark/update attendance
// Body (admin):   { session_id, student_id, status: 'present'|'late'|'absent'|'excused', manual_override: true }
// Body (student): { session_id }  — uses lms_session cookie, auto-detects late
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { session_id, student_id: bodyStudentId, status: bodyStatus, manual_override, excuse_note } = body

  if (!session_id) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  // Fetch the live session
  const { data: lmsSession } = await db
    .from("lms_sessions")
    .select("id, course_id, start_time, late_threshold, closed_at, session_date")
    .eq("id", session_id)
    .single()

  if (!lmsSession) return NextResponse.json({ error: "Session not found" }, { status: 404 })

  // ── Admin path ───────────────────────────────────────────────
  if (bodyStudentId) {
    const adminSession = await auth()
    if (!adminSession || !isMgr(adminSession.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const status = bodyStatus ?? "present"
    const overrideBy = adminSession.user.id

    const { data, error } = await db
      .from("lms_attendance")
      .upsert({
        session_id,
        student_id:      bodyStudentId,
        status,
        scanned_at:      status !== "absent" ? new Date().toISOString() : null,
        manual_override: true,
        override_by:     overrideBy,
        excuse_note:     excuse_note || null,
      }, { onConflict: "session_id,student_id" })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Student self-check-in path ────────────────────────────────
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Session must be open
  if (lmsSession.closed_at)
    return NextResponse.json({ error: "This session is closed" }, { status: 409 })

  // Verify student is enrolled
  const { data: enr } = await db
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", lmsSession.course_id)
    .eq("status", "active")
    .single()

  if (!enr)
    return NextResponse.json({ error: "You are not enrolled in this course" }, { status: 403 })

  // Already checked in?
  const { data: existing } = await db
    .from("lms_attendance")
    .select("id, status")
    .eq("session_id", session_id)
    .eq("student_id", student.id)
    .single()

  if (existing && ["present", "late"].includes(existing.status))
    return NextResponse.json({ ok: true, status: existing.status, alreadyCheckedIn: true })

  // Determine late vs present
  const now       = new Date()
  const sessionDT = new Date(`${lmsSession.session_date}T${lmsSession.start_time}`)
  const diffMins  = (now.getTime() - sessionDT.getTime()) / 60000
  const status    = diffMins > (lmsSession.late_threshold ?? 15) ? "late" : "present"

  const { data, error } = await db
    .from("lms_attendance")
    .upsert({
      session_id,
      student_id:      student.id,
      status,
      scanned_at:      now.toISOString(),
      manual_override: false,
    }, { onConflict: "session_id,student_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status, data })
}
