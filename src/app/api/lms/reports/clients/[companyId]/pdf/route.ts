export const maxDuration = 90

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, isStaffRole, parseExportOptions, exportQuery, loadClientReport } from "@/lib/lms-report-scope"

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const opts = parseExportOptions({ audience: sp.get("audience"), comments: sp.get("comments") })
  const cached = await loadClientReport(companyId)
  if (!cached) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  return renderReportPdf(`/print/lms/client/${companyId}?${exportQuery(opts)}`, `${cached.data.company.name} - Client Report.pdf`)
}
