import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/module-analysis?module_id=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const module_id = searchParams.get("module_id")
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_module_analysis")
    .select("id, module_id, analysis, analyzed_at")
    .eq("module_id", module_id)
    .single()

  if (error || !data) return NextResponse.json({ analysis: null })
  return NextResponse.json({ analysis: data.analysis, analyzed_at: data.analyzed_at })
}
