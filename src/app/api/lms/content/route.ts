import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

const VALID_TYPES = ["video", "ppt", "pdf", "text", "image", "link", "steps", "quiz", "assignment"] as const
type ContentType = typeof VALID_TYPES[number]

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
// Body: { module_id, title, type, content, download_allowed, is_mandatory, completion_rule, order_index }
// `content` is type-specific JSONB:
//   video:      { url, duration_seconds, chapters: [{label, second}] }
//   ppt:        { url, slide_count }
//   pdf:        { url, page_count }
//   text:       { html_en, html_ar }
//   image:      { url, caption }
//   link:       { url, open_in_tab }
//   steps:      { steps: [{title, body, image_url}] }
//   quiz:       { quiz_id }
//   assignment: { assignment_id }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    module_id, title, type: contentType, content,
    download_allowed, is_mandatory, completion_rule, order_index,
  } = body

  if (!module_id)       return NextResponse.json({ error: "module_id required" }, { status: 400 })
  if (!title?.trim())   return NextResponse.json({ error: "title required" }, { status: 400 })
  if (!contentType)     return NextResponse.json({ error: "type required" }, { status: 400 })
  if (!VALID_TYPES.includes(contentType as ContentType))
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 })

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
      type:             contentType,
      content:          content ?? {},
      download_allowed: download_allowed ?? false,
      is_mandatory:     is_mandatory ?? true,
      completion_rule:  completion_rule ?? { type: "click" },
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
    "title", "type", "content", "download_allowed",
    "is_mandatory", "completion_rule", "order_index",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

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

  const { error } = await db.from("lms_content_items").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
