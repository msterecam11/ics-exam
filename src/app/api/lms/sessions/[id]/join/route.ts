// GET /api/lms/sessions/[id]/join — the participant's "Join" button for an
// online session: records that they joined through the LMS, then sends them
// to the meeting. (Proof they tried to join; the meeting report import says
// how long they stayed.)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { sessionIsFor, VISIBLE_GROUP_STATUSES } from "@/lib/lms-sessions"
import { staffSession } from "@/lib/staff-access"

export const dynamic = "force-dynamic"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data } = await db.from("lms_sessions")
    .select("id, meeting_link, course_id, program_id, track_id, group_id, session_group:lms_course_groups(status)")
    .eq("id", id).maybeSingle()
  const s = data as any
  if (!s?.meeting_link || !/^https?:\/\//i.test(s.meeting_link)) return NextResponse.json({ error: "This session has no meeting link" }, { status: 404 })

  const student = await getStudentSession()
  if (!student) {
    // Staff testing the link go straight through, unrecorded.
    if (await staffSession()) return NextResponse.redirect(s.meeting_link)
    return NextResponse.redirect(new URL("/lms/login", req.url))
  }

  const enrollment = await getCurrentEnrollment(student.id, s.course_id)
  const groupOk = !s.group_id || VISIBLE_GROUP_STATUSES.includes(s.session_group?.status)
  if (!enrollment || enrollment.access === "none" || !groupOk || !sessionIsFor(s, {
    course_id: enrollment.course_id, program_id: enrollment.program_id,
    track_id: enrollment.member?.track_id ?? null, group_id: enrollment.group_id,
  })) return NextResponse.json({ error: "This session isn't one of yours" }, { status: 404 })

  if (!student.preview) await db.from("lms_session_joins").insert({ session_id: s.id, student_id: student.id })
  return NextResponse.redirect(s.meeting_link)
}
