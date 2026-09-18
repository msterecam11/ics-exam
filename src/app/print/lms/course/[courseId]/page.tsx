import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { canViewLmsCourseReport } from "@/lib/viewer-access"
import GroupReportView from "@/components/lms/GroupReportView"
import { parseCourseScope, loadGroupReport, loadCourseComparison, loadCourseAssessment } from "@/lib/lms-report-scope"

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ pdf_secret?: string; program?: string; track?: string; scope?: string }>
}

export const dynamic = "force-dynamic"

// Print surface for the cohort PDF — renders the exact on-screen report so the
// downloaded PDF matches the screen. Puppeteer splits it by [data-report-page].
export default async function PrintGroupReport({ params, searchParams }: Props) {
  const sp = await searchParams
  const { courseId } = await params
  const scope = parseCourseScope(sp)

  // Same authorization as the cohort report page this mirrors — a bare session
  // is not enough. This report covers EVERY learner on the course, so an
  // unscoped signed-in account must not be able to pull it by URL. Program /
  // all-runs scopes are staff-only.
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && sp.pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    const role = session.user?.role ?? ""
    const isStaff = role === "admin"   // Step 9: instructors get scoped access separately
    if (!isStaff && (scope.programId || scope.allRuns || !(await canViewLmsCourseReport(session.user.id, courseId)))) notFound()
  }

  const [cached, stored, comparison] = await Promise.all([
    loadGroupReport(courseId, scope),
    loadCourseAssessment(courseId, scope),
    scope.allRuns ? loadCourseComparison(courseId) : Promise.resolve(null),
  ])
  if (!cached) notFound()

  return <GroupReportView data={cached.data} assessment={stored?.assessment ?? null} generatedAt={stored?.generated_at ?? null} comparison={comparison?.data ?? null} forPrint />
}
