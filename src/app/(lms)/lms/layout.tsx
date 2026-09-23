import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import LmsStudentShell from "@/components/lms/LmsStudentShell"
import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"
import PreviewBanner from "@/components/lms/PreviewBanner"
import { ENROLLMENT_ACCESS_COLUMNS, currentVisible } from "@/lib/lms-enrollment"
import { sessionsForViewers, sessionToday } from "@/lib/lms-sessions"

export default async function LmsLayout({ children }: { children: React.ReactNode }) {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")
  // An admin has required this student to set a new password (LMS Settings ->
  // Student Passwords). Nothing in the portal is reachable until they do.
  // (Not for a staff preview: it can't change the password, so it would be stuck.)
  if (student.mustChangePassword && !student.preview) redirect("/lms/change-password")

  const today   = sessionToday()
  const in7days = sessionToday(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))

  // Active enrolled course IDs
  const { data: enrollmentRows } = await db
    .from("lms_enrollments")
    .select(`id, course_id, status, enrolled_at, ${ENROLLMENT_ACCESS_COLUMNS}`)
    .eq("student_id", student.id)
    .eq("status", "active")
  const enrollments = currentVisible(enrollmentRows as any[]).filter(e => e.access === "full")

  // Upcoming sessions in the next 7 days — only the student's own program/track sessions.
  const upcomingSessions = (await sessionsForViewers(
    enrollments.map((e: any) => ({ course_id: e.course_id, program_id: e.program_id ?? null, track_id: e.lms_program_members?.track_id ?? null, group_id: e.group_id ?? null })),
    "id",
    q => q.gte("session_date", today).lte("session_date", in7days).is("closed_at", null),
  ).catch(() => [])).length

  return (
    <LmsStudentShell
      student={{ name: student.name, email: student.email }}
      upcomingSessions={upcomingSessions}
    >
      <SessionExpiredGuard loginUrl="/lms/login" reason="For security, your learning session has timed out." />
      {children}
      {student.preview && <PreviewBanner name={student.name} />}
    </LmsStudentShell>
  )
}
