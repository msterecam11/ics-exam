import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── POST /api/lms/analyze/course ─────────────────────────────────
// Orchestrates the full AI analysis for a course:
//   Phase 3 (parallel): analyze all non-exam modules
//   Phase 4 (sequential): analyze exam module(s) using Phase 3 output
//
// Body: { course_id }
// Returns: { analyzed: number, failed: string[], exam_analyzed: boolean }

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { course_id } = body
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // Fetch all modules for this course
  const { data: modules, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, module_type")
    .eq("course_id", course_id)
    .order("order_index", { ascending: true })

  if (modErr)
    return NextResponse.json({ error: modErr.message }, { status: 500 })

  if (!modules?.length)
    return NextResponse.json({ error: "No modules found for this course" }, { status: 404 })

  const nonExamModules = modules.filter(m => m.module_type !== "final_exam")
  const examModules    = modules.filter(m => m.module_type === "final_exam")

  // Derive origin from the incoming request so this works in all environments.
  // Forward the cookie header so the sub-routes can authenticate the user.
  const { origin } = new URL(req.url)
  const cookieHeader = req.headers.get("cookie") ?? ""

  const internalHeaders = {
    "Content-Type": "application/json",
    "Cookie": cookieHeader,
  }

  // Helper: call an internal analyze route
  async function callAnalyze(route: string, module_id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${origin}${route}`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({ module_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "unknown error" }
    }
  }

  // ── Phase 3: analyze all non-exam modules in parallel ────────
  const phase3Results = await Promise.all(
    nonExamModules.map(m => callAnalyze("/api/lms/analyze/module", m.id))
  )

  const failed: string[] = []
  nonExamModules.forEach((m, i) => {
    if (!phase3Results[i].ok) {
      failed.push(`${m.title} (${m.module_type}): ${phase3Results[i].error}`)
    }
  })

  const analyzed = phase3Results.filter(r => r.ok).length

  // ── Phase 4: analyze exam modules sequentially ───────────────
  let exam_analyzed = 0
  for (const examMod of examModules) {
    const result = await callAnalyze("/api/lms/analyze/exam", examMod.id)
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
