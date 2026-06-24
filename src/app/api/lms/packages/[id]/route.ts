import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/packages/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data, error } = await db
    .from("lms_packages")
    .select(`
      id, module_id, course_id, title, description,
      pass_mark, free_navigation, certificate_on_pass, created_at, updated_at,
      lms_package_items (
        id, package_id, order_index, type, title, config, required, created_at
      )
    `)
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    lms_package_items: [...(data.lms_package_items ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  })
}

// PUT /api/lms/packages/[id]
// Body: { title?, description?, pass_mark?, certificate_on_pass?, items[] }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { title, description, pass_mark, free_navigation, certificate_on_pass, items } = body

  const { error: pkgErr } = await db
    .from("lms_packages")
    .update({
      ...(title               !== undefined && { title }),
      ...(description         !== undefined && { description }),
      ...(pass_mark           !== undefined && { pass_mark }),
      ...(free_navigation     !== undefined && { free_navigation }),
      ...(certificate_on_pass !== undefined && { certificate_on_pass }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  if (Array.isArray(items)) {
    await db.from("lms_package_items").delete().eq("package_id", id)

    if (items.length > 0) {
      const rows = items.map((item: any, i: number) => ({
        package_id:  id,
        order_index: i,
        type:        item.type,
        title:       item.title ?? null,
        config:      item.config ?? {},
        required:    item.required ?? true,
      }))
      const { error: insErr } = await db.from("lms_package_items").insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  const { data, error } = await db
    .from("lms_packages")
    .select(`*, lms_package_items(*)`)
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ...data,
    lms_package_items: [...(data.lms_package_items ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  })
}

// DELETE /api/lms/packages/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { error } = await db.from("lms_packages").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
