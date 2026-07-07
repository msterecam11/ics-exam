import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { buildCourseReport } from "@/lib/lms-course-report"
import { canViewLmsReport } from "@/lib/viewer-access"
import CourseReportPages from "@/components/lms/CourseReportPages"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"

interface Props { params: Promise<{ studentId: string; courseId: string }> }

export const dynamic = "force-dynamic"

// Read-only report view for the Viewer Portal — gated on the "reports"
// permission granted in /hub/users (course scope, or cohort scope when the
// student is a member of that cohort). No admin actions (no generate/
// regenerate, no server-PDF) — just the same report content, print-to-PDF only.
export default async function ViewerLmsReportPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role !== "viewer" && session.user.role !== "admin") redirect("/viewer")

  const { studentId, courseId } = await params

  if (session.user.role !== "admin") {
    const allowed = await canViewLmsReport(session.user.id, studentId, courseId)
    if (!allowed) notFound()
  }

  const report = await buildCourseReport(studentId, courseId)
  if (!report) notFound()

  return (
    <>
      <style>{`
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @page { size: 794px 1122px; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
        }
      `}</style>
      <ViewerReportToolbar studentName={report.student.name} courseTitle={report.course.title} />
      <CourseReportPages report={report} />
    </>
  )
}
