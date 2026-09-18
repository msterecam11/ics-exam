export const maxDuration = 90

import { NextResponse } from "next/server"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, parseExportOptions, exportQuery, loadProgramReport } from "@/lib/lms-report-scope"
import { guardStaff, canSeeProgram } from "@/lib/staff-access"

// GET /api/lms/reports/programs/[programId]/pdf?track=&audience=client|internal&comments=1&internal=1
export async function GET(req: Request, { params }: { params: Promise<{ programId: string }> }) {
  const g = await guardStaff({permission: "export_reports"})
  if (!g.ok) return g.res
  const { programId } = await params
  if (!canSeeProgram(g.scope, programId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isUuid(programId)) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const track = isUuid(sp.get("track")) ? sp.get("track") : null
  const opts = parseExportOptions({ audience: sp.get("audience"), comments: sp.get("comments"), internal: sp.get("internal") })

  const cached = await loadProgramReport(programId, track)
  if (!cached) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const r = cached.data
  const name = `${r.program.name}${r.scope.trackName ? ` - ${r.scope.trackName}` : ""} - Program Report${opts.audience === "client" ? " (client)" : ""}.pdf`
  return renderReportPdf(`/print/lms/program/${programId}?${[track && `track=${track}`, exportQuery(opts)].filter(Boolean).join("&")}`, name)
}
