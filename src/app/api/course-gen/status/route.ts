import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// Pipeline status for the sidebar — deliberately honest: it reports whether
// generation can ACTUALLY run (is a key configured) rather than always
// claiming the agents are ready.
export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
