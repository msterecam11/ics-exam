export const maxDuration = 90

import { NextResponse } from "next/server"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, parseExportOptions, exportQuery, loadClientReport } from "@/lib/lms-report-scope"
import { guardStaff } from "@/lib/staff-access"

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const opts = parseExportOptions({ audience: sp.get("audience"), comments: sp.get("comments"), internal: sp.get("internal") })
  const cached = await loadClientReport(companyId)
  if (!cached) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  return renderReportPdf(`/print/lms/client/${companyId}?${exportQuery(opts)}`, `${cached.data.company.name} - Client Report.pdf`)
}
