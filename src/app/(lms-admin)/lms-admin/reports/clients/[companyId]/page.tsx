import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import ClientReportView from "@/components/lms/reports/ClientReportView"
import ReportToolbar from "@/components/lms/reports/ReportToolbar"
import { isUuid, loadClientReport } from "@/lib/lms-report-scope"
import { isMgr } from "@/lib/staff-roles"
import LevelNav, { levelPct } from "@/components/lms/reports/LevelNav"

const fmtMonth = (d: string | null) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export const dynamic = "force-dynamic"

// Client report (RL-7).
export default async function ClientReportPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<{ refresh?: string }>
}) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")
  const { companyId } = await params
  const { refresh } = await searchParams
  if (!isUuid(companyId)) notFound()
  const cached = await loadClientReport(companyId, { refresh: refresh === "1" })
  if (!cached) notFound()
  const d = cached.data
  return (
    <>
      <ReportToolbar
        crumbs={[{ label: "Reports", href: "/lms-admin/reports" }, { label: d.company.name }]}
        builtAt={cached.builtAt} refreshHref="?refresh=1"
        pdfHref={`/api/lms/reports/clients/${companyId}/pdf`} pdfName={`${d.company.name} - Client Report.pdf`}
        excelHref={`/api/lms/reports/clients/${companyId}/xlsx`}
      />
      <LevelNav
        title={`Programs of ${d.company.name}`} hint="Open a program for its tracks, groups and students"
        columns={["Dates", "Learners", "Completion", "Pass rate"]} pastLabel="Finished programs"
        rows={d.programs.map(p => ({
          id: p.id, label: p.name, sub: p.reference, href: `/lms-admin/reports/programs/${p.id}`,
          live: p.status === "active",
          cells: [`${fmtMonth(p.start_date)} – ${fmtMonth(p.end_date)}`, p.students, levelPct(p.completionRate), levelPct(p.passRate)],
          pdfHref: `/api/lms/reports/programs/${p.id}/pdf?audience=client`,
        }))}
      />
      <ClientReportView data={d} />
    </>
  )
}
