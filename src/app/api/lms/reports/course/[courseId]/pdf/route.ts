export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { parseCourseScope, courseScopeQuery } from "@/lib/lms-report-scope"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/reports/course/[courseId]/pdf[?program=&track= | ?scope=all]
export async function GET(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { courseId } = await params
  const sp = new URL(req.url).searchParams
  const scope = parseCourseScope({ program: sp.get("program"), track: sp.get("track"), scope: sp.get("scope") })

  const courseRes = await db.from("lms_courses").select("title").eq("id", courseId).maybeSingle()
  if (!courseRes.data) return NextResponse.json({ error: "Course not found" }, { status: 404 })
  let suffix = scope.allRuns ? " - All runs" : ""
  if (scope.programId) {
    const { data: p } = await db.from("lms_programs").select("name").eq("id", scope.programId).maybeSingle()
    if (!p) return NextResponse.json({ error: "Program not found" }, { status: 404 })
    suffix = ` - ${(p as any).name}`
  }

  const q = courseScopeQuery(scope)
  return renderReportPdf(`/print/lms/course/${courseId}${q ? `?${q}` : ""}`, `${(courseRes.data as any).title}${suffix} - Course Report.pdf`)
}
