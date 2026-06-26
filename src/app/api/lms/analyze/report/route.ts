import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── GET /api/lms/analyze/report?course_id=xxx ─────────────────────
// Returns the full AI analysis report for a course.
// Reads from lms_module_analysis (built by Phase 3 + 4).

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // Fetch all module analyses for the course, ordered by module order_index
  const { data: analyses, error } = await db
    .from("lms_module_analysis")
    .select(`
      id, module_id, module_type, analysis, analyzed_at,
      lms_modules(title, order_index)
    `)
    .eq("course_id", courseId)
    .order("analyzed_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort by module order_index
  const sorted = (analyses ?? []).sort((a: any, b: any) => {
    const aIdx = (a.lms_modules as any)?.order_index ?? 999
    const bIdx = (b.lms_modules as any)?.order_index ?? 999
    return aIdx - bIdx
  })

  // Separate exam analysis from module analyses
  const examAnalyses    = sorted.filter((a: any) => a.module_type === "final_exam")
  const moduleAnalyses  = sorted.filter((a: any) => a.module_type !== "final_exam")

  // Build course-level topic coverage (aggregated from all modules)
  const topicCoverage: Record<string, string[]> = {}
  for (const a of moduleAnalyses) {
    const analysis = a.analysis as any
    const title = analysis.module_title ?? "Unknown Module"
    for (const topic of analysis.topics ?? []) {
      if (!topicCoverage[topic]) topicCoverage[topic] = []
      topicCoverage[topic].push(title)
    }
  }

  const report = {
    course_id: courseId,
    generated_at: new Date().toISOString(),
    module_count: moduleAnalyses.length,
    exam_count: examAnalyses.length,
    modules: moduleAnalyses.map((a: any) => ({
      module_id:   a.module_id,
      module_type: a.module_type,
      analyzed_at: a.analyzed_at,
      ...a.analysis,
    })),
    exams: examAnalyses.map((a: any) => ({
      module_id:   a.module_id,
      module_type: a.module_type,
      analyzed_at: a.analyzed_at,
      ...a.analysis,
    })),
    topic_coverage: topicCoverage,
  }

  return NextResponse.json(report)
}
