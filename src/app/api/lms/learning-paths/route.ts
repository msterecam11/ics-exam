import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — list all learning paths with course count
export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("lms_learning_paths")
    .select("id, title, description, created_at, lms_learning_path_courses(count)")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paths = (data ?? []).map((p: any) => ({
    ...p,
    course_count: p.lms_learning_path_courses?.[0]?.count ?? 0,
    lms_learning_path_courses: undefined,
  }))

  return NextResponse.json(paths)
}

// POST — create learning path
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { title, description } = body
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_learning_paths")
    .insert({ title: title.trim(), description: description?.trim() || null, created_by: session.user.id })
    .select("id, title, description, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, course_count: 0 }, { status: 201 })
}

// PATCH — update title / description
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, title, description, certificate_enabled } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title?.trim())                    updates.title                = title.trim()
  if ("description"          in body)   updates.description          = description?.trim() || null
  if ("certificate_enabled"  in body)   updates.certificate_enabled  = !!certificate_enabled

  const { data, error } = await db
    .from("lms_learning_paths")
    .update(updates)
    .eq("id", id)
    .select("id, title, description, certificate_enabled, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — delete learning path
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await db.from("lms_learning_paths").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
