// Course categories (Step 10). Any staff account may read them — they fill the
// dropdown on the course settings screen and group the Courses page. Creating,
// renaming, reordering and archiving is an admin job.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { CATEGORY_COLUMNS, listCategories } from "@/lib/lms-catalogue"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const name = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const optText = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

// GET /api/lms/categories?active=1 — with how many courses are in each.
export async function GET(req: Request) {
  const g = await guardStaff()
  if (!g.ok) return g.res

  const activeOnly = new URL(req.url).searchParams.get("active") === "1"
  const categories = await listCategories({ activeOnly })

  const { data: courses } = await db.from("lms_courses").select("category_id, status")
  const counts = new Map<string, { total: number; published: number }>()
  let uncategorised = 0
  for (const c of (courses ?? []) as any[]) {
    if (!c.category_id) { uncategorised++; continue }
    const cur = counts.get(c.category_id) ?? { total: 0, published: 0 }
    cur.total++
    if (c.status === "published") cur.published++
    counts.set(c.category_id, cur)
  }

  return NextResponse.json({
    categories: categories.map(k => ({ ...k, ...(counts.get(k.id) ?? { total: 0, published: 0 }) })),
    uncategorised,
  })
}

// POST /api/lms/categories — admin only
export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res

  const body = await req.json().catch(() => ({}))
  const n = name(body.name)
  if (!n) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (n.length > 80) return NextResponse.json({ error: "That name is too long" }, { status: 400 })

  // Put a new one at the end rather than at the top.
  const { data: last } = await db.from("lms_course_categories")
    .select("order_index").order("order_index", { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db.from("lms_course_categories").insert({
    name: n,
    description: optText(body.description, 500),
    image_url: optText(body.image_url, 500),
    colour: optText(body.colour, 20),
    order_index: ((last as any)?.order_index ?? 0) + 10,
    created_by: g.session.id,
  }).select(CATEGORY_COLUMNS).single()

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Could not create the category" }, { status: 500 })
  }
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.category.create", "lms_course_category", (data as any).id, n)
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/lms/categories — admin only.
// Either one category's fields, or { order: [id, id, …] } to reorder.
export async function PATCH(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))

  if (Array.isArray(body.order)) {
    const ids = body.order.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x))
    for (const [i, id] of ids.entries())
      await db.from("lms_course_categories").update({ order_index: (i + 1) * 10, updated_at: new Date().toISOString() }).eq("id", id)
    return NextResponse.json({ ok: true, reordered: ids.length })
  }

  const id = body.id
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const n = name(body.name)
    if (!n) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    updates.name = n
  }
  if (body.description !== undefined) updates.description = optText(body.description, 500)
  if (body.image_url !== undefined)   updates.image_url = optText(body.image_url, 500)
  if (body.colour !== undefined)      updates.colour = optText(body.colour, 20)
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active

  const { data, error } = await db.from("lms_course_categories").update(updates).eq("id", id).select(CATEGORY_COLUMNS).single()
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Could not save the category" }, { status: 500 })
  }
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.category.update", "lms_course_category", id, (data as any).name, { fields: Object.keys(updates) })
  return NextResponse.json(data)
}

// DELETE /api/lms/categories?id=… — admin only, and only when it's empty.
// Archiving (is_active=false) is the way to retire one that still has courses,
// so nothing silently loses its category.
export async function DELETE(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res

  const id = new URL(req.url).searchParams.get("id")
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { count } = await db.from("lms_courses").select("id", { count: "exact", head: true }).eq("category_id", id)
  if ((count ?? 0) > 0)
    return NextResponse.json({
      error: `That category still holds ${count} course${count === 1 ? "" : "s"}. Move them first, or archive the category instead.`,
    }, { status: 409 })

  const { data: was } = await db.from("lms_course_categories").select("name").eq("id", id).maybeSingle()
  const { error } = await db.from("lms_course_categories").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete the category" }, { status: 500 })
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.category.delete", "lms_course_category", id, (was as any)?.name ?? null)
  return NextResponse.json({ ok: true })
}
