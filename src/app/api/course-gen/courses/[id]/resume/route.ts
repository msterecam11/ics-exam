import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — resume a failed slide generation from where it stopped.
// The orchestrator stores its cursor on the job row and every finished slide
// is already persisted, so re-queueing continues rather than regenerating.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data: job } = await db
    .from("cg_generation_jobs")
    .select("id, input, attempts")
    .eq("course_id", id)
    .eq("job_type", "orchestrator")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: "No generation to resume" }, { status: 404 })

  const cursor = (job.input as any)?.cursor
  const modIdx = cursor?.module_index ?? 0
  const slideIdx = cursor?.slide_index ?? 0

  // Drop any slides already written at/after the cursor so a partial slide
  // from the interrupted attempt can't duplicate.
  const plan = (job.input as any)?.plan ?? []
  const moduleId = plan[modIdx]?.module_id
  if (moduleId) {
    await db.from("cg_pages").delete().eq("module_id", moduleId).gte("order_index", slideIdx)
  }

  await db.from("cg_generation_jobs").update({
    status: "queued",
    error: null,
    current_step: "Resuming…",
    started_at: null,
  }).eq("id", job.id)

  await db.from("cg_courses")
    .update({ status: "generating_slides", updated_at: new Date().toISOString() })
    .eq("id", id)

  return NextResponse.json({ ok: true, resumed_at: { module_index: modIdx, slide_index: slideIdx } })
}
