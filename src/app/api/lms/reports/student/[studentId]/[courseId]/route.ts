import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildCourseReport } from "@/lib/lms-course-report"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/reports/student/[studentId]/[courseId] — full report JSON for the on-screen view
export async function GET(_req: Request, { params }: { params: Promise<{ studentId: string; courseId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId, courseId } = await params
  const report = await buildCourseReport(studentId, courseId)
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })
  return NextResponse.json(report)
}
