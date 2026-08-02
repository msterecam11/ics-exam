import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — queue a PDF export (whole course, or one module). Returns
// immediately; the worker does the rendering so a 400-slide deck never
// runs inside a request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await parseBody(req).catch(() => ({})) as any
  const moduleId: string | null = body.module_id ?? null

  const { data: course } = await db.from("cg_courses").select("id").eq("id", id).single()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  const { data: exp, error: expErr } = await db.from("cg_exports").insert({
    course_id: id,
    module_id: moduleId,
    format: "pdf",
    status: "queued",
  }).select("id").single()
  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 })

  const { error: jobErr } = await db.from("cg_generation_jobs").insert({
    course_id: id,
    module_id: moduleId,
    job_type: "pdf_export",
    status: "queued",
    input: { export_id: exp.id, module_id: moduleId },
    current_step: "Queued for export…",
  })
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })

  return NextResponse.json({ export_id: exp.id })
}

// GET — poll export status / collect the finished file.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data } = await db
    .from("cg_exports")
    .select("id, module_id, status, file_url, created_at")
    .eq("course_id", id)
    .order("created_at", { ascending: false })
    .limit(10)

  return NextResponse.json({ exports: data ?? [] })
}
