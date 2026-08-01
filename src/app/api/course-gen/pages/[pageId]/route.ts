import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// PATCH — autosave one slide. Optimistic concurrency on updated_at: if the
// page changed since the editor loaded it, return 409 with the current row
// so the client can offer reload-or-overwrite rather than silently clobber.
export async function PATCH(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { pageId } = await params
  let body: any
  try { body = await parseBody(req, 2_000_000) } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { data: current } = await db
    .from("cg_pages").select("id, updated_at").eq("id", pageId).single()
  if (!current) return NextResponse.json({ error: "Page not found" }, { status: 404 })

  if (body.base_updated_at && body.base_updated_at !== current.updated_at) {
    const { data: fresh } = await db
      .from("cg_pages")
      .select("id, order_index, layout_kind, background, elements, notes, updated_at")
      .eq("id", pageId).single()
    return NextResponse.json({ error: "conflict", page: fresh }, { status: 409 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("elements" in body)    patch.elements = body.elements
  if ("background" in body)  patch.background = body.background
  if ("layout_kind" in body) patch.layout_kind = body.layout_kind
  if ("notes" in body)       patch.notes = body.notes
  if ("order_index" in body) patch.order_index = body.order_index
  // Any manual edit marks the slide as diverged from its generated blueprint,
  // so the chat agent knows recompiling it would discard the user's work.
  if (body.mark_diverged) patch.manually_diverged = true

  const { data, error } = await db
    .from("cg_pages").update(patch).eq("id", pageId).select("id, updated_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated_at: data.updated_at })
}

// DELETE — remove a slide.
export async function DELETE(_: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { pageId } = await params
  const { error } = await db.from("cg_pages").delete().eq("id", pageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
