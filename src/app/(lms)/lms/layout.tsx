import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import LmsStudentShell from "@/components/lms/LmsStudentShell"
import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"

export default async function LmsLayout({ children }: { children: React.ReactNode }) {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  const today   = new Date().toISOString().slice(0, 10)
  const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Active enrolled course IDs
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("course_id")
    .eq("student_id", student.id)
    .eq("status", "active")

  const courseIds = (enrollments ?? []).map((e: any) => e.course_id)

  // Upcoming sessions in next 7 days
  let upcomingSessions = 0
  if (courseIds.length) {
    const { count } = await db
      .from("lms_sessions")
      .select("id", { count: "exact", head: true })
      .in("course_id", courseIds)
      .gte("session_date", today)
      .lte("session_date", in7days)
      .is("closed_at", null)
    upcomingSessions = count ?? 0
  }

  // Submitted assignments awaiting grading
  const { count: pendingCount } = await db
    .from("lms_assignment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .eq("status", "submitted")

  return (
    <LmsStudentShell
      student={{ name: student.name, email: student.email }}
      upcomingSessions={upcomingSessions}
      pendingAssignments={pendingCount ?? 0}
    >
      <SessionExpiredGuard loginUrl="/lms/login" reason="For security, your learning session has timed out." />
      {children}
    </LmsStudentShell>
  )
}
