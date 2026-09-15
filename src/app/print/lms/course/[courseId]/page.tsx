import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import { buildGroupReport } from "@/lib/lms-group-report"
import { canViewLmsCourseReport } from "@/lib/viewer-access"
import GroupReportView from "@/components/lms/GroupReportView"

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

export const dynamic = "force-dynamic"

// Print surface for the cohort PDF — renders the exact on-screen report so the
// downloaded PDF matches the screen. Puppeteer splits it by [data-report-page].
export default async function PrintGroupReport({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const { courseId } = await params

  // Same authorization as the cohort report page this mirrors — a bare session
  // is not enough. This report covers EVERY learner on the course, so an
  // unscoped signed-in account must not be able to pull it by URL.
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    const role = session.user?.role ?? ""
    const isStaff = role === "admin" || role === "instructor"
    if (!isStaff && !(await canViewLmsCourseReport(session.user.id, courseId))) notFound()
  }
  const data = await buildGroupReport(courseId)
  if (!data) notFound()

  const { data: stored } = await db
    .from("lms_course_assessments")
    .select("assessment, generated_at")
    .eq("course_id", courseId)
    .maybeSingle()

  return <GroupReportView data={data} assessment={(stored?.assessment as any) ?? null} generatedAt={(stored?.generated_at as any) ?? null} forPrint />
}
