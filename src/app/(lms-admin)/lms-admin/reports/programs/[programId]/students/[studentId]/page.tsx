import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import StudentProgramReportView from "@/components/lms/reports/StudentProgramReportView"
import ReportToolbar from "@/components/lms/reports/ReportToolbar"
import { isUuid, loadStudentProgramReport } from "@/lib/lms-report-scope"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }
export const dynamic = "force-dynamic"

// Student in a program (RL-6).
export default async function StudentProgramReportPage({ params, searchParams }: {
  params: Promise<{ programId: string; studentId: string }>; searchParams: Promise<{ refresh?: string }>
}) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")
  const { programId, studentId } = await params
  const { refresh } = await searchParams
  if (!isUuid(programId) || !isUuid(studentId)) notFound()
  const cached = await loadStudentProgramReport(programId, studentId, { refresh: refresh === "1" })
  if (!cached) notFound()
  const d = cached.data
  return (
    <>
      <ReportToolbar
        crumbs={[
          { label: "Reports", href: "/lms-admin/reports" },
          ...(d.program.company ? [{ label: d.program.company.name, href: `/lms-admin/reports/clients/${d.program.company.id}` }] : []),
          { label: d.program.name, href: `/lms-admin/reports/programs/${programId}` },
          { label: d.student.name },
        ]}
        builtAt={cached.builtAt} refreshHref="?refresh=1"
        pdfHref={`/api/lms/reports/programs/${programId}/students/${studentId}/pdf`} pdfName={`${d.student.name} - ${d.program.name}.pdf`}
        excelHref={`/api/lms/reports/programs/${programId}/students/${studentId}/xlsx`}
      />
      <StudentProgramReportView data={d} />
    </>
  )
}
