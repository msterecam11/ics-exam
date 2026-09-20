import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import GroupReportView from "@/components/lms/GroupReportView"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"
import { canViewGroupReport } from "@/lib/viewer-access"
import { isUuid, loadGroupReport } from "@/lib/lms-report-scope"
import { groupForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

// One course of one program, as the client sees it: the group's results, with
// no students-needing-support list, no expert summary, no flagged questions and
// no free-text comments. Never "all runs" — that would show other clients.
export default async function ViewerGroupReportPage({ params, searchParams }: {
  params: Promise<{ programId: string; courseId: string }>
  searchParams: Promise<{ track?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  const role = session.user.role
  if (role !== "viewer" && role !== "admin") redirect("/viewer")

  const { programId, courseId } = await params
  const sp = await searchParams
  if (!isUuid(programId) || !isUuid(courseId)) notFound()
  if (role !== "admin" && !(await canViewGroupReport(session.user.id, programId))) notFound()

  const trackId = isUuid(sp.track) ? sp.track : null
  const cached = await loadGroupReport(courseId, { programId, trackId, allRuns: false, month: null })
  if (!cached) notFound()
  const data = groupForClient(cached.data)

  return (
    <>
      <style>{`
        .page-break { break-before: page; }
        @page { size: 794px 1122px; margin: 0; }
        @media print { .no-print { display: none !important; } body { margin: 0; background: white; } }
      `}</style>
      <ViewerReportToolbar crumbs={[{ label: data.course.title }]} />
      <GroupReportView data={data} assessment={null} generatedAt={null} audience="client" />
    </>
  )
}
