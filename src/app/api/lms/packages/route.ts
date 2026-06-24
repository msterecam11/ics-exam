import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/packages?module_id=xxx  OR  ?course_id=xxx
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get("module_id")
  const courseId = searchParams.get("course_id")

  if (!moduleId && !courseId)
    return NextResponse.json({ error: "module_id or course_id required" }, { status: 400 })

  let query = db
    .from("lms_packages")
    .select(`
      id, module_id, course_id, title, description,
      pass_mark, free_navigation, certificate_on_pass, created_at, updated_at,
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
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { module_id, course_id, title, description, free_navigation, certificate_on_pass, items } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

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

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

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
