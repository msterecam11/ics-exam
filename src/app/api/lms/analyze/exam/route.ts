import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runExamAnalysis } from "../_exam"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── POST /api/lms/analyze/exam ────────────────────────────────────
// Standalone endpoint for analyzing a single final_exam module.
// The course orchestrator calls runExamAnalysis() directly instead.

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id } = body
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const result = await runExamAnalysis(module_id)
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ ok: true })
}
