import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { buildCourseReport } from "@/lib/lms-course-report"
import { canViewLmsReport } from "@/lib/viewer-access"
import StudentCourseReportPages from "@/components/lms/StudentCourseReportPages"

interface Props {
  params: Promise<{ studentId: string; courseId: string }>
  searchParams: Promise<{ pdf_secret?: string; includeSecurity?: string }>
}

export default async function PrintStudentLmsReport({ params, searchParams }: Props) {
  const { pdf_secret, includeSecurity } = await searchParams
  const { studentId, courseId } = await params

  // Must match the authorization on the report pages this mirrors. Previously
  // this only checked that SOME session existed, so any signed-in account —
  // including a viewer with no grants, or an interview assessor with no LMS
  // role at all — could read any learner's report (and, by passing
  // includeSecurity=true, their integrity data) just by knowing the URL.
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    const role = session.user?.role ?? ""
    const isStaff = role === "admin" || role === "instructor"
    if (!isStaff && !(await canViewLmsReport(session.user.id, studentId, courseId))) notFound()
  }
  const report = await buildCourseReport(studentId, courseId)
  if (!report) notFound()

  // Opt-in, not opt-out: only include the integrity section when explicitly asked.
  return <StudentCourseReportPages report={report} includeSecurity={includeSecurity === "true"} forPrint />
}
