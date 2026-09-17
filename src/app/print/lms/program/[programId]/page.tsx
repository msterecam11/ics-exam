import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ProgramReportView from "@/components/lms/reports/ProgramReportView"
import { isUuid, isStaffRole, parseExportOptions, loadProgramReport, scopedAssessment } from "@/lib/lms-report-scope"
import { programForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

// Print surface for the program / track report PDF (staff or the PDF renderer only).
export default async function PrintProgramReport({ params, searchParams }: {
  params: Promise<{ programId: string }>
  searchParams: Promise<{ pdf_secret?: string; track?: string; audience?: string; comments?: string; internal?: string }>
}) {
  const sp = await searchParams
  const { programId } = await params
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && sp.pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    if (!isStaffRole(session.user?.role)) notFound()
  }
  if (!isUuid(programId)) notFound()
  const track = isUuid(sp.track) ? sp.track : null
  const opts = parseExportOptions(sp)
  const [cached, ai] = await Promise.all([loadProgramReport(programId, track), scopedAssessment(`program:${programId}:${track ?? "-"}`)])
  if (!cached) notFound()
  const client = opts.audience === "client"
  const data = client ? programForClient(cached.data, opts) : cached.data
  const assessment = !client || opts.includeInternal ? ai?.assessment ?? null : null
  return <ProgramReportView data={data} audience={opts.audience} includeComments={opts.includeComments} includeInternal={opts.includeInternal} assessment={assessment} forPrint />
}
