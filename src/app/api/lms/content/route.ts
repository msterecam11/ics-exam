import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/content?module_id=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get("module_id")
  if (!moduleId) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_content_items")
    .select("*")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create content item
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id, title, content_type, storage_url, external_url,
          duration_seconds, download_allowed, order_index } = body

  if (!module_id)     return NextResponse.json({ error: "module_id required" }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })
  if (!content_type)  return NextResponse.json({ error: "content_type required" }, { status: 400 })

  const validTypes = ["video","pdf","pptx","audio","embed","quiz","link","scorm"]
  if (!validTypes.includes(content_type))
    return NextResponse.json({ error: `content_type must be one of: ${validTypes.join(", ")}` }, { status: 400 })

  // Auto-assign order_index
  let idx = order_index
  if (idx === undefined || idx === null) {
    const { count } = await db
      .from("lms_content_items")
      .select("*", { count: "exact", head: true })
      .eq("module_id", module_id)
    idx = (count ?? 0) + 1
  }

  const { data, error } = await db
    .from("lms_content_items")
    .insert({
      module_id,
      title:            title.trim(),
      content_type,
      storage_url:      storage_url || null,
      external_url:     external_url || null,
      duration_seconds: duration_seconds || null,
      download_allowed: download_allowed ?? false,
      order_index:      idx,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — update content item
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const allowed = [
    "title","content_type","storage_url","external_url",
    "duration_seconds","download_allowed","order_index"
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }
  if (!Object.keys(updates).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db
    .from("lms_content_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove content item
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Warn but don't block if progress exists — admin decision
  const { error } = await db.from("lms_content_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
