import { NextResponse } from "next/server"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { clientWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { isUuid, loadClientReport } from "@/lib/lms-report-scope"
import { guardStaff } from "@/lib/staff-access"

export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const cached = await loadClientReport(companyId)
  if (!cached) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const buf = await clientWorkbook(cached.data)
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": contentDisposition(`${cached.data.company.name} - Client Report.xlsx`) } })
}
