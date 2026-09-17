import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { buildCourseReport } from "@/lib/lms-course-report"
import { canViewLmsReport, canViewEnrollmentReport } from "@/lib/viewer-access"
import StudentCourseReportPages from "@/components/lms/StudentCourseReportPages"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"

interface Props {
  params: Promise<{ studentId: string; courseId: string }>
  searchParams: Promise<{ enrollment?: string }>
}

export const dynamic = "force-dynamic"

// Read-only report view for the Viewer Portal — gated on the "reports"
// permission granted in /hub/users (course scope, or cohort scope when the
// student is a member of that cohort). No admin actions (no generate/
// regenerate, no server-PDF) — just the same report content, print-to-PDF only.
export default async function ViewerLmsReportPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role !== "viewer" && session.user.role !== "admin") redirect("/viewer")

  const { studentId, courseId } = await params
  const { enrollment } = await searchParams
  const runId = enrollment && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollment) ? enrollment : null

  if (session.user.role !== "admin") {
    // A specific run must belong to this student's course AND to a program the
    // viewer may see; otherwise fall back to the course/cohort grant rules.
    const allowed = runId
      ? (await canViewEnrollmentReport(session.user.id, runId).then(r => r?.studentId === studentId && r?.courseId === courseId))
        || await canViewLmsReport(session.user.id, studentId, courseId)
      : await canViewLmsReport(session.user.id, studentId, courseId)
    if (!allowed) notFound()
  }

  const report = await buildCourseReport(studentId, courseId, runId ? { enrollmentId: runId } : undefined)
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
      <ViewerReportToolbar crumbs={[
        ...(report.context?.program ? [{ label: report.context.program.name, href: `/viewer/lms/program/${report.context.program.id}` }] : []),
        { label: report.student.name, href: report.context?.program ? `/viewer/lms/program/${report.context.program.id}/student/${studentId}` : undefined },
        { label: report.course.title },
      ]} />
      {/* Explicitly no integrity section: this portal is the learner/client-facing
          view, which should not disclose more than the admin's own default. */}
      <StudentCourseReportPages report={report} includeSecurity={false} />
    </>
  )
}
