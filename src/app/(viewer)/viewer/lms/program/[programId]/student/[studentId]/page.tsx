import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import StudentProgramReportView from "@/components/lms/reports/StudentProgramReportView"
import ViewerReportToolbar from "@/components/lms/ViewerReportToolbar"
import { canViewStudentInProgram } from "@/lib/viewer-access"
import { isUuid, loadStudentProgramReport } from "@/lib/lms-report-scope"
import { studentForClient } from "@/lib/lms-report-shared"

export const dynamic = "force-dynamic"

export default async function ViewerStudentProgramReportPage({ params }: {
  params: Promise<{ programId: string; studentId: string }>
}) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  const role = session.user.role
  if (role !== "viewer" && role !== "admin") redirect("/viewer")
  const { programId, studentId } = await params
  if (!isUuid(programId) || !isUuid(studentId)) notFound()
  if (role !== "admin" && !(await canViewStudentInProgram(session.user.id, programId, studentId))) notFound()

  const cached = await loadStudentProgramReport(programId, studentId)
  if (!cached) notFound()
  const data = studentForClient(cached.data, { includeComments: false, includeInternal: false })

  return (
    <>
      <ViewerReportToolbar crumbs={[
        ...(data.program.company ? [{ label: data.program.company.name, href: `/viewer/lms/client/${data.program.company.id}` }] : []),
        { label: data.program.name, href: `/viewer/lms/program/${programId}` },
        { label: data.student.name },
      ]} />
      <StudentProgramReportView data={data} audience="client" linkMode="viewer" />
    </>
  )
}
