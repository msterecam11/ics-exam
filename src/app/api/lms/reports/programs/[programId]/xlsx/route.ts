import { NextResponse } from "next/server"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { programWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { isUuid, loadProgramReport } from "@/lib/lms-report-scope"
import { programForClient } from "@/lib/lms-report-shared"
import { guardStaff, canSeeProgram } from "@/lib/staff-access"

// GET /api/lms/reports/programs/[programId]/xlsx?track=&audience=client|internal
export async function GET(req: Request, { params }: { params: Promise<{ programId: string }> }) {
  const g = await guardStaff({permission: "export_reports"})
  if (!g.ok) return g.res
  const { programId } = await params
  if (!canSeeProgram(g.scope, programId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
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
