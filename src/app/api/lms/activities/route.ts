import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// GET /api/lms/activities?module_id=xxx
export async function GET(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const { searchParams } = new URL(req.url)
  const module_id = searchParams.get("module_id")
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_module_activities")
    .select("*")
    .eq("module_id", module_id)
    .order("order_index", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activities: data ?? [] })
}

// POST /api/lms/activities — bulk save (replace all for module)
export async function POST(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { module_id, course_id, activities } = body

  if (!module_id || !course_id || !Array.isArray(activities))
    return NextResponse.json({ error: "module_id, course_id, activities required" }, { status: 400 })

  const { data: mod } = await db.from("lms_modules").select("id").eq("id", module_id).eq("course_id", course_id).maybeSingle()
  if (!mod) return NextResponse.json({ error: "Module not found in this course" }, { status: 404 })

  // This deleted every activity first and then inserted — a failed insert lost
  // them all. Write the new set first; remove the previous rows only after.
  const { data: previous } = await db.from("lms_module_activities").select("id").eq("module_id", module_id)
  const previousIds = (previous ?? []).map((r: any) => r.id)

  if (activities.length === 0) {
    if (previousIds.length) await db.from("lms_module_activities").delete().in("id", previousIds)
    return NextResponse.json({ ok: true, activities: [] })
  }

  const rows = activities.map((a: any, i: number) => ({
    module_id,
    course_id,
    type:            a.type,
    title:           a.title ?? "",
    placement_slide: a.placement_slide ?? 0,
    content:         a.content ?? {},
    ai_generated:    a.ai_generated ?? false,
    difficulty:      a.difficulty ?? "medium",
    order_index:     i,
    updated_at:      new Date().toISOString(),
  }))

  const { data, error } = await db
    .from("lms_module_activities")
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: "Could not save activities; the previous ones were kept" }, { status: 500 })

  if (previousIds.length) await db.from("lms_module_activities").delete().in("id", previousIds)
  return NextResponse.json({ ok: true, activities: data })
}
