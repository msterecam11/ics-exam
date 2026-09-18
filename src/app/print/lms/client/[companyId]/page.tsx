import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ClientReportView from "@/components/lms/reports/ClientReportView"
import { isUuid, isStaffRole, parseExportOptions, loadClientReport, scopedAssessment } from "@/lib/lms-report-scope"
import { clientForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

export default async function PrintClientReport({ params, searchParams }: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ pdf_secret?: string; audience?: string; comments?: string; internal?: string }>
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
  const [cached, ai] = await Promise.all([loadClientReport(companyId), scopedAssessment(`client:${companyId}`)])
  if (!cached) notFound()
  const client = opts.audience === "client"
  const data = client ? clientForClient(cached.data, opts) : cached.data
  const assessment = !client || opts.includeInternal ? ai?.assessment ?? null : null
  return <ClientReportView data={data} audience={opts.audience} includeComments={opts.includeComments} includeInternal={opts.includeInternal} assessment={assessment} forPrint />
}
