import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import StudentProgramReportView from "@/components/lms/reports/StudentProgramReportView"
import { isUuid, isStaffRole, parseExportOptions, loadStudentProgramReport } from "@/lib/lms-report-scope"
import { studentForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

export default async function PrintStudentProgramReport({ params, searchParams }: {
  params: Promise<{ programId: string; studentId: string }>
  searchParams: Promise<{ pdf_secret?: string; audience?: string; internal?: string }>
}) {
  const sp = await searchParams
  const { programId, studentId } = await params
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && sp.pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    if (!isStaffRole(session.user?.role)) notFound()
  }
  if (!isUuid(programId) || !isUuid(studentId)) notFound()
  const opts = parseExportOptions(sp)
  const cached = await loadStudentProgramReport(programId, studentId)
  if (!cached) notFound()
  const data = opts.audience === "client" ? studentForClient(cached.data, opts) : cached.data
  return <StudentProgramReportView data={data} audience={opts.audience} includeInternal={opts.includeInternal} forPrint />
}
