import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { programWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { isUuid, isStaffRole, loadProgramReport } from "@/lib/lms-report-scope"
import { programForClient } from "@/lib/lms-report-shared"

// GET /api/lms/reports/programs/[programId]/xlsx?track=&audience=client|internal
export async function GET(req: Request, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { programId } = await params
  if (!isUuid(programId)) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const track = isUuid(sp.get("track")) ? sp.get("track") : null
  const cached = await loadProgramReport(programId, track)
  if (!cached) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const internal = sp.get("audience") !== "client"
  const r = internal ? cached.data : programForClient(cached.data, { includeComments: sp.get("comments") === "1", includeInternal: false })
  const buf = await programWorkbook(r, { internal })
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": contentDisposition(`${r.program.name}${r.scope.trackName ? ` - ${r.scope.trackName}` : ""} - Program Report.xlsx`) } })
}
