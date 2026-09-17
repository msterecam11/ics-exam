export const maxDuration = 90

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, isStaffRole, parseExportOptions, exportQuery, loadStudentProgramReport } from "@/lib/lms-report-scope"

export async function GET(req: Request, { params }: { params: Promise<{ programId: string; studentId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { programId, studentId } = await params
  if (!isUuid(programId) || !isUuid(studentId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const opts = parseExportOptions({ audience: sp.get("audience"), internal: sp.get("internal") })
  const cached = await loadStudentProgramReport(programId, studentId)
  if (!cached) return NextResponse.json({ error: "Student is not in this program" }, { status: 404 })
  return renderReportPdf(`/print/lms/program/${programId}/student/${studentId}?${exportQuery(opts)}`,
    `${cached.data.student.name} - ${cached.data.program.name} - Student Report.pdf`)
}
