import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("cg_themes")
    .select("id, name, is_main, parent_theme_id, tokens, layout_templates, created_at, cg_courses(id)")
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    themes: (data ?? []).map((t: any) => ({
      ...t, course_count: t.cg_courses?.length ?? 0, cg_courses: undefined,
    })),
  })
}

// POST — create a new theme by copying an existing one.
//
// A "variant" inherits its parent's masters (backgrounds, chrome positions,
// content zones) and only overrides tokens — that is what makes a new theme
// cheap: the whole recipe/primitive layer keeps working unchanged, because
// primitives target NAMED ZONES, never coordinates. Building a theme from
// scratch means supplying new backgrounds and zone maps, which is done by
// duplicating and then replacing backgrounds per master.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await parseBody(req, 1_000_000).catch(() => ({})) as any
  const name = String(body.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })

  const { data: parent } = await db
    .from("cg_themes")
    .select("id, tokens, layout_templates")
    .eq("id", body.parent_theme_id ?? "")
    .maybeSingle()

  const base = parent ?? (await db.from("cg_themes").select("id, tokens, layout_templates").eq("is_main", true).single()).data
  if (!base) return NextResponse.json({ error: "No theme to copy from" }, { status: 409 })

  // Token overrides (usually colours) merge over the parent's.
  const tokens = {
    ...(base.tokens as any),
    ...(body.tokens ?? {}),
    colors: { ...((base.tokens as any)?.colors ?? {}), ...(body.tokens?.colors ?? {}) },
  }

  const { data, error } = await db.from("cg_themes").insert({
    name,
    parent_theme_id: base.id,
    is_main: false,
    tokens,
    layout_templates: base.layout_templates,
  }).select("id, name").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ theme: data }, { status: 201 })
}
