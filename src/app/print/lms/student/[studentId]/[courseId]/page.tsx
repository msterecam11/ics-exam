import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { buildCourseReport } from "@/lib/lms-course-report"
import StudentCourseReportPages from "@/components/lms/StudentCourseReportPages"

interface Props {
  params: Promise<{ studentId: string; courseId: string }>
  searchParams: Promise<{ pdf_secret?: string; includeSecurity?: string }>
}

export default async function PrintStudentLmsReport({ params, searchParams }: Props) {
  const { pdf_secret, includeSecurity } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { studentId, courseId } = await params
  const report = await buildCourseReport(studentId, courseId)
  if (!report) notFound()

  return <StudentCourseReportPages report={report} includeSecurity={includeSecurity !== "false"} />
}
