import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runModuleAnalysis } from "../_module"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── POST /api/lms/analyze/module ──────────────────────────────────
// Standalone endpoint for analyzing a single non-exam module.
// The course orchestrator calls runModuleAnalysis() directly instead.

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id } = body
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const result = await runModuleAnalysis(module_id)
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.error === "Module not found" ? 404 : 500 })

  return NextResponse.json({ ok: true })
}
