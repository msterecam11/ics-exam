import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — latest outline result (for the review UI)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data: job } = await db
    .from("cg_generation_jobs")
    .select("id, status, output, error, current_step, progress_pct, created_at")
    .eq("course_id", id)
    .eq("job_type", "outline")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ job: job ?? null })
}

// POST — enqueue outline generation (first run, or a revision with
// adjustments while in outline_review). Returns immediately; the worker
// loop does the actual Sonnet call.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server yet" }, { status: 503 })

  const { id } = await params
  const body = await parseBody(req).catch(() => ({})) as any

  const { data: course } = await db
    .from("cg_courses").select("id, status").eq("id", id).single()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  if (!["draft", "outline_review", "failed"].includes(course.status))
    return NextResponse.json({ error: `Cannot generate an outline while course is ${course.status}` }, { status: 409 })

  // A revision carries the previous outline + the designer's adjustments.
  let input: Record<string, unknown> = {}
  if (body?.adjustments) {
    const { data: prev } = await db
      .from("cg_generation_jobs")
      .select("output")
      .eq("course_id", id)
      .eq("job_type", "outline")
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    input = { adjustments: String(body.adjustments), previous_outline: prev?.output ?? null }
  }

  const { error: jobErr } = await db.from("cg_generation_jobs").insert({
    course_id: id,
    job_type: "outline",
    status: "queued",
    input,
    current_step: "Queued…",
  })
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })

  await db.from("cg_courses")
    .update({ status: "generating_outline", updated_at: new Date().toISOString() })
    .eq("id", id)

  return NextResponse.json({ ok: true })
}
