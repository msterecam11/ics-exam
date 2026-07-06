import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildGroupReport } from "@/lib/lms-group-report"
import GroupReportView from "@/components/lms/GroupReportView"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

interface Props { params: Promise<{ courseId: string }> }

export const dynamic = "force-dynamic"

export default async function LmsCourseGroupReportPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params
  const data = await buildGroupReport(courseId)
  if (!data) notFound()

  const { data: stored } = await db
    .from("lms_course_assessments")
    .select("assessment, generated_at")
    .eq("course_id", courseId)
    .maybeSingle()

  return <GroupReportView data={data} assessment={(stored?.assessment as any) ?? null} generatedAt={(stored?.generated_at as any) ?? null} />
}
