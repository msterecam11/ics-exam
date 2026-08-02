import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"
import { stampMaster } from "@/lib/course-gen/stampMaster"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — add a slide from a master ("Add slide" in the editor), or duplicate
// an existing one. New slides start as the master's stamped placeholders;
// the AI chat can fill them in afterwards.
export async function POST(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { moduleId } = await params
  const body = await parseBody(req, 2_000_000).catch(() => ({})) as any
  const afterIndex: number | null = typeof body.after_index === "number" ? body.after_index : null

  // Resolve the module's theme so the new slide starts with this master's
  // own title/content boxes rather than an empty rectangle.
  const { data: mod } = await db
    .from("cg_modules")
    .select("id, cg_courses(cg_themes(tokens, layout_templates))")
    .eq("id", moduleId).single()
  const theme = (mod as any)?.cg_courses?.cg_themes
  const layoutKind = body.layout_kind ?? "content_white"
  const master = theme?.layout_templates?.[layoutKind]

  const { data: existing } = await db
    .from("cg_pages").select("id, order_index").eq("module_id", moduleId).order("order_index")
  const pages = existing ?? []
  const insertAt = afterIndex === null ? pages.length : afterIndex + 1

  // Shift everything at/after the insert point down one slot.
  for (const p of pages.filter(p => p.order_index >= insertAt).reverse()) {
    await db.from("cg_pages").update({ order_index: p.order_index + 1 }).eq("id", p.id)
  }

  const { data, error } = await db.from("cg_pages").insert({
    module_id: moduleId,
    order_index: insertAt,
    layout_kind: layoutKind,
    background: body.background ?? {},
    elements: body.elements
      ?? (master ? stampMaster(master, theme.tokens, layoutKind) : []),
    source_content: body.source_content ?? { intent: "blank_master", layout_kind: body.layout_kind ?? "content_white" },
    manually_diverged: true,
  }).select("id, order_index, layout_kind, background, elements, source_content, manually_diverged, notes, updated_at").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ page: data }, { status: 201 })
}

// PUT — persist a reorder (the editor sends the full ordered id list).
export async function PUT(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { moduleId } = await params
  const body = await parseBody(req).catch(() => ({})) as any
  const ids: string[] = Array.isArray(body.order) ? body.order : []
  if (ids.length === 0) return NextResponse.json({ error: "order required" }, { status: 400 })

  // Two-pass to dodge the unique-ish ordering collisions during the shuffle.
  for (let i = 0; i < ids.length; i++) {
    await db.from("cg_pages").update({ order_index: 10_000 + i }).eq("id", ids[i]).eq("module_id", moduleId)
  }
  for (let i = 0; i < ids.length; i++) {
    await db.from("cg_pages").update({ order_index: i }).eq("id", ids[i]).eq("module_id", moduleId)
  }
  return NextResponse.json({ ok: true })
}
