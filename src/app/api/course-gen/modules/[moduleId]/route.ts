import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — everything the canvas editor needs for one module in a single call:
// the module's pages, the course's branding, and the theme (masters+tokens)
// the renderer draws chrome from.
export async function GET(_: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { moduleId } = await params

  const { data: mod } = await db
    .from("cg_modules")
    .select("id, title, order_index, is_module_zero, course_id")
    .eq("id", moduleId)
    .single()
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  const [{ data: course }, { data: pages }, { data: siblings }] = await Promise.all([
    db.from("cg_courses")
      .select("id, title, partner_name, partner_logo_light_url, partner_logo_dark_url, cg_themes(id, name, tokens, layout_templates)")
      .eq("id", mod.course_id).single(),
    db.from("cg_pages")
      .select("id, order_index, layout_kind, background, elements, source_content, manually_diverged, needs_review, notes, updated_at")
      .eq("module_id", moduleId).order("order_index"),
    db.from("cg_modules")
      .select("id, title, order_index, is_module_zero")
      .eq("course_id", mod.course_id).order("order_index"),
  ])

  return NextResponse.json({
    module: mod,
    modules: siblings ?? [],
    course: { ...course, cg_themes: undefined },
    theme: (course as any)?.cg_themes ?? null,
    pages: pages ?? [],
  })
}
