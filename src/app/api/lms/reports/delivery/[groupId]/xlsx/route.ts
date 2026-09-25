import { NextResponse } from "next/server"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { deliveryWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { buildDeliveryReport } from "@/lib/lms-delivery-report"
import { isUuid } from "@/lib/lms-groups"
import { guardStaff, forbidden } from "@/lib/staff-access"

// GET /api/lms/reports/delivery/[groupId]/xlsx?audience=client|internal
export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { groupId } = await params
  if (!isUuid(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(groupId)) return forbidden()
  const client = new URL(req.url).searchParams.get("audience") === "client"
  const r = await buildDeliveryReport(groupId, client ? "client" : "internal")
  if (!r) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  const buf = await deliveryWorkbook(r)
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_TYPE,
    "Content-Disposition": contentDisposition(`${r.course.title} - ${r.group.label} - Group Report${client ? " (client)" : ""}.xlsx`) } })
}
