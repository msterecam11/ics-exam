import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data: course, error } = await db
    .from("cg_courses")
    .select("*, cg_themes(id, name), cg_modules(id, day_number, order_index, title, is_module_zero, target_slide_count, cg_pages(id))")
    .eq("id", id)
    .single()

  if (error || !course) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const modules = ((course as any).cg_modules ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((m: any) => ({ ...m, slide_count: m.cg_pages?.length ?? 0, cg_pages: undefined }))

  // Latest orchestrator-level job for live progress display.
  const { data: latestJob } = await db
    .from("cg_generation_jobs")
    .select("id, job_type, status, progress_pct, current_step, error, created_at")
    .eq("course_id", id)
    .in("job_type", ["orchestrator", "outline"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    course: { ...course, cg_modules: undefined, modules },
    latestJob,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  let body: any
  try { body = await parseBody(req) } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const allowed = [
    "title", "overview", "target_audience", "objectives", "regulatory_framework",
    "language", "tone", "day_count", "theme_id", "partner_name",
    "include_assessment", "prerequisites", "generation_input",
  ]
  const patch: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  patch.updated_at = new Date().toISOString()

  const { error } = await db.from("cg_courses").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { error } = await db.from("cg_courses").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
