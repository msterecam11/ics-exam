import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { clientWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { isUuid, isStaffRole, loadClientReport } from "@/lib/lms-report-scope"

export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const cached = await loadClientReport(companyId)
  if (!cached) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const buf = await clientWorkbook(cached.data)
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": contentDisposition(`${cached.data.company.name} - Client Report.xlsx`) } })
}
