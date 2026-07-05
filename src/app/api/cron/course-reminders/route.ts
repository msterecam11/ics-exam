/**
 * GET /api/cron/course-reminders
 *
 * Re-engagement nudge for SELF-PACED (online / hybrid) courses. Emails students
 * who are actively enrolled, not yet complete, and haven't made any progress in
 * the last INACTIVE_DAYS days — reminding them to continue. Capped to once every
 * INACTIVE_DAYS days per student per course so it nudges rather than spams.
 *
 * Unlike /api/cron/session-reminders (which is tied to scheduled live sessions),
 * this one is learner-driven and is what keeps online-course students moving.
 *
 * Secured by CRON_SECRET env var sent as x-cron-secret header.
 *
 * Render cron job setup (Render dashboard → Cron Jobs → New Cron Job):
 *   Command : curl -H "x-cron-secret: $CRON_SECRET" https://your-app.onrender.com/api/cron/course-reminders
 *   Schedule: 0 7 * * *   (runs daily at 07:00 UTC; the 2-day cap is enforced in code)
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { sendEmail, buildCourseReminderEmail } from "@/lib/email"

export const maxDuration = 60

// Days of inactivity before a nudge; also the minimum gap between nudges.
const INACTIVE_DAYS = 2
const DAY_MS = 86_400_000

export async function GET(req: Request) {
  // Allow EITHER the scheduled cron job (x-cron-secret header) OR a logged-in
  // admin/instructor (manual trigger). Mirrors /api/cron/session-reminders.
  const secret = req.headers.get("x-cron-secret")
  const validSecret = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  if (!validSecret) {
    const session = await auth().catch(() => null)
    const isMgr = !!session && (session.user.role === "admin" || session.user.role === "instructor")
    if (!isMgr) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now    = Date.now()
  const cutoff = new Date(now - INACTIVE_DAYS * DAY_MS).toISOString()

  // 1. Candidate enrollments: active, not yet complete, in a self-paced course.
  //    `!inner` + the delivery_mode filter drops onsite-only (classroom) courses.
  const { data: enrollments, error } = await db
    .from("lms_enrollments")
    .select("student_id, course_id, enrolled_at, progress_pct, lms_students(id, name, email), lms_courses!inner(id, title, delivery_mode)")
    .eq("status", "active")
    .or("progress_pct.is.null,progress_pct.lt.100")
    .in("lms_courses.delivery_mode", ["online", "hybrid"])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!enrollments?.length) return NextResponse.json({ ok: true, sent: 0, reason: "No self-paced enrollments in progress" })

  const rows = enrollments as any[]
  const studentIds = [...new Set(rows.map(r => r.student_id))]
  const courseIds  = [...new Set(rows.map(r => r.course_id))]

  // 2. Last activity per (student, course): newest of any progress/attempt event.
  const lastActivity = new Map<string, number>()
  const bump = (sid: string, cid: string, ts: string | null | undefined) => {
    if (!ts) return
    const k = `${sid}|${cid}`
    const t = new Date(ts).getTime()
    if (t > (lastActivity.get(k) ?? 0)) lastActivity.set(k, t)
  }

  const [prog, pkg, att] = await Promise.all([
    db.from("lms_progress").select("student_id, course_id, updated_at").in("student_id", studentIds).in("course_id", courseIds),
    db.from("lms_package_progress").select("student_id, course_id, updated_at").in("student_id", studentIds).in("course_id", courseIds),
    db.from("lms_module_attempts").select("student_id, course_id, submitted_at, started_at").in("student_id", studentIds).in("course_id", courseIds),
  ])
  for (const r of prog.data ?? []) bump(r.student_id, r.course_id, (r as any).updated_at)
  for (const r of pkg.data  ?? []) bump(r.student_id, r.course_id, (r as any).updated_at)
  for (const r of att.data  ?? []) bump(r.student_id, r.course_id, (r as any).submitted_at ?? (r as any).started_at)

  // 3. Frequency cap: who already got a course_reminder within the window.
  const { data: recent } = await db
    .from("lms_email_log")
    .select("student_id, course_id, sent_at")
    .eq("type", "course_reminder")
    .in("student_id", studentIds)
    .gte("sent_at", cutoff)
  const remindedRecently = new Set((recent ?? []).map((r: any) => `${r.student_id}|${r.course_id}`))

  let sent = 0, skipped = 0

  for (const r of rows) {
    const student = r.lms_students
    const course  = r.lms_courses
    const key = `${r.student_id}|${r.course_id}`

    if (!student?.email)          { skipped++; continue }  // no address on file
    if (remindedRecently.has(key)) { skipped++; continue }  // nudged within the window

    // Fall back to enrolled_at when the student has never done anything — that
    // still gives a 2-day grace period before the first nudge.
    const last = lastActivity.get(key) ?? new Date(r.enrolled_at).getTime()
    if (now - last < INACTIVE_DAYS * DAY_MS) { skipped++; continue }  // recently active

    const { subject, html } = buildCourseReminderEmail({
      studentName: student.name,
      courseTitle: course.title,
      courseId:    r.course_id,
      progressPct: Math.round(r.progress_pct ?? 0),
    })

    await sendEmail({
      type:      "course_reminder",
      to:        student.email,
      subject,
      html,
      studentId: student.id,
      courseId:  r.course_id,
    })
    sent++
  }

  return NextResponse.json({ ok: true, inactiveDays: INACTIVE_DAYS, candidates: rows.length, sent, skipped })
}
