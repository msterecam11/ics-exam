export const maxDuration = 90

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, isStaffRole, parseExportOptions, exportQuery, loadProgramReport } from "@/lib/lms-report-scope"

// GET /api/lms/reports/programs/[programId]/pdf?track=&audience=client|internal&comments=1&internal=1
export async function GET(req: Request, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { programId } = await params
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
