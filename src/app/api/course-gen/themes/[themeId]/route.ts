import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export async function GET(_: Request, { params }: { params: Promise<{ themeId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { themeId } = await params
  const { data, error } = await db
    .from("cg_themes")
    .select("id, name, is_main, parent_theme_id, tokens, layout_templates, created_at, cg_courses(id, title, status)")
    .eq("id", themeId).single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    theme: { ...data, cg_courses: undefined },
    courses: (data as any).cg_courses ?? [],
  })
}

// PATCH — rename, or edit tokens / a single master's definition.
// Editing a master is how a theme's chrome and zones are tuned; changes take
// effect everywhere immediately because slides render chrome FROM the theme
// rather than storing a copy.
export async function PATCH(req: Request, { params }: { params: Promise<{ themeId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { themeId } = await params
  const body = await parseBody(req, 2_000_000).catch(() => ({})) as any

  const { data: theme } = await db
    .from("cg_themes").select("id, is_main, tokens, layout_templates").eq("id", themeId).single()
  if (!theme) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim()

  if (body.colors && typeof body.colors === "object") {
    patch.tokens = {
      ...(theme.tokens as any),
      colors: { ...((theme.tokens as any)?.colors ?? {}), ...body.colors },
    }
  }

  // { master: "content_white", definition: {...} }
  if (body.master && body.definition) {
    patch.layout_templates = {
      ...(theme.layout_templates as any),
      [body.master]: body.definition,
    }
  }

  const { error } = await db.from("cg_themes").update(patch).eq("id", themeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ themeId: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { themeId } = await params
  const { data: theme } = await db
    .from("cg_themes").select("id, is_main, cg_courses(id)").eq("id", themeId).single()
  if (!theme) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (theme.is_main)
    return NextResponse.json({ error: "The main theme cannot be deleted" }, { status: 409 })
  if (((theme as any).cg_courses ?? []).length > 0)
    return NextResponse.json({ error: "This theme is in use by existing courses" }, { status: 409 })

  const { error } = await db.from("cg_themes").delete().eq("id", themeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
