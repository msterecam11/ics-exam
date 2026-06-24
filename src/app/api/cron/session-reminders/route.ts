/**
 * GET /api/cron/session-reminders
 *
 * Sends email reminders for sessions happening tomorrow.
 * Secured by CRON_SECRET env var sent as x-cron-secret header.
 *
 * Render cron job setup (Render dashboard → Cron Jobs → New Cron Job):
 *   Command : curl -H "x-cron-secret: $CRON_SECRET" https://your-app.onrender.com/api/cron/session-reminders
 *   Schedule: 0 6 * * *   (runs daily at 06:00 UTC)
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail, buildSessionReminderEmail } from "@/lib/email"

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret")
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Tomorrow's date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  // Sessions scheduled for tomorrow that are still open
  const { data: sessions, error } = await db
    .from("lms_sessions")
    .select("id, title, session_date, start_time, duration_minutes, location, course_id, lms_courses(id, title)")
    .eq("session_date", tomorrowStr)
    .is("closed_at", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sessions?.length) return NextResponse.json({ ok: true, sent: 0, reason: "No sessions tomorrow" })

  let totalSent = 0, totalSkipped = 0

  for (const session of sessions) {
    const course = (session as any).lms_courses
    if (!course) continue

    // Compute end time from start_time + duration_minutes
    let endTime: string | undefined
    if (session.start_time && session.duration_minutes) {
      const [h, m] = session.start_time.split(":").map(Number)
      const endMin = h * 60 + m + session.duration_minutes
      endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
    }

    // All active enrollments for this course
    const { data: enrollments } = await db
      .from("lms_enrollments")
      .select("student_id, lms_students(id, name, email)")
      .eq("course_id", session.course_id)
      .eq("status", "active")

    for (const enr of enrollments ?? []) {
      const student = (enr as any).lms_students
      if (!student?.email) { totalSkipped++; continue }

      // Skip if already sent for this session + student
      const { count: alreadySent } = await db
        .from("lms_email_log")
        .select("*", { count: "exact", head: true })
        .eq("type", "session_reminder")
        .eq("student_id", student.id)
        .eq("session_id", session.id)

      if ((alreadySent ?? 0) > 0) { totalSkipped++; continue }

      const { subject, html } = buildSessionReminderEmail({
        studentName:  student.name,
        sessionTitle: session.title,
        courseTitle:  course.title,
        sessionDate:  session.session_date,
        startTime:    session.start_time?.slice(0, 5) ?? "",
        endTime,
        location:     session.location ?? undefined,
        sessionId:    session.id,
      })

      await sendEmail({
        type:      "session_reminder",
        to:        student.email,
        subject,
        html,
        studentId: student.id,
        courseId:  session.course_id,
        sessionId: session.id,
      })

      totalSent++
    }
  }

  return NextResponse.json({ ok: true, date: tomorrowStr, sent: totalSent, skipped: totalSkipped, sessions: sessions.length })
}
