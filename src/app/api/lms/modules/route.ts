import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/modules?course_id=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_modules")
    .select(`
      id, course_id, title, description, delivery_type, order_index,
      estimated_duration, prerequisite_module_id, min_attendance_pct, created_at,
      lms_content_items(id, title, type, order_index, download_allowed, is_mandatory, completion_rule, content)
    `)
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create module
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    course_id, title, description, delivery_type, order_index,
    estimated_duration, prerequisite_module_id, min_attendance_pct,
  } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })

  // Auto-assign order_index if not provided
  let idx = order_index
  if (idx === undefined || idx === null) {
    const { count } = await db
      .from("lms_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
    idx = (count ?? 0) + 1
  }

  const { data, error } = await db
    .from("lms_modules")
    .insert({
      course_id,
      title:                 title.trim(),
      description:           description?.trim() || null,
      delivery_type:         delivery_type ?? "online",
      order_index:           idx,
      estimated_duration:    estimated_duration || null,
      prerequisite_module_id: prerequisite_module_id || null,
      min_attendance_pct:    min_attendance_pct || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — update module
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const allowed = [
    "title", "description", "delivery_type", "order_index",
    "estimated_duration", "prerequisite_module_id", "min_attendance_pct",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  const { data, error } = await db
    .from("lms_modules")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove module (only if no student progress)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { count } = await db
    .from("lms_progress")
    .select("*", { count: "exact", head: true })
    .eq("module_id", id)

  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: "Cannot delete — students have progress on this module" },
      { status: 409 }
    )

  const { error } = await db.from("lms_modules").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
