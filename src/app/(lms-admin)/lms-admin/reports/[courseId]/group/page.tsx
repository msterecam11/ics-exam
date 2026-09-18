import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import GroupReportView from "@/components/lms/GroupReportView"
import { parseCourseScope, loadGroupReport, loadCourseComparison, loadCourseAssessment, courseScopeOptions } from "@/lib/lms-report-scope"
import { pageScope, canSeeProgram } from "@/lib/staff-access"

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ program?: string; track?: string; scope?: string; month?: string; refresh?: string }>
}

export const dynamic = "force-dynamic"

// Course group report (RL-3 / RL-4 / RL-8): current enrollments, one program
// (optionally one track), or every run of the course across programs.
export default async function LmsCourseGroupReportPage({ params, searchParams }: Props) {
  const staff = await pageScope()
  if (!staff) redirect("/auth/login")

  const { courseId } = await params
  const sp = await searchParams
  // An instructor may only look at a run of a course inside one of their
  // programs — never "every run across programs" (RL-8).
  if (!staff.isAdmin && !canSeeProgram(staff, sp.program ?? null)) notFound()
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
