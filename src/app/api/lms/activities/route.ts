import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/activities?module_id=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id, course_id, activities } = body

  if (!module_id || !course_id || !Array.isArray(activities))
    return NextResponse.json({ error: "module_id, course_id, activities required" }, { status: 400 })

  // Delete existing then insert
  await db.from("lms_module_activities").delete().eq("module_id", module_id)

  if (activities.length === 0)
    return NextResponse.json({ ok: true, activities: [] })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, activities: data })
}
