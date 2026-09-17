import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ClientReportView from "@/components/lms/reports/ClientReportView"
import ReportToolbar from "@/components/lms/reports/ReportToolbar"
import { isUuid, loadClientReport } from "@/lib/lms-report-scope"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }
export const dynamic = "force-dynamic"

// Client report (RL-7).
export default async function ClientReportPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<{ refresh?: string }>
}) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")
  const { companyId } = await params
  const { refresh } = await searchParams
  if (!isUuid(companyId)) notFound()
  const cached = await loadClientReport(companyId, { refresh: refresh === "1" })
  if (!cached) notFound()
  const d = cached.data
  return (
    <>
      <ReportToolbar
        crumbs={[{ label: "Reports", href: "/lms-admin/reports" }, { label: "Clients", href: "/lms-admin/reports/clients" }, { label: d.company.name }]}
        builtAt={cached.builtAt} refreshHref="?refresh=1"
        pdfHref={`/api/lms/reports/clients/${companyId}/pdf`} pdfName={`${d.company.name} - Client Report.pdf`}
        excelHref={`/api/lms/reports/clients/${companyId}/xlsx`}
      />
      <ClientReportView data={d} />
    </>
  )
}
