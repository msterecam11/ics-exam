export const maxDuration = 90

import { NextResponse } from "next/server"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, parseExportOptions, exportQuery, loadStudentProgramReport } from "@/lib/lms-report-scope"
import { guardStaff, canSeeProgram, canSeeStudent } from "@/lib/staff-access"

export async function GET(req: Request, { params }: { params: Promise<{ programId: string; studentId: string }> }) {
  const g = await guardStaff({permission: "export_reports"})
  if (!g.ok) return g.res
  const { programId, studentId } = await params
  if (!canSeeProgram(g.scope, programId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await canSeeStudent(g.scope, studentId))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isUuid(programId) || !isUuid(studentId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const opts = parseExportOptions({ audience: sp.get("audience"), internal: sp.get("internal") })
  const cached = await loadStudentProgramReport(programId, studentId)
  if (!cached) return NextResponse.json({ error: "Student is not in this program" }, { status: 404 })
  return renderReportPdf(`/print/lms/program/${programId}/student/${studentId}?${exportQuery(opts)}`,
    `${cached.data.student.name} - ${cached.data.program.name} - Student Report.pdf`)
}
