import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — approve the reviewed outline: materialize cg_modules rows and
// enqueue the full-generation orchestrator. This is the human gate —
// nothing slide-level exists until this endpoint runs.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data: course } = await db.from("cg_courses").select("id, status").eq("id", id).single()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if (course.status !== "outline_review")
    return NextResponse.json({ error: "Course is not awaiting outline approval" }, { status: 409 })

  const { data: outlineJob } = await db
    .from("cg_generation_jobs")
    .select("id, output")
    .eq("course_id", id)
    .eq("job_type", "outline")
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const outline = outlineJob?.output as any
  if (!outline?.modules?.length)
    return NextResponse.json({ error: "No completed outline to approve" }, { status: 409 })

  // Approving again after an edit-and-regenerate loop replaces prior modules
  // (nothing slide-level exists yet at this stage, so this is safe).
  await db.from("cg_modules").delete().eq("course_id", id)

  const rows = outline.modules.map((m: any, i: number) => ({
    course_id: id,
    day_number: m.day_number ?? null,
    order_index: i,
    title: m.title,
    is_module_zero: !!m.is_module_zero,
    target_slide_count: m.slides?.length ?? null,
  }))
  const { data: inserted, error: modErr } = await db
    .from("cg_modules").insert(rows).select("id, order_index")
  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 500 })

  // Orchestrator input carries the approved outline with each module's new id,
  // so the Phase-5 pipeline knows exactly what to generate per module.
  const moduleIdByIndex = new Map((inserted ?? []).map((r: any) => [r.order_index, r.id]))
  const approvedPlan = outline.modules.map((m: any, i: number) => ({
    module_id: moduleIdByIndex.get(i),
    ...m,
  }))

  const { error: jobErr } = await db.from("cg_generation_jobs").insert({
    course_id: id,
    job_type: "orchestrator",
    status: "queued",
    input: { phase: "full", plan: approvedPlan },
    current_step: "Queued for slide generation…",
  })
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })

  await db.from("cg_courses")
    .update({ status: "generating_slides", updated_at: new Date().toISOString() })
    .eq("id", id)

  return NextResponse.json({ ok: true, modules: inserted?.length ?? 0 })
}
