import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { runModuleAnalysis } from "../_module"
import { runExamAnalysis } from "../_exam"
import { isMgr } from "@/lib/staff-roles"

// ── POST /api/lms/analyze/course ──────────────────────────────────
// Orchestrates full AI analysis for a course.
// Phase 3 (parallel): analyze all non-exam modules
// Phase 4 (sequential): analyze exam module(s) using Phase 3 output
//
// Calls analysis functions directly — no HTTP self-calls — so session
// auth is not required on the sub-routes.

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { course_id } = body
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // One run is an LLM call per module of the course. There was no limit at all,
  // so repeated clicks multiplied that against the shared quota.
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-ai-analyze-course:${session.user.id}`, 5, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { data: modules, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, module_type")
    .eq("course_id", course_id)
    .order("order_index", { ascending: true })

  if (modErr)
    return NextResponse.json({ error: "Could not load modules" }, { status: 500 })

  if (!modules?.length)
    return NextResponse.json({ error: "No modules found for this course" }, { status: 404 })

  const nonExamModules = modules.filter(m => m.module_type !== "final_exam")
  const examModules    = modules.filter(m => m.module_type === "final_exam")

  const failed: string[] = []

  // ── Phase 3: analyze non-exam modules, a few at a time ───────
  // This fired every module's analysis simultaneously. A course has up to ~10
  // modules, and a simultaneous burst against the shared LLM quota is exactly
  // what produces 429s — failing some modules at random. Run in small batches.
  const CONCURRENCY = 3
  const phase3Results: Awaited<ReturnType<typeof runModuleAnalysis>>[] = []
  for (let i = 0; i < nonExamModules.length; i += CONCURRENCY) {
    const batch = nonExamModules.slice(i, i + CONCURRENCY)
    phase3Results.push(...(await Promise.all(batch.map(m => runModuleAnalysis(m.id)))))
  }

  nonExamModules.forEach((m, i) => {
    if (!phase3Results[i].ok) {
      failed.push(`${m.title} (${m.module_type}): ${phase3Results[i].error}`)
    }
  })

  const analyzed = phase3Results.filter(r => r.ok).length

  // ── Phase 4: analyze exam modules sequentially ───────────────
  let exam_analyzed = 0
  for (const examMod of examModules) {
    const result = await runExamAnalysis(examMod.id)
    if (result.ok) {
      exam_analyzed++
    } else {
      failed.push(`${examMod.title} (final_exam): ${result.error}`)
    }
  }

  return NextResponse.json({
    course_id,
    modules_analyzed: analyzed,
    exams_analyzed:   exam_analyzed,
    total_modules:    modules.length,
    failed,
  })
}
