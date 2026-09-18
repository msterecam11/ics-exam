import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ProgramReportView from "@/components/lms/reports/ProgramReportView"
import ReportToolbar from "@/components/lms/reports/ReportToolbar"
import { isUuid, loadProgramReport, scopedAssessment } from "@/lib/lms-report-scope"
import { cn } from "@/lib/utils"
import { pageScope, canSeeProgram } from "@/lib/staff-access"

export const dynamic = "force-dynamic"

// Program report (RL-5), or one track of it (RL-4).
export default async function ProgramReportPage({ params, searchParams }: {
  params: Promise<{ programId: string }>; searchParams: Promise<{ track?: string; refresh?: string }>
}) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const { programId } = await params
  if (!canSeeProgram(scope, programId)) notFound()
  const sp = await searchParams
  if (!isUuid(programId)) notFound()
  const track = isUuid(sp.track) ? sp.track : null
  const [cached, ai] = await Promise.all([
    loadProgramReport(programId, track, { refresh: sp.refresh === "1" }),
    scopedAssessment(`program:${programId}:${track ?? "-"}`),
  ])
  if (!cached) notFound()
  const d = cached.data
  const q = track ? `?track=${track}` : ""

  return (
    <>
      <ReportToolbar
        crumbs={[
          { label: "Reports", href: "/lms-admin/reports" },
          ...(d.program.company ? [{ label: d.program.company.name, href: `/lms-admin/reports/clients/${d.program.company.id}` }] : [{ label: "Programs", href: "/lms-admin/reports/programs" }]),
          { label: d.program.name, href: track ? `/lms-admin/reports/programs/${programId}` : undefined },
          ...(d.scope.trackName ? [{ label: d.scope.trackName }] : []),
        ]}
        builtAt={cached.builtAt} refreshHref={`?${[track && `track=${track}`, "refresh=1"].filter(Boolean).join("&")}`}
        pdfHref={`/api/lms/reports/programs/${programId}/pdf${q}`}
        pdfName={`${d.program.name}${d.scope.trackName ? ` - ${d.scope.trackName}` : ""} - Program Report.pdf`}
        excelHref={`/api/lms/reports/programs/${programId}/xlsx${q}`}
        aiEndpoint={`/api/lms/reports/programs/${programId}/expert-assessment${q}`} hasAi={!!ai}
      >
        {d.tracks.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" aria-label="Track">
            <Link href={`/lms-admin/reports/programs/${programId}`} className={cn("px-2.5 py-1 rounded-lg text-xs border", !track ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>Whole program</Link>
            {d.tracks.map(t => (
              <Link key={t.id} href={`/lms-admin/reports/programs/${programId}?track=${t.id}`} className={cn("px-2.5 py-1 rounded-lg text-xs border", track === t.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>{t.name}</Link>
            ))}
          </div>
        )}
      </ReportToolbar>
      <ProgramReportView data={d} assessment={ai?.assessment ?? null} />
    </>
  )
}
