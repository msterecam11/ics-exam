import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ClientReportView from "@/components/lms/reports/ClientReportView"
import { isUuid, isStaffRole, parseExportOptions, loadClientReport } from "@/lib/lms-report-scope"
import { clientForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

export default async function PrintClientReport({ params, searchParams }: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ pdf_secret?: string; audience?: string; comments?: string }>
}) {
  const sp = await searchParams
  const { companyId } = await params
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && sp.pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    if (!isStaffRole(session.user?.role)) notFound()
  }
  if (!isUuid(companyId)) notFound()
  const opts = parseExportOptions(sp)
  const cached = await loadClientReport(companyId)
  if (!cached) notFound()
  const data = opts.audience === "client" ? clientForClient(cached.data, opts) : cached.data
  return <ClientReportView data={data} audience={opts.audience} includeComments={opts.includeComments} forPrint />
}
