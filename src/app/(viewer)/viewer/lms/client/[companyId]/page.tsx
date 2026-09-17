import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ClientReportView from "@/components/lms/reports/ClientReportView"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"
import { canViewClientReport } from "@/lib/viewer-access"
import { isUuid, loadClientReport } from "@/lib/lms-report-scope"
import { clientForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

// Whole-client report — only for an account granted the client (company) scope.
export default async function ViewerClientReportPage({ params }: { params: Promise<{ companyId: string }> }) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  const role = session.user.role
  if (role !== "viewer" && role !== "admin") redirect("/viewer")
  const { companyId } = await params
  if (!isUuid(companyId)) notFound()
  if (role !== "admin" && !(await canViewClientReport(session.user.id, companyId))) notFound()

  const cached = await loadClientReport(companyId)
  if (!cached) notFound()
  const data = clientForClient(cached.data, { includeComments: false, includeInternal: false })

  return (
    <>
      <ViewerReportToolbar crumbs={[{ label: data.company.name }]} />
      <ClientReportView data={data} audience="client" linkMode="viewer" />
    </>
  )
}
