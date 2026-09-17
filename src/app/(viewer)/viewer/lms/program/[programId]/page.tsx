import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ProgramReportView from "@/components/lms/reports/ProgramReportView"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"
import { canViewProgramReport } from "@/lib/viewer-access"
import { isUuid, loadProgramReport } from "@/lib/lms-report-scope"
import { programForClient } from "@/lib/lms-report-shared"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

// Program (or track) report for a viewer / client account — always the client
// copy: no students-needing-support list, no expert summary, feedback under the
// 3-response rule, no internal e-mail addresses.
export default async function ViewerProgramReportPage({ params, searchParams }: {
  params: Promise<{ programId: string }>; searchParams: Promise<{ track?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  const role = session.user.role
  if (role !== "viewer" && role !== "admin") redirect("/viewer")
  const { programId } = await params
  const sp = await searchParams
  if (!isUuid(programId)) notFound()
  if (role !== "admin" && !(await canViewProgramReport(session.user.id, programId))) notFound()

  const track = isUuid(sp.track) ? sp.track : null
  const cached = await loadProgramReport(programId, track)
  if (!cached) notFound()
  const data = programForClient(cached.data, { includeComments: false, includeInternal: false })

  return (
    <>
      <ViewerReportToolbar crumbs={[
        ...(data.program.company ? [{ label: data.program.company.name, href: `/viewer/lms/client/${data.program.company.id}` }] : []),
        { label: data.program.name, href: track ? `/viewer/lms/program/${programId}` : undefined },
        ...(data.scope.trackName ? [{ label: data.scope.trackName }] : []),
      ]} />
      {data.tracks.length > 0 && (
        <div className="no-print max-w-[794px] mx-auto mb-3 flex flex-wrap items-center gap-1.5 px-1">
          <Link href={`/viewer/lms/program/${programId}`} className={cn("px-2.5 py-1 rounded-lg text-xs border", !track ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>Whole program</Link>
          {data.tracks.map(t => (
            <Link key={t.id} href={`/viewer/lms/program/${programId}?track=${t.id}`} className={cn("px-2.5 py-1 rounded-lg text-xs border", track === t.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>{t.name}</Link>
          ))}
        </div>
      )}
      <ProgramReportView data={data} audience="client" linkMode="viewer" />
    </>
  )
}
