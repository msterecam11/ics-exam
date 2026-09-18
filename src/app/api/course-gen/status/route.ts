import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// Pipeline status for the sidebar — deliberately honest: it reports whether
// generation can ACTUALLY run (is a key configured) rather than always
// claiming the agents are ready.
export async function GET() {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res

  const { count } = await db
    .from("cg_generation_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"])

  return NextResponse.json({
    ai_configured: !!process.env.ANTHROPIC_API_KEY,
    image_configured: !!process.env.OPENAI_API_KEY,
    agents: 5,
    queued: count ?? 0,
  })
}
