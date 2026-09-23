import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildCourseReport } from "@/lib/lms-course-report"
import { guardStaff, canSeeStudentCourse, forbidden } from "@/lib/staff-access"

// GET /api/lms/reports/student/[studentId]/[courseId] — full report JSON for the on-screen view
// ?enrollment=<id> opens a specific run (e.g. an earlier program); default = current.
export async function GET(req: Request, { params }: { params: Promise<{ studentId: string; courseId: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res

  const { studentId, courseId } = await params
  const requested = new URL(req.url).searchParams.get("enrollment")
  if (requested && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested))
    return NextResponse.json({ error: "Invalid enrollment" }, { status: 400 })
  // An instructor sees only the runs of their own programs (and tracks).
  if (!(await canSeeStudentCourse(g.scope, studentId, courseId, requested))) return forbidden()
  const report = await buildCourseReport(studentId, courseId, requested ? { enrollmentId: requested } : undefined)
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })
  return NextResponse.json(report)
}
