import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import GroupReportView from "@/components/lms/GroupReportView"
import { parseCourseScope, loadGroupReport, loadCourseComparison, loadCourseAssessment, courseScopeOptions } from "@/lib/lms-report-scope"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ program?: string; track?: string; scope?: string; refresh?: string }>
}

export const dynamic = "force-dynamic"

// Course group report (RL-3 / RL-4 / RL-8): current enrollments, one program
// (optionally one track), or every run of the course across programs.
export default async function LmsCourseGroupReportPage({ params, searchParams }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params
  const sp = await searchParams
  const scope = parseCourseScope(sp)
  const refresh = sp.refresh === "1"

  const [cached, options, stored, comparison] = await Promise.all([
    loadGroupReport(courseId, scope, { refresh }),
    courseScopeOptions(courseId),
    loadCourseAssessment(courseId, scope),
    scope.allRuns ? loadCourseComparison(courseId, { refresh }) : Promise.resolve(null),
  ])
  if (!cached) notFound()

  return (
    <GroupReportView
      data={cached.data}
      assessment={stored?.assessment ?? null}
      generatedAt={stored?.generated_at ?? null}
      builtAt={cached.builtAt}
      comparison={comparison?.data ?? null}
      scopeOptions={options}
    />
  )
}
