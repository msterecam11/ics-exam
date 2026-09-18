import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// GET /api/lms/module-analysis?module_id=xxx
export async function GET(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res

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
