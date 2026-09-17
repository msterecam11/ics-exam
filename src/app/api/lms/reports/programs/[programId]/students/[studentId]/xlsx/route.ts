import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { contentDisposition } from "@/lib/lms-report-pdf"
import { studentWorkbook, XLSX_TYPE } from "@/lib/lms-report-excel"
import { isUuid, isStaffRole, loadStudentProgramReport } from "@/lib/lms-report-scope"
import { studentForClient } from "@/lib/lms-report-shared"

export async function GET(req: Request, { params }: { params: Promise<{ programId: string; studentId: string }> }) {
  const session = await auth()
  if (!session || !isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { programId, studentId } = await params
  if (!isUuid(programId) || !isUuid(studentId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cached = await loadStudentProgramReport(programId, studentId)
  if (!cached) return NextResponse.json({ error: "Student is not in this program" }, { status: 404 })
  const internal = new URL(req.url).searchParams.get("audience") !== "client"
  const buf = await studentWorkbook(internal ? cached.data : studentForClient(cached.data, { includeComments: false, includeInternal: false }), { internal })
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": contentDisposition(`${cached.data.student.name} - ${cached.data.program.name}.xlsx`) } })
}
