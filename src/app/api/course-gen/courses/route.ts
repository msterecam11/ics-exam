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
    .from("cg_courses")
    .select("id, title, overview, regulatory_framework, language, day_count, status, partner_name, created_at, updated_at, cg_modules(id, cg_pages(id))")
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const courses = (data ?? []).map((c: any) => {
    const modules = c.cg_modules ?? []
    return {
      ...c,
      module_count: modules.length,
      slide_count: modules.reduce((s: number, m: any) => s + (m.cg_pages?.length ?? 0), 0),
      cg_modules: undefined,
    }
  })
  return NextResponse.json({ courses })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: any
  try { body = await parseBody(req) } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const title = (body.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "Course name is required" }, { status: 400 })

  // Default to the main theme when none picked.
  let themeId = body.theme_id ?? null
  if (!themeId) {
    const { data: mainTheme } = await db.from("cg_themes").select("id").eq("is_main", true).limit(1).maybeSingle()
    themeId = mainTheme?.id ?? null
  }

  const { data, error } = await db
    .from("cg_courses")
    .insert({
      title,
      overview: body.overview ?? null,
      target_audience: body.target_audience ?? null,
      objectives: Array.isArray(body.objectives) ? body.objectives : [],
      regulatory_framework: body.regulatory_framework ?? null,
      language: ["en", "ar", "both"].includes(body.language) ? body.language : "en",
      tone: body.tone ?? null,
      day_count: Number.isFinite(body.day_count) ? body.day_count : null,
      theme_id: themeId,
      partner_name: body.partner_name ?? null,
      include_assessment: body.include_assessment !== false,
      prerequisites: body.prerequisites ?? null,
      // The full form snapshot every downstream agent works from —
      // includes the per-module breakdown (modules: [{title, slide_count}]).
      generation_input: body.generation_input ?? body,
      created_by: session.user.id ?? null,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
