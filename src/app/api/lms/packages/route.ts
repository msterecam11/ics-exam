import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// GET /api/lms/packages?module_id=xxx  OR  ?course_id=xxx
export async function GET(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get("module_id")
  const courseId = searchParams.get("course_id")

  if (!moduleId && !courseId)
    return NextResponse.json({ error: "module_id or course_id required" }, { status: 400 })

  let query = db
    .from("lms_packages")
    .select(`
      id, module_id, course_id, title, description,
      pass_mark, free_navigation, certificate_on_pass, slides_downloadable, created_at, updated_at,
      lms_package_items (
        id, package_id, order_index, type, title, config, required, created_at
      )
    `)

  if (moduleId) query = query.eq("module_id", moduleId)
  if (courseId)  query = query.eq("course_id", courseId)

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map(pkg => ({
    ...pkg,
    lms_package_items: [...(pkg.lms_package_items ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  }))

  return NextResponse.json(moduleId ? (result[0] ?? null) : result)
}

// POST /api/lms/packages
// Body: { module_id, course_id, title, description, pass_mark, certificate_on_pass, items[] }
export async function POST(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json()
  const { module_id, course_id, title, description, free_navigation, certificate_on_pass, items } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  if (module_id) {
    // The module must belong to the course the package is being filed under.
    const { data: mod } = await db
      .from("lms_modules").select("id").eq("id", module_id).eq("course_id", course_id).maybeSingle()
    if (!mod) return NextResponse.json({ error: "Module not found in this course" }, { status: 404 })

    // One package per module (also enforced by a unique index for the race).
    // Creating a second one would hide the first — and all student progress on
    // it — because the editor and player load a single package per module.
    const { data: already } = await db
      .from("lms_packages").select("id").eq("module_id", module_id).maybeSingle()
    if (already)
      return NextResponse.json({ error: "This module already has a package. Reload the editor to continue.", id: already.id }, { status: 409 })
  }

  const { data: pkg, error: pkgErr } = await db
    .from("lms_packages")
    .insert({
      module_id:           module_id ?? null,
      course_id,
      title:               title ?? "",
      description:         description ?? null,
      free_navigation:     free_navigation ?? false,
      certificate_on_pass: certificate_on_pass ?? false,
    })
    .select()
    .single()

  if (pkgErr) {
    // 23505: lost a race with a concurrent create for the same module.
    if ((pkgErr as any).code === "23505")
      return NextResponse.json({ error: "This module already has a package. Reload the editor to continue." }, { status: 409 })
    return NextResponse.json({ error: "Could not create package" }, { status: 500 })
  }

  if (Array.isArray(items) && items.length > 0) {
    const rows = items.map((item: any, i: number) => ({
      package_id:  pkg.id,
      order_index: item.order_index ?? i,
      type:        item.type,
      title:       item.title ?? null,
      config:      item.config ?? {},
      required:    item.required ?? true,
    }))
    const { error: itemErr } = await db.from("lms_package_items").insert(rows)
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  }

  const { data: full, error: fullErr } = await db
    .from("lms_packages")
    .select(`*, lms_package_items(*)`)
    .eq("id", pkg.id)
    .single()

  if (fullErr) return NextResponse.json({ error: fullErr.message }, { status: 500 })
  return NextResponse.json(full, { status: 201 })
}
